// Fava HTTP client over Obsidian's requestUrl (no CORS, works on mobile).
// All ledger access goes through the fava API — the plugin never touches files.

import { requestUrl, type RequestUrlResponse } from 'obsidian';
import { parseCsv } from './csv';

export class FavaError extends Error {
	constructor(
		message: string,
		readonly status: number,
		readonly path: string,
	) {
		super(message);
		this.name = 'FavaError';
	}

	/** True when the URL is missing or the server could not be reached. */
	get isUnreachable(): boolean {
		return this.status === 0;
	}
}

export interface LedgerMeta {
	accounts: string[];
	payees: string[];
	tags: string[];
	currencies: string[];
	include: string[];
}

export interface SourceFile {
	file_path: string;
	sha256sum: string;
	source: string;
}

const REQUEST_TIMEOUT_MS = 20_000;
/** Fava is a small single-process server; too many parallel queries slow it down. */
export const DEFAULT_CONCURRENCY = 6;

/** Simple promise semaphore. */
export class Limiter {
	private active = 0;
	private readonly queue: (() => void)[] = [];
	constructor(private readonly max: number) {}
	async run<T>(fn: () => Promise<T>): Promise<T> {
		if (this.active >= this.max) await new Promise<void>((r) => this.queue.push(r));
		this.active++;
		try {
			return await fn();
		} finally {
			this.active--;
			this.queue.shift()?.();
		}
	}
}

export function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
	let timer: number | undefined;
	const timeout = new Promise<never>((_, reject) => {
		timer = window.setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms);
	});
	return Promise.race([p, timeout]).finally(() => {
		if (timer !== undefined) window.clearTimeout(timer);
	});
}

function asRecord(v: unknown): Record<string, unknown> {
	return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
}

