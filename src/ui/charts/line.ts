// Single-series line chart (net worth over time).

import { CHART_H, CHART_W, PAD, labelIndexes, linear, niceTicks, svgRoot, text, title } from './scale';

export interface LinePoint {
	label: string;
	value: number;
}

export function drawLine(
	parent: HTMLElement,
	points: LinePoint[],
	opts: { formatY: (v: number) => string; formatX: (label: string) => string; sparkline?: boolean },
): void {
	if (points.length < 2) {
		parent.createDiv({ cls: 'fava-note', text: 'Not enough history yet.' });
		return;
	}
	const spark = opts.sparkline === true;
	const w = CHART_W;
	const h = spark ? 56 : CHART_H;
	const pad = spark ? { top: 4, right: 4, bottom: 4, left: 4 } : PAD;
	const svg = svgRoot(parent, w, h, spark ? 'fava-chart--spark' : '');
	const values = points.map((p) => p.value);
	const ticks = niceTicks(Math.min(...values), Math.max(...values), spark ? 2 : 4);
	const y = linear([ticks[0] ?? 0, ticks[ticks.length - 1] ?? 1], [h - pad.bottom, pad.top]);
	const x = linear([0, points.length - 1], [pad.left, w - pad.right]);

	if (!spark) {
		for (const t of ticks) {
			svg.createSvg('line', {
				cls: 'fava-chart__grid',
				attr: { x1: String(pad.left), x2: String(w - pad.right), y1: String(y(t)), y2: String(y(t)) },
			});
			text(svg, pad.left - 4, y(t) + 3, opts.formatY(t), { anchor: 'end' });
		}
		const idx = labelIndexes(points.length, 5);
		points.forEach((p, i) => {
			if (idx.has(i)) text(svg, x(i), h - 4, opts.formatX(p.label), { anchor: 'middle' });
		});
	}

	const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
	const area = `${d} L${x(points.length - 1).toFixed(1)},${(h - pad.bottom).toFixed(1)} L${x(0).toFixed(1)},${(h - pad.bottom).toFixed(1)} Z`;
	svg.createSvg('path', { cls: 'fava-chart__area', attr: { d: area } });
	svg.createSvg('path', { cls: 'fava-chart__line', attr: { d } });

	// Invisible hit targets carrying native tooltips
	points.forEach((p, i) => {
		const g = svg.createSvg('g');
		g.createSvg('circle', {
			cls: 'fava-chart__hit',
			attr: { cx: String(x(i)), cy: String(y(p.value)), r: '7' },
		});
		title(g, `${opts.formatX(p.label)}: ${opts.formatY(p.value)}`);
	});
	const last = points[points.length - 1];
	if (last) {
		svg.createSvg('circle', {
			cls: 'fava-chart__dot',
			attr: { cx: String(x(points.length - 1)), cy: String(y(last.value)), r: '3' },
		});
	}
}
