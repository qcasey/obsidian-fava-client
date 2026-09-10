// Snapshot store shared by the dashboard, embedded cards and inline values.
// Stale-while-revalidate: cached query rows give an instant snapshot, live
// queries run in the background, and every arriving result triggers a cheap
// recompute so cards fill in one by one.

import { Events, type EventRef } from 'obsidian';
import type { DomainConfig } from '../lib/config';
import { FavaClient, type LedgerMeta, type QueryRunner } from '../lib/fava-client';
import { computeMetrics } from '../lib/metrics';
import { computeRecurring } from '../lib/recurring';
import type { Snapshot } from '../types';
import { QueryCache, keyParts, type KeyParts } from './query-cache';

export type StoreStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface CachePersistence {
	read(): Promise<string | null>;
	write(text: string): Promise<void>;
	remove(): Promise<void>;
}

const LEDGER_META_TTL_MS = 5 * 60_000;
const RECOMPUTE_DEBOUNCE_MS = 120;

export class DataStore extends Events {
	snapshot: Snapshot | null = null;
	status: StoreStatus = 'idle';
	error: Error | null = null;
	/** True while a background refresh is replacing a visible snapshot. */
	get updating(): boolean {
		return this.status === 'loading' && this.snapshot !== null;
	}

	/** Roughly how many queries one full load issues (for the progress label). */
	static readonly EXPECTED_QUERIES = 32;

	private cache = new QueryCache();
	private inflight: Promise<Snapshot> | null = null;
	private ledger: { meta: LedgerMeta; at: number } | null = null;
	private ledgerInflight: Promise<LedgerMeta> | null = null;

	constructor(
		readonly client: FavaClient,
		private readonly deps: { cfg: () => DomainConfig; ttlMs: () => number; persist?: CachePersistence },
	) {
		super();
		let last = 0;
		client.onProgress = () => {
			const now = Date.now();
			if (now - last < 250 || this.status !== 'loading' || this.snapshot) return;
			last = now;
			this.emit();
		};
	}

	onChange(cb: () => void): EventRef {
		return this.on('change', cb);
	}

	private emit(): void {
		this.trigger('change');
	}

	get progress(): { done: number; total: number } {
		return { done: this.client.stats.finished, total: Math.max(DataStore.EXPECTED_QUERIES, this.client.stats.started) };
	}

	isFresh(): boolean {
		return this.snapshot !== null && Date.now() - this.snapshot.loadedAt < this.deps.ttlMs();
	}

	/** Cached snapshot if fresh, otherwise a (deduplicated) load. */
	ensure(): Promise<Snapshot> {
		if (this.snapshot && this.isFresh()) return Promise.resolve(this.snapshot);
		return this.refresh();
	}

	/** Force a reload; concurrent callers share the same request. */
	refresh(): Promise<Snapshot> {
		if (this.inflight) return this.inflight;
		this.inflight = this.load().finally(() => {
			this.inflight = null;
		});
		return this.inflight;
	}

	/** Drop everything (URL or config changed). */
	invalidate(): void {
		this.snapshot = null;
		this.ledger = null;
		this.error = null;
		this.status = 'idle';
		this.cache.clear();
		void this.deps.persist?.remove().catch(() => undefined);
		this.emit();
	}

	invalidateLedger(): void {
		this.ledger = null;
	}

	/** Re-render consumers without refetching. */
	notify(): void {
		this.emit();
	}

	getLedgerMeta(force = false): Promise<LedgerMeta> {
		if (!force && this.ledger && Date.now() - this.ledger.at < LEDGER_META_TTL_MS) {
			return Promise.resolve(this.ledger.meta);
		}
		if (this.ledgerInflight) return this.ledgerInflight;
		this.ledgerInflight = this.client
			.getLedgerData()
			.then((meta) => {
				this.ledger = { meta, at: Date.now() };
				return meta;
			})
			.finally(() => {
				this.ledgerInflight = null;
			});
		return this.ledgerInflight;
	}

