// Small helpers shared by the metric computations. Signs follow beancount:
// expenses are positive, income negative (abs() where the CLI does).

import { cell } from './csv';
import { parseNum } from './fava-client';
import type { Mover, Status } from '../types';

export type AcctRows = [string, number][];

export function toAcctRows(rows: string[][]): AcctRows {
	return rows.map((r) => [cell(r, 0), parseNum(cell(r, 1))]);
}

export function sumWhere(rows: AcctRows, pred: (acct: string) => boolean): number {
	return rows.reduce((s, [a, n]) => (pred(a) ? s + n : s), 0);
}

export function sumAll(rows: AcctRows): number {
	return rows.reduce((s, [, n]) => s + n, 0);
}

export const hasPrefix = (prefixes: string[]) => (acct: string) =>
	prefixes.some((p) => acct.startsWith(p));

/** 3rd account segment ("Expenses:Personal:X" → "X"), "Other" when missing. */
export function categoryOf(account: string): string {
	const parts = account.split(':');
	return parts.length >= 3 ? (parts[2] ?? 'Other') : 'Other';
}

/** Roll account-level sums up to the 3rd segment. */
export function rollupCategory(rows: AcctRows): Map<string, number> {
	const cats = new Map<string, number>();
	for (const [acct, n] of rows) {
		const cat = categoryOf(acct);
		cats.set(cat, (cats.get(cat) ?? 0) + n);
	}
	return cats;
}

export function movers(
	recent: Map<string, number>,
	all: Map<string, number>,
	mE3: number,
	mE6: number,
): Mover[] {
	const out: Mover[] = [];
	for (const [cat, sumAllCat] of all) {
		const avgAll = sumAllCat / mE6;
		if (avgAll <= 20) continue;
		const avgRecent = (recent.get(cat) ?? 0) / mE3;
		const change = avgRecent - avgAll;
		const pct = avgAll > 0 ? (change / avgAll) * 100 : 0;
		if (Math.abs(pct) > 15) {
			out.push({ category: cat, changePerMo: change, pctChange: pct, avgRecent });
		}
	}
	out.sort((a, b) => Math.abs(b.changePerMo) - Math.abs(a.changePerMo));
	return out.slice(0, 4);
}

/** Threshold status: green above / yellow above / red. */
export function status(val: number, greenAbove: number, yellowAbove: number): Status {
	if (val > greenAbove) return 'green';
	if (val > yellowAbove) return 'yellow';
	return 'red';
}

export function monthKey(year: string, month: string): string {
	return `${year}-${month.padStart(2, '0')}`;
}

export function pctChange(now: number, then: number): number {
	return then > 0 ? ((now - then) / then) * 100 : 0;
}

/** First cell of the first row of a single-aggregate query ("SELECT sum(...)"). */
export function firstNum(rows: string[][]): number {
	return parseNum(cell(rows[0], 0));
}

/** Sum of column `i` over all rows. */
export function sumCol(rows: string[][], i: number): number {
	return rows.reduce((s, r) => s + parseNum(cell(r, i)), 0);
}
