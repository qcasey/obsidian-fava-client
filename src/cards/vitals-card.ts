// The second overview lead: net worth as the statement, with the three
// readouts that say whether it is holding. Sentences come from
// lib/metrics-vitals.ts; this only lays them out.

import { fmtMoney, fmtSigned } from '../lib/fmt';
import { statusDot } from '../ui/dom';
import type { CardDef, Params } from './types';

const str = (p: Params, k: string): string | undefined => (typeof p[k] === 'string' ? p[k] : undefined);

export const vitalsCard: CardDef = {
	id: 'vitals',
	title: 'Where things stand',
	desc: 'Net worth with its 3- and 6-month change, beside income vs expenses, envelopes and runway.',
	wide: true,
	params: [{ name: 'kicker', kind: 'string', default: '', desc: 'Small line above the number' }],
	render(el, ctx, p) {
		const { netWorth: nw, vitals, statuses } = ctx.snapshot.metrics;
		const nwStatus = statuses.netWorth ?? 'none';
		el.addClass('fava-card', 'fava-panel', 'fava-vitals', `is-${nwStatus}`);
		const grid = el.createDiv({ cls: 'fava-panel__grid' });

		const say = grid.createDiv({ cls: 'fava-panel__say' });
		const kicker = str(p, 'kicker');
		if (kicker) say.createDiv({ cls: 'fava-panel__kicker', text: kicker });
		say.createDiv({ cls: 'fava-panel__label', text: 'Net worth' });
		say.createDiv({ cls: 'fava-panel__value fava-panel__value--money', text: fmtMoney(nw.current) });

		const deltas = say.createDiv({ cls: 'fava-panel__deltas' });
		for (const [value, label] of [
			[nw.delta3mo, 'in 3 months'],
			[nw.delta6mo, 'in 6 months'],
		] as [number, string][]) {
			const d = deltas.createDiv({ cls: 'fava-panel__delta' });
			d.createSpan({
				cls: `fava-panel__delta-value ${value < 0 ? 'is-red' : 'is-green'}`,
				text: fmtSigned(value),
			});
			d.createSpan({ cls: 'fava-panel__delta-label', text: label });
		}

		const boxes = grid.createDiv({ cls: 'fava-panel__boxes' });
		for (const v of vitals) {
			const box = boxes.createDiv({ cls: `fava-panel__box is-${v.status}` });
			statusDot(box, v.status);
			const copy = box.createDiv({ cls: 'fava-panel__copy' });
			copy.createDiv({ cls: 'fava-panel__box-title', text: v.title });
			copy.createDiv({ cls: 'fava-panel__box-text', text: v.text });
		}
	},
};
