// Raw BQL results cached by query so the dashboard can show stale numbers
// instantly and recompute as fresh rows arrive.
//
// Key = query shape (dates blanked) + each date's offset from today in days.
// Two queries that differ only in date range ("since 3 months ago" vs "since
// the 1st") therefore never share an entry, while yesterday's cache still
// serves today's near-identical query as stale data.

import { daysBetween, todayISO } from '../lib/dates';

export interface KeyParts {
	/** Exact key: shape + offsets */
	key: string;
	shape: string;
	/** Days between each date literal and today, in order of appearance */
	offsets: number[];
}

interface Entry {
	shape: string;
	offsets: number[];
	rows: string[][];
}

export interface PersistedCache {
	version: 2;
	savedAt: number;
	entries: Record<string, Entry>;
}

/** Offsets may drift by this many days and still count as the same query (stale). */
const NEAR_TOLERANCE_DAYS = 10;

export function keyParts(bql: string, today = todayISO()): KeyParts {
	const offsets: number[] = [];
	const shape = bql
		.replace(/\d{4}-\d{2}-\d{2}/g, (m) => {
			offsets.push(daysBetween(m, today));
			return '<date>';
		})
		.replace(/\s+/g, ' ')
		.trim();
	return { key: `${shape}|${offsets.join(',')}`, shape, offsets };
}

export class QueryCache {
	private entries = new Map<string, Entry>();
	savedAt = 0;

	get size(): number {
		return this.entries.size;
	}

	/** Exact hit only. */
	get(key: string): string[][] | undefined {
		return this.entries.get(key)?.rows;
	}

	/** Exact hit, else the same query shape with nearly the same date range. */
	getNear(parts: KeyParts): string[][] | undefined {
		const exact = this.entries.get(parts.key);
		if (exact) return exact.rows;
		let best: { rows: string[][]; drift: number } | null = null;
		for (const e of this.entries.values()) {
			if (e.shape !== parts.shape || e.offsets.length !== parts.offsets.length) continue;
			let drift = 0;
			let ok = true;
			for (let i = 0; i < e.offsets.length && ok; i++) {
				const d = Math.abs((e.offsets[i] ?? 0) - (parts.offsets[i] ?? 0));
				if (d > NEAR_TOLERANCE_DAYS) ok = false;
				drift += d;
			}
			if (ok && (!best || drift < best.drift)) best = { rows: e.rows, drift };
		}
		return best?.rows;
	}

	set(parts: KeyParts, rows: string[][]): void {
		this.entries.set(parts.key, { shape: parts.shape, offsets: parts.offsets, rows });
	}

	clear(): void {
		this.entries.clear();
		this.savedAt = 0;
	}

	/** Drop entries not used by the latest load. */
	prune(keep: Set<string>): void {
		for (const k of [...this.entries.keys()]) if (!keep.has(k)) this.entries.delete(k);
	}

	toJSON(): PersistedCache {
		return { version: 2, savedAt: this.savedAt, entries: Object.fromEntries(this.entries) };
	}

	static fromJSON(text: string): QueryCache | null {
		try {
			const parsed = JSON.parse(text) as Partial<PersistedCache> | null;
			if (!parsed || parsed.version !== 2 || typeof parsed.entries !== 'object' || parsed.entries === null) return null;
			const c = new QueryCache();
			c.savedAt = typeof parsed.savedAt === 'number' ? parsed.savedAt : 0;
			for (const [k, e] of Object.entries(parsed.entries)) {
				if (e && typeof e.shape === 'string' && Array.isArray(e.offsets) && Array.isArray(e.rows)) c.entries.set(k, e);
			}
			return c;
		} catch {
			return null;
		}
	}
}
