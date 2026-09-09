// Donut with a centre label; slice identity carried by chips underneath.

import { svgRoot, title } from './scale';

export interface DonutSlice {
	name: string;
	value: number;
	/** CSS class for the fill: is-slot-N, is-other, is-unspent, is-contrib */
	cls: string;
	muted?: boolean;
}

export function drawDonut(
	parent: HTMLElement,
	slices: DonutSlice[],
	opts: {
		centerBig: string;
		centerSmall: string;
		centerExtra?: string;
		formatTip: (s: DonutSlice) => string;
	},
): void {
	const size = 200;
	const c = size / 2;
	const rOuter = 96;
	const rInner = 60;
	const total = slices.reduce((s, x) => s + x.value, 0);
	const wrap = parent.createDiv({ cls: 'fava-donut' });
	const svg = svgRoot(wrap, size, size, 'fava-chart--donut');
	if (total <= 0) {
		svg.createSvg('circle', {
			cls: ['fava-donut__slice', 'is-unspent'],
			attr: { cx: String(c), cy: String(c), r: String((rOuter + rInner) / 2), fill: 'none', 'stroke-width': String(rOuter - rInner) },
		});
	} else {
		let angle = -Math.PI / 2; // start at 12 o'clock, clockwise
		for (const s of slices) {
			if (s.value <= 0) continue;
			const sweep = (s.value / total) * Math.PI * 2;
			const a0 = angle;
			const a1 = angle + sweep;
			angle = a1;
			const d = annulusPath(c, c, rOuter, rInner, a0, a1);
			const path = svg.createSvg('path', { cls: ['fava-donut__slice', s.cls], attr: { d } });
			title(path, opts.formatTip(s));
		}
	}
	const center = wrap.createDiv({ cls: 'fava-donut__center' });
	center.createDiv({ cls: 'fava-donut__big', text: opts.centerBig });
	center.createDiv({ cls: 'fava-donut__small', text: opts.centerSmall });
	if (opts.centerExtra) center.createDiv({ cls: 'fava-donut__small', text: opts.centerExtra });
}

function annulusPath(cx: number, cy: number, ro: number, ri: number, a0: number, a1: number): string {
	// Guard against a full circle (arc flags can't draw 360°)
	if (a1 - a0 >= Math.PI * 2 - 1e-4) a1 = a0 + Math.PI * 2 - 1e-4;
	const large = a1 - a0 > Math.PI ? 1 : 0;
	const p = (r: number, a: number) => `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`;
	return [
		`M${p(ro, a0)}`,
		`A${ro},${ro} 0 ${large} 1 ${p(ro, a1)}`,
		`L${p(ri, a1)}`,
		`A${ri},${ri} 0 ${large} 0 ${p(ri, a0)}`,
		'Z',
	].join(' ');
}
