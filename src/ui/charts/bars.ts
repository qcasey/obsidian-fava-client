// Grouped vertical bars (income vs spend, revenue vs opex by month).

import { CHART_H, CHART_W, PAD, labelIndexes, linear, niceTicks, svgRoot, text, title } from './scale';

export interface BarGroup {
	label: string;
	values: number[];
	/** Incomplete period: drawn faded */
	partial?: boolean;
}

export interface BarSeries {
	name: string;
	/** 1-based palette slot → CSS var --fava-chart-N */
	slot: number;
}

export function drawGroupedBars(
	parent: HTMLElement,
	groups: BarGroup[],
	series: BarSeries[],
	opts: {
		formatY: (v: number) => string;
		formatX: (label: string) => string;
		formatTip: (v: number) => string;
		/** Colour by sign instead of by series, and drop the legend */
		colorBySign?: boolean;
	},
): void {
	if (groups.length === 0) {
		parent.createDiv({ cls: 'fava-note', text: 'No data yet.' });
		return;
	}
	const w = CHART_W;
	const h = CHART_H;
	const svg = svgRoot(parent, w, h);
	const all = groups.flatMap((g) => g.values);
	const ticks = niceTicks(Math.min(0, ...all), Math.max(0, ...all), 4);
	const y = linear([ticks[0] ?? 0, ticks[ticks.length - 1] ?? 1], [h - PAD.bottom, PAD.top]);
	const innerW = w - PAD.left - PAD.right;
	const groupW = innerW / groups.length;
	const gap = Math.min(6, groupW * 0.2);
	const barW = Math.max(2, (groupW - gap) / series.length);

	for (const t of ticks) {
		svg.createSvg('line', {
			cls: t === 0 ? ['fava-chart__grid', 'is-zero'] : 'fava-chart__grid',
			attr: { x1: String(PAD.left), x2: String(w - PAD.right), y1: String(y(t)), y2: String(y(t)) },
		});
		text(svg, PAD.left - 4, y(t) + 3, opts.formatY(t), { anchor: 'end' });
	}
	const idx = labelIndexes(groups.length, 6);
	groups.forEach((g, gi) => {
		const x0 = PAD.left + gi * groupW + gap / 2;
		if (idx.has(gi)) text(svg, x0 + (groupW - gap) / 2, h - 4, opts.formatX(g.label), { anchor: 'middle' });
		series.forEach((s, si) => {
			const v = g.values[si] ?? 0;
			const top = Math.min(y(v), y(0));
			const height = Math.max(0.5, Math.abs(y(v) - y(0)));
			const cls = ['fava-chart__bar', opts.colorBySign ? (v < 0 ? 'is-neg' : 'is-pos') : `is-slot-${s.slot}`];
			if (g.partial) cls.push('is-partial');
			const rect = svg.createSvg('rect', {
				cls,
				attr: {
					x: (x0 + si * barW).toFixed(1),
					y: top.toFixed(1),
					width: Math.max(1, barW - 1).toFixed(1),
					height: height.toFixed(1),
					rx: '1.5',
				},
			});
			title(rect, `${opts.formatX(g.label)} · ${s.name}: ${opts.formatTip(v)}`);
		});
	});

	if (opts.colorBySign) return;
	const legend = parent.createDiv({ cls: 'fava-legend' });
	for (const s of series) {
		const item = legend.createSpan({ cls: 'fava-legend__item' });
		item.createSpan({ cls: `fava-legend__swatch is-slot-${s.slot}` });
		item.createSpan({ text: s.name });
	}
}
