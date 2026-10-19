// The overview's lead card: one word, three sentences, no arithmetic. Every
// phrasing decision lives in lib/metrics-relax.ts; this only lays it out.

import { setIcon } from 'obsidian';
import { fmtMoney, fmtSigned } from '../lib/fmt';
import { kv, note, statusDot } from '../ui/dom';
import type { CardDef, Params } from './types';

const str = (p: Params, k: string): string | undefined => (typeof p[k] === 'string' ? p[k] : undefined);
const bool = (p: Params, k: string, d: boolean): boolean => (typeof p[k] === 'boolean' ? p[k] : d);

export const relaxCard: CardDef = {
	id: 'relax',
	title: 'Relax?',
	desc: 'Yes or no: can you keep living at this pace? Three checks in plain language, with the numbers tucked away.',
	wide: true,
	params: [
		{ name: 'kicker', kind: 'string', default: '', desc: 'Small line above the answer, e.g. what "this pace" means' },
		{ name: 'numbers', kind: 'boolean', default: true, desc: 'Offer a "show the numbers" disclosure' },
	],
	render(el, ctx, p) {
		const { relax, personal, business } = ctx.snapshot.metrics;
		el.addClass('fava-card', 'fava-relax', `is-${relax.status}`);
		const grid = el.createDiv({ cls: 'fava-relax__grid' });

		const say = grid.createDiv({ cls: 'fava-relax__say' });
		const kicker = str(p, 'kicker');
		if (kicker) say.createDiv({ cls: 'fava-relax__kicker', text: kicker });
		say.createDiv({ cls: 'fava-relax__q', text: 'Relax?' });
		say.createDiv({ cls: 'fava-relax__a', text: relax.answer });
		say.createEl('p', { cls: 'fava-relax__summary', text: relax.summary });

		const checks = grid.createDiv({ cls: 'fava-relax__checks' });
		for (const c of relax.checks) {
			const box = checks.createDiv({ cls: `fava-relax__check is-${c.status}` });
			statusDot(box, c.status);
			const copy = box.createDiv({ cls: 'fava-relax__copy' });
			copy.createDiv({ cls: 'fava-relax__check-title', text: c.title });
			copy.createDiv({ cls: 'fava-relax__check-text', text: c.text });
		}

		if (!bool(p, 'numbers', true)) return;

		// The numbers exist, they are just not the point. Closed by default.
		const key = `${ctx.keyPrefix}:relax-numbers`;
		const more = el.createEl('button', { cls: 'fava-relax__more', attr: { type: 'button' } });
		const chevron = more.createSpan({ cls: 'fava-relax__chevron' });
		setIcon(chevron, 'chevron-down');
		const moreLabel = more.createSpan({ text: 'Show the numbers' });
		const body = el.createDiv({ cls: 'fava-card__body fava-relax__body' });

		const c = relax.cushion;
		kv(body, 'Business operating profit', `${fmtMoney(business.operatingNet)}/mo`);
		kv(body, 'What life costs', `${fmtMoney(personal.monthlySpendTrailing)}/mo`, { muted: true });
		kv(body, 'The cushion, all in', fmtMoney(c.now));
		kv(body, 'Over the past year', fmtSigned(c.change12mo), {
			muted: true,
			valueClass: c.change12mo < 0 ? 'is-red' : '',
		});
		kv(body, 'Your own savings', fmtMoney(personal.netAssets));
		note(body, 'The cushion is everything owned less everything owed, on both sides of the ledger. Your own savings are the personal side of that on its own.');

		const apply = () => {
			const open = ctx.ui.isExpanded(key);
			body.hidden = !open;
			el.toggleClass('is-expanded', open);
			more.setAttr('aria-expanded', String(open));
			moreLabel.setText(open ? 'Hide the numbers' : 'Show the numbers');
		};
		apply();
		ctx.component.registerDomEvent(more, 'click', () => {
			ctx.ui.toggle(key);
			apply();
		});
	},
};
