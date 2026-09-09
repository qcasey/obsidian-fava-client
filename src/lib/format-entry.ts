// Beancount entry formatter matching the ledger's conventions:
// 4-space indent; amount right-aligned so "±X.XX USD" ends at the target
// column (personal file: 76, business hand file: 72); final leg amount-less.

import type { EntryDraft } from '../types';

const INDENT = '    ';

function quote(s: string): string {
	return s.replace(/"/g, "'").trim();
}

/** Format a positive decimal string to 2 places without float math. */
export function normalizeAmount(raw: string): string {
	const cleaned = raw.replace(/[$,\s]/g, '');
	if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) {
		throw new Error(`Invalid amount: ${raw}`);
	}
	const [int = '0', frac = ''] = cleaned.split('.');
	return `${parseInt(int, 10)}.${(frac + '00').slice(0, 2)}`;
}

export function formatEntry(d: EntryDraft, width: number): string {
	const narration = d.refund
		? `${quote(d.narration)}${d.narration.trim() ? ' ' : ''}(REFUND)`
		: quote(d.narration);
	const lines = [`${d.date} ${d.flag} "${quote(d.payee)}" "${narration}"`];
	for (const f of d.fundings) {
		const amt = normalizeAmount(f.amount);
		const signed = d.refund ? amt : `-${amt}`;
		const amtStr = `${signed} USD`;
		const pad = Math.max(2, width - INDENT.length - f.account.length - amtStr.length);
		lines.push(`${INDENT}${f.account}${' '.repeat(pad)}${amtStr}`);
	}
	lines.push(`${INDENT}${d.category}`);
	return lines.join('\n');
}
