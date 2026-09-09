// In-memory snapshot cache shared by the dashboard, embedded cards and inline
// values. Replaces the web app's unstable_cache wrappers.

import { Events, type EventRef } from 'obsidian';
import type { DomainConfig } from '../lib/config';
import { FavaClient, type LedgerMeta } from '../lib/fava-client';
import { computeMetrics } from '../lib/metrics';
import { computeRecurring } from '../lib/recurring';
import type { Snapshot } from '../types';

export type StoreStatus = 'idle' | 'loading' | 'ready' | 'error';

const LEDGER_META_TTL_MS = 5 * 60_000;

export class DataStore extends Events {
	snapshot: Snapshot | null = null;
	status: StoreStatus = 'idle';
	error: Error | null = null;

	private inflight: Promise<Snapshot> | null = null;
	private ledger: { meta: LedgerMeta; at: number } | null = null;
	private ledgerInflight: Promise<LedgerMeta> | null = null;

	/** Roughly how many queries one full load issues (for the progress label). */
	static readonly EXPECTED_QUERIES = 32;

	constructor(
		readonly client: FavaClient,
		private readonly deps: { cfg: () => DomainConfig; ttlMs: () => number },
	) {
		super();
		let last = 0;
		client.onProgress = () => {
			const now = Date.now();
			if (now - last < 250) return;
			last = now;
			if (this.status === 'loading') this.emit();
		};
	}

	/** Queries finished in the current load, for "Loading… 12 of 32". */
	get progress(): { done: number; total: number } {
		return { done: this.client.stats.finished, total: Math.max(DataStore.EXPECTED_QUERIES, this.client.stats.started) };
	}

	onChange(cb: () => void): EventRef {
		return this.on('change', cb);
	}

	private emit(): void {
		this.trigger('change');
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

	/** Drop everything (settings changed). Consumers re-render to a loading state. */
	invalidate(): void {
		this.snapshot = null;
		this.ledger = null;
		this.error = null;
		this.status = 'idle';
		this.emit();
	}

	/** Ledger just changed on the server (quick entry): drop the meta cache too. */
	invalidateLedger(): void {
		this.ledger = null;
	}

	/** Re-render consumers without refetching (e.g. hours/week changed). */
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

	private async load(): Promise<Snapshot> {
		this.status = 'loading';
		this.client.stats.started = 0;
		this.client.stats.finished = 0;
		this.emit();
		try {
			const cfg = this.deps.cfg();
			const [metrics, recurring] = await Promise.all([
				computeMetrics(this.client, cfg),
				computeRecurring(this.client, cfg),
			]);
			this.snapshot = { metrics, recurring, loadedAt: Date.now() };
			this.error = null;
			this.status = 'ready';
			return this.snapshot;
		} catch (e) {
			this.error = e instanceof Error ? e : new Error(String(e));
			this.status = 'error';
			throw this.error;
		} finally {
			this.emit();
		}
	}
}
