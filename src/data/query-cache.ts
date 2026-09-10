// Raw BQL results cached by query shape so the dashboard can show stale
// numbers instantly and recompute as fresh rows arrive.

export interface PersistedCache {
	version: 1;
	savedAt: number;
	rows: Record<string, string[][]>;
}

/**
 * Cache key: the query with every ISO date replaced, so "the same query as
 * yesterday" still hits. Fresh results always overwrite stale ones.
 */
export function cacheKey(bql: string): string {
	return bql.replace(/\d{4}-\d{2}-\d{2}/g, '<date>').replace(/\s+/g, ' ').trim();
}

export class QueryCache {
	private rows = new Map<string, string[][]>();
	savedAt = 0;

	get size(): number {
		return this.rows.size;
	}

	has(key: string): boolean {
		return this.rows.has(key);
	}

	get(key: string): string[][] | undefined {
		return this.rows.get(key);
	}

	set(key: string, rows: string[][]): void {
		this.rows.set(key, rows);
	}

	clear(): void {
		this.rows.clear();
		this.savedAt = 0;
	}

	/** Drop entries not used by the latest load. */
	prune(keep: Set<string>): void {
		for (const k of [...this.rows.keys()]) if (!keep.has(k)) this.rows.delete(k);
	}

	toJSON(): PersistedCache {
		return { version: 1, savedAt: this.savedAt, rows: Object.fromEntries(this.rows) };
	}

	static fromJSON(text: string): QueryCache | null {
		try {
			const parsed = JSON.parse(text) as Partial<PersistedCache> | null;
			if (!parsed || parsed.version !== 1 || typeof parsed.rows !== 'object' || parsed.rows === null) return null;
			const c = new QueryCache();
			c.savedAt = typeof parsed.savedAt === 'number' ? parsed.savedAt : 0;
			for (const [k, v] of Object.entries(parsed.rows)) {
				if (Array.isArray(v)) c.rows.set(k, v);
			}
			return c;
		} catch {
			return null;
		}
	}
}
