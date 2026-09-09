// Pure helpers for the hand-drawn SVG charts.

export interface Scale {
	(v: number): number;
	domain: [number, number];
}

export function linear(domain: [number, number], range: [number, number]): Scale {
	const [d0, d1] = domain;
	const [r0, r1] = range;
	const span = d1 - d0 || 1;
	const f = ((v: number) => r0 + ((v - d0) / span) * (r1 - r0)) as Scale;
	f.domain = domain;
	return f;
}

/** ~n "nice" tick values covering [min, max], always including 0 when inside. */
export function niceTicks(min: number, max: number, n = 4): number[] {
	if (min === max) {
		min = min === 0 ? -1 : min * 0.9;
		max = max === 0 ? 1 : max * 1.1;
	}
	const raw = (max - min) / n;
	const mag = Math.pow(10, Math.floor(Math.log10(raw)));
	const norm = raw / mag;
	const step = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
	const start = Math.floor(min / step) * step;
	const end = Math.ceil(max / step) * step;
	const ticks: number[] = [];
	for (let v = start; v <= end + step / 2; v += step) ticks.push(Math.round(v / step) * step);
	return ticks;
}

export const CHART_W = 320;
export const CHART_H = 160;
export const PAD = { top: 8, right: 8, bottom: 20, left: 40 };

export function svgRoot(parent: HTMLElement, w = CHART_W, h = CHART_H, cls = ''): SVGSVGElement {
	const svg = parent.createSvg('svg', {
		cls: ['fava-chart', ...cls.split(' ').filter(Boolean)],
		attr: {
			viewBox: `0 0 ${w} ${h}`,
			preserveAspectRatio: 'xMidYMid meet',
			role: 'img',
		},
	});
	return svg;
}

export function text(
	svg: SVGElement,
	x: number,
	y: number,
	value: string,
	opts: { anchor?: 'start' | 'middle' | 'end'; cls?: string } = {},
): SVGTextElement {
	const t = svg.createSvg('text', {
		cls: ['fava-chart__text', ...(opts.cls ?? '').split(' ').filter(Boolean)],
		attr: { x: String(x), y: String(y), 'text-anchor': opts.anchor ?? 'start' },
	});
	t.textContent = value;
	return t;
}

export function title(el: SVGElement, value: string): void {
	el.createSvg('title').textContent = value;
}

/** Evenly spaced label indexes so ≤ maxLabels fit, always keeping first and last. */
export function labelIndexes(count: number, maxLabels: number): Set<number> {
	const out = new Set<number>();
	if (count === 0) return out;
	const step = Math.max(1, Math.ceil(count / maxLabels));
	for (let i = 0; i < count; i += step) out.add(i);
	out.add(count - 1);
	return out;
}
