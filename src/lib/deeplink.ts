// obsidian://fava-entry?… → prefilled add-entry form. Handy from iOS Shortcuts.

import type { QuickEntryPrefill } from '../cards/types';

export const DEEPLINK_ACTION = 'fava-entry';

export const DEEPLINK_PARAMS: { name: string; desc: string }[] = [
	{ name: 'amount', desc: 'Positive number, e.g. 12.50' },
	{ name: 'payee', desc: 'Payee name' },
	{ name: 'narration', desc: 'Description' },
	{ name: 'date', desc: 'YYYY-MM-DD (defaults to today)' },
	{ name: 'funding', desc: 'Paid-with account, e.g. Liabilities:Personal:AmEx:Blue' },
	{ name: 'category', desc: 'Expense or income account' },
	{ name: 'refund', desc: '1 to mark as a refund' },
	{ name: 'uncertain', desc: '1 to flag the entry with !' },
	{ name: 'text', desc: 'Raw email/receipt text to run through the interpreter; explicit fields above win' },
];

export const DEEPLINK_EXAMPLE =
	'obsidian://fava-entry?amount=12.50&payee=Albertsons&narration=Strawberries%20and%20bread&funding=Liabilities:Personal:AmEx:Blue';

const truthy = (v: string | undefined) => v !== undefined && ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());

export function prefillFromParams(params: Record<string, string>): QuickEntryPrefill {
	const p: QuickEntryPrefill = {};
	const str = (k: string) => {
		const v = params[k]?.trim();
		return v ? v : undefined;
	};
	const amount = str('amount')?.replace(/[^0-9.]/g, '');
	if (amount) p.amount = amount;
	const payee = str('payee');
	if (payee) p.payee = payee;
	const narration = str('narration');
	if (narration) p.narration = narration;
	const date = str('date');
	if (date) p.date = date;
	const funding = str('funding') ?? str('account');
	if (funding) p.funding = funding;
	const category = str('category');
	if (category) p.category = category;
	if (params.refund !== undefined) p.refund = truthy(params.refund);
	if (params.uncertain !== undefined) p.uncertain = truthy(params.uncertain);
	const text = str('text');
	if (text) p.text = text;
	return p;
}