	/** Restore the on-disk query cache and show a snapshot from it right away. */
	async hydrate(): Promise<void> {
		const text = await this.deps.persist?.read().catch(() => null);
		const cache = text ? QueryCache.fromJSON(text) : null;
		if (!cache || cache.size === 0) return;
		this.cache = cache;
		const snap = await this.computeFromCache(cache.savedAt).catch(() => null);
		if (snap && !this.snapshot) {
			this.snapshot = snap;
			this.status = 'ready';
			this.emit();
		}
	}

	/** Pure recompute from cached rows only; throws on a cache miss. */
	private computeFromCache(loadedAt: number): Promise<Snapshot> {
		const runner: QueryRunner = {
			runQuery: (bql) => {
				const rows = this.cache.getNear(keyParts(bql));
				return rows ? Promise.resolve(rows) : Promise.reject(new Error('cache miss'));
			},
		};
		const cfg = this.deps.cfg();
		return Promise.all([computeMetrics(runner, cfg), computeRecurring(runner, cfg)]).then(
			([metrics, recurring]) => ({ metrics, recurring, loadedAt }),
		);
	}

	private async load(): Promise<Snapshot> {
		this.status = 'loading';
		this.client.stats.started = 0;
		this.client.stats.finished = 0;
		this.emit();

		const cfg = this.deps.cfg();
		const seen = new Set<string>();
		const fresh = new Set<string>();
		const fetches = new Map<string, Promise<void>>();
		let firstError = null as Error | null;
		let recomputeTimer: number | null = null;
		let recomputeChain: Promise<void> = Promise.resolve();

		const scheduleRecompute = () => {
			if (!this.snapshot) return; // first-ever load: nothing stale to improve on
			if (recomputeTimer !== null) window.clearTimeout(recomputeTimer);
			recomputeTimer = window.setTimeout(() => {
				recomputeTimer = null;
				recomputeChain = recomputeChain.then(async () => {
					const snap = await this.computeFromCache(this.snapshot?.loadedAt ?? Date.now()).catch(() => null);
					if (snap && this.status === 'loading') {
						this.snapshot = snap;
						this.emit();
					}
				});
			}, RECOMPUTE_DEBOUNCE_MS);
		};

		const fetchOne = (bql: string, parts: KeyParts): Promise<void> => {
			let p = fetches.get(parts.key);
			if (!p) {
				p = this.client
					.runQuery(bql)
					.then((rows) => {
						this.cache.set(parts, rows);
						fresh.add(parts.key);
						scheduleRecompute();
					})
					.catch((e: unknown) => {
						firstError ??= e instanceof Error ? e : new Error(String(e));
					});
				fetches.set(parts.key, p);
			}
			return p;
		};

		// Serves cached rows immediately (kicking off the live query) or waits
		// for the live query when nothing is cached yet.
		const runner: QueryRunner = {
			runQuery: async (bql) => {
				const parts = keyParts(bql);
				seen.add(parts.key);
				const p = fetchOne(bql, parts);
				if (!fresh.has(parts.key)) {
					const stale = this.cache.getNear(parts);
					if (stale) return stale;
				}
				await p;
				const rows = this.cache.get(parts.key);
				if (!rows) throw firstError instanceof Error ? firstError : new Error('Query failed');
				return rows;
			},
		};

		try {
			const [metrics, recurring] = await Promise.all([computeMetrics(runner, cfg), computeRecurring(runner, cfg)]);
			if (!this.snapshot) {
				// Cold start: this pass already waited for every live query.
				this.snapshot = { metrics, recurring, loadedAt: Date.now() };
				this.emit();
			}
			await Promise.all(fetches.values());
			if (recomputeTimer !== null) {
				window.clearTimeout(recomputeTimer);
				recomputeTimer = null;
			}
			await recomputeChain;
			if (firstError) throw firstError;
			const final = await this.computeFromCache(Date.now());
			this.snapshot = final;
			this.error = null;
			this.status = 'ready';
			this.cache.prune(seen);
			this.cache.savedAt = final.loadedAt;
			void this.deps.persist?.write(JSON.stringify(this.cache.toJSON())).catch(() => undefined);
			return final;
		} catch (e) {
			this.error = e instanceof Error ? e : new Error(String(e));
			this.status = 'error';
			throw this.error;
		} finally {
			this.emit();
		}
	}
}
