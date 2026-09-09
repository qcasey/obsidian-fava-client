// Dotted-path access into the Metrics object for `metric` cards and inline refs.

export function getByPath(obj: unknown, path: string): unknown {
	let cur: unknown = obj;
	for (const seg of path.split('.')) {
		if (cur === null || typeof cur !== 'object') return undefined;
		cur = (cur as Record<string, unknown>)[seg];
	}
	return cur;
}

export function getNumberByPath(obj: unknown, path: string): number | undefined {
	const v = getByPath(obj, path);
	return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

/** "Home Downpayment" → "home-downpayment" */
export function slug(s: string): string {
	return s
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}