function strings(v: unknown): string[] {
	return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

export class FavaClient {
	private readonly limiter: Limiter;
	/** Request counters for progress UI; reset by the store at the start of a load. */
	readonly stats = { started: 0, finished: 0 };
	onProgress: (() => void) | null = null;

	/** baseUrl is a getter so settings changes apply without rebuilding the client. */
	constructor(
		private readonly baseUrl: () => string,
		concurrency = DEFAULT_CONCURRENCY,
	) {
		this.limiter = new Limiter(Math.max(1, concurrency));
	}

	/** Input URL → base with the ledger slug resolved (cached per input). */
	private resolved: { input: string; base: string } | null = null;
	private resolving: { input: string; p: Promise<string> } | null = null;

	private input(): string {
		return this.baseUrl().trim().replace(/\/+$/, '');
	}

	/**
	 * Fava serves one or more ledgers under `/<slug>/`. If the configured URL
	 * points at the server root, discover the first slug from the index page so
	 * users can paste either form.
	 */
	resolveBase(): Promise<string> {
		const input = this.input();
		if (this.resolved && this.resolved.input === input) return Promise.resolve(this.resolved.base);
		if (!input) return Promise.reject(new FavaError('Fava URL is not configured', 0, '/'));
		// One probe per input, shared by every concurrent request.
		if (this.resolving && this.resolving.input === input) return this.resolving.p;
		const p = this.detectBase(input).finally(() => {
			if (this.resolving?.p === p) this.resolving = null;
		});
		this.resolving = { input, p };
		return p;
	}

	private async detectBase(input: string): Promise<string> {
		const probe = async (base: string): Promise<boolean> => {
			try {
				const r = await withTimeout(
					requestUrl({ url: `${base}/api/ledger_data`, throw: false }),
					REQUEST_TIMEOUT_MS,
					'Fava probe',
				);
				return r.status === 200 && typeof asRecord(r.json).data === 'object';
			} catch {
				return false;
			}
		};
		let base = input;
		if (!(await probe(input))) {
			try {
				const index = await withTimeout(
					requestUrl({ url: `${input}/`, throw: false }),
					REQUEST_TIMEOUT_MS,
					'Fava index',
				);
				// First path segment of any absolute link; the redirect stub and the
				// ledger pages both link under /<slug>/.
				const counts = new Map<string, number>();
				for (const m of index.text.matchAll(/href="\/([A-Za-z0-9._-]+)\//g)) {
					const seg = m[1] ?? '';
					if (!seg || ['static', 'api', 'download-query', 'jump', 'extension'].includes(seg)) continue;
					counts.set(seg, (counts.get(seg) ?? 0) + 1);
				}
				const slug = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
				if (slug && (await probe(`${input}/${slug}`))) base = `${input}/${slug}`;
			} catch {
				/* fall through: errors surface on the real request */
			}
		}
		this.resolved = { input, base };
		return base;
	}

	/** The URL currently in use (after slug detection), for display. */
	get resolvedUrl(): string | null {
		return this.resolved?.base ?? null;
	}

	private async request(
		path: string,
		init?: { method?: 'GET' | 'PUT'; body?: string },
	): Promise<RequestUrlResponse> {
		if (!this.input()) {
			throw new FavaError('Fava URL is not configured', 0, path);
		}
		const base = await this.resolveBase();
		let res: RequestUrlResponse;
		this.stats.started++;
		try {
			res = await this.limiter.run(() =>
				withTimeout(
					requestUrl({
						url: `${base}${path}`,
						method: init?.method ?? 'GET',
						body: init?.body,
						contentType: init?.body !== undefined ? 'application/json' : undefined,
						throw: false,
					}),
					REQUEST_TIMEOUT_MS,
					`Fava ${path.split('?')[0] ?? path}`,
				),
			);
		} catch (e) {
			throw new FavaError(
				`Could not reach Fava: ${e instanceof Error ? e.message : String(e)}`,
				0,
				path,
			);
		} finally {
			this.stats.finished++;
			this.onProgress?.();
		}
		if (res.status >= 400) {
			const short = path.split('?')[0] ?? path;
			if (res.status === 404 && short === '/api/ledger_data') {
				throw new FavaError(
					`Fava returned 404 for ${base}/api/ledger_data. The URL must include the ledger name, e.g. ${base}/my-ledger.`,
					404,
					path,
				);
			}
			throw new FavaError(`Fava ${res.status} on ${short}: ${res.text.slice(0, 300)}`, res.status, path);
		}
		return res;
	}

	async getLedgerData(): Promise<LedgerMeta> {
		const res = await this.request('/api/ledger_data');
		const d = asRecord(asRecord(res.json).data);
		return {
			accounts: strings(d.accounts),
			payees: strings(d.payees),
			tags: strings(d.tags),
			currencies: strings(d.currencies),
			include: strings(asRecord(d.options).include),
		};
	}

	async getPayeeAccounts(payee: string): Promise<string[]> {
		const res = await this.request(`/api/payee_accounts?payee=${encodeURIComponent(payee)}`);
		return strings(asRecord(res.json).data);
	}

	/**
	 * Run BQL via the CSV download route; returns rows WITHOUT the header.
	 *
	 * Aggregate columns (sum(position) etc.) are emitted by fava as one CSV
	 * column PER CURRENCY, in arbitrary order. We collapse those to a single
	 * trailing USD column so callers can index positionally: all non-currency
	 * columns in order, then the USD value (empty string if none).
	 */
	async runQuery(bql: string): Promise<string[][]> {
		const res = await this.request(
			`/download-query/query_result.csv?query_string=${encodeURIComponent(bql)}`,
		);
		const rows = parseCsv(res.text);
		const header = rows[0];
		if (!header) return [];
		const isCurrencyCol = (h: string) => /\([A-Z0-9._-]+\)\s*$/.test(h);
		const currencyIdx = new Set(
			header.map((h, i) => (isCurrencyCol(h) ? i : -1)).filter((i) => i >= 0),
		);
		if (currencyIdx.size === 0) return rows.slice(1);
		const usdIdx = header.findIndex((h) => /\(USD\)\s*$/.test(h));
		return rows.slice(1).map((r) => {
			const base = r.filter((_, i) => !currencyIdx.has(i));
			base.push(usdIdx >= 0 ? (r[usdIdx] ?? '') : '');
			return base;
		});
	}

	async getSource(filename: string): Promise<SourceFile> {
		const q = encodeURIComponent(filename);
		const res = await this.request(`/api/source?filename=${q}&file_path=${q}`);
		const d = asRecord(asRecord(res.json).data);
		return {
			file_path: typeof d.file_path === 'string' ? d.file_path : filename,
			sha256sum: typeof d.sha256sum === 'string' ? d.sha256sum : '',
			source: typeof d.source === 'string' ? d.source : '',
		};
	}

	async putSource(filePath: string, source: string, sha256sum: string): Promise<void> {
		// Send both key names — the param was renamed across fava versions.
		await this.request('/api/source', {
			method: 'PUT',
			body: JSON.stringify({ file_path: filePath, filename: filePath, source, sha256sum }),
		});
	}
}

/** Parse a fava CSV number/position cell ("1480.0", "-24.98", "") → number. */
export function parseNum(cellText: string | undefined): number {
	if (!cellText) return 0;
	const m = cellText.replace(/,/g, '').match(/-?\d+(\.\d+)?/);
	return m ? parseFloat(m[0]) : 0;
}
