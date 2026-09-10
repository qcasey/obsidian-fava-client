// Cards that do something rather than show something.

import { setIcon } from 'obsidian';
import { cardShell } from '../ui/dom';
import type { CardDef } from './types';

export const addEntryCard: CardDef = {
	id: 'add-entry',
	title: 'Add transaction',
	desc: 'Type an amount and jump into the add-entry form with it filled in.',
	params: [],
	render(el, ctx) {
		const shell = cardShell(el, { label: 'Add transaction' });
		const row = shell.body.createDiv({ cls: 'fava-addentry' });
		const wrap = row.createDiv({ cls: 'fava-hours__input fava-addentry__input' });
		wrap.createSpan({ text: '$', cls: 'fava-hours__prefix' });
		const input = wrap.createEl('input', {
			type: 'text',
			attr: {
				inputmode: 'decimal',
				placeholder: '0.00',
				'aria-label': 'Amount in dollars',
				'data-persist': `${ctx.keyPrefix}:add-amount`,
			},
		});
		const btn = row.createEl('button', { cls: 'mod-cta fava-addentry__btn', attr: { type: 'button', 'aria-label': 'Add entry' } });
		setIcon(btn, 'plus');
		const go = () => {
			const amount = input.value.replace(/[^0-9.]/g, '');
			ctx.openQuickEntry(amount ? { amount } : undefined);
			input.value = '';
		};
		ctx.component.registerDomEvent(btn, 'click', go);
		ctx.component.registerDomEvent(input, 'keydown', (e) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				go();
			}
		});
	},
};

export const ACTION_CARDS: CardDef[] = [addEntryCard];
