// Recurring-charge detection over posting-level history. A group (payee +
// side + category) is recurring when its charge dates land on a known cadence
// and the amounts are stable enough to be a bill rather than a habit.

import { BQL } from './bql';
import type { DomainConfig } from './config';
import { cell } from './csv';
import { DAYS_PER_MONTH, addDays, daysBetween, monthsAgo, todayISO } from './dates';
import { type QueryRunner, parseNum } from './fava-client';
import type { Cadence, RecurringItem, RecurringSummary, Side, UpcomingFlow } from '../types';

const CADENCES: { name: Cadence; days: number; tol: number }[] = [
	{ name: 'weekly', days: 7, tol: 2 },
	{ name: 'every 2 weeks', days: 14, tol: 3 },
	{ name: 'monthly', days: 30.44, tol: 6 },
	{ name: 'quarterly', days: 91.3, tol: 12 },
	{ name: 'yearly', days: 365.25, tol: 35 },
];

// 25 months of history: enough to see a yearly renewal twice.
const LOOKBACK_MONTHS = 25;
const UPCOMING_DAYS = 30;

function median(xs: number[]): number {
	const s = [...xs].sort((a, b) => a - b);
	const mid = Math.floor(s.length / 2);
	return s.length % 2 ? (s[mid] ?? 0) : ((s[mid - 1] ?? 0) + (s[mid] ?? 0)) / 2;
}

interface Group {
	payee: string;
	side: Side;
	kind: 'expense' | 'income';
	category: string;
	/** date → summed amount (same-day postings collapse to one occurrence) */
	byDate: Map<string, number>;
	accountCounts: Map<string, number>;
}

function detectItem(g: Group, today: string): RecurringItem | null {
	const dates = [...g.byDate.keys()].sort();
	if (dates.length < 2) return null;

	const intervals = dates.slice(1).map((d, i) => daysBetween(dates[i] ?? d, d));
	const medInt = median(intervals);
	const cad = CADENCES.find((c) => Math.abs(medInt - c.days) <= c.tol);
	if (!cad) return null;
	// Yearly can only show 2 occurrences in the lookback; everything else
	// needs 3+ so a coincidence doesn't register.
	if (dates.length < (cad.name === 'yearly' ? 2 : 3)) return null;
	const consistent = intervals.filter((iv) => Math.abs(iv - cad.days) <= cad.tol * 1.5);
	if (consistent.length < Math.max(1, Math.ceil(intervals.length * 0.7))) {
		return null;
	}

	const amounts = dates.map((d) => g.byDate.get(d) ?? 0);
	const typicalAmount = median(amounts);
	if (Math.abs(typicalAmount) < 2) return null;
	const mad = median(amounts.map((x) => Math.abs(x - typicalAmount)));
	const rel = mad / Math.abs(typicalAmount);
	if (rel > 0.4) return null; // too irregular to be a bill

	const lastDate = dates[dates.length - 1] ?? today;
	if (daysBetween(lastDate, today) > cad.days * 1.6 + 5) return null; // lapsed

	const lastAmount = amounts[amounts.length - 1] ?? typicalAmount;
	const drift =
		typicalAmount !== 0 ? ((lastAmount - typicalAmount) / Math.abs(typicalAmount)) * 100 : 0;
	const account = [...g.accountCounts.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? '';

	return {
		payee: g.payee,
		category: g.category,
		account,
		side: g.side,
		kind: g.kind,
		cadence: cad.name,
		intervalDays: Math.round(medInt),
		typicalAmount,
		monthlyEq: (typicalAmount * DAYS_PER_MONTH) / cad.days,
		lastAmount,
		lastDate,
		nextDue: addDays(lastDate, Math.round(medInt)),
		occurrences: dates.length,
		amountVaries: rel > 0.12,
		driftPct: Math.abs(drift) > 5 ? drift : 0,
	};
}

function upcomingFor(item: RecurringItem, today: string): UpcomingFlow[] {
	const horizon = addDays(today, UPCOMING_DAYS);
	const out: UpcomingFlow[] = [];
	let d = item.nextDue;
	// One overdue occurrence surfaces (a bill that should have hit already);
	// anything older than a week past due is stale, skip ahead.
	while (daysBetween(d, today) > 7) d = addDays(d, item.intervalDays);
	while (d <= horizon && out.length < 6) {
		out.push({
			date: d,
			payee: item.payee,
			amount: -item.typicalAmount,
			side: item.side,
			overdue: d < today,
		});
		d = addDays(d, item.intervalDays);
	}
	return out;
}

/** Pure detection over [date, payee, account, number] posting rows. */
export function detectRecurring(rows: string[][], today: string): RecurringSummary {
	const groups = new Map<string, Group>();
	for (const r of rows) {
		const date = cell(r, 0);
		const payee = cell(r, 1);
		const account = cell(r, 2);
		const amount = parseNum(cell(r, 3));
		if (!date || !payee || !account || amount === 0) continue;
		const side: Side = account.includes(':PhotoPanda:') ? 'business' : 'personal';
		const kind = account.startsWith('Income:') ? 'income' : 'expense';
		const category = account.split(':')[2] ?? 'Other';
		const key = `${payee}|${side}|${kind}|${category}`;
		let g = groups.get(key);
		if (!g) {
			g = { payee, side, kind, category, byDate: new Map(), accountCounts: new Map() };
			groups.set(key, g);
		}
		g.byDate.set(date, (g.byDate.get(date) ?? 0) + amount);
		g.accountCounts.set(account, (g.accountCounts.get(account) ?? 0) + 1);
	}

	const items: RecurringItem[] = [];
	for (const g of groups.values()) {
		const item = detectItem(g, today);
		if (item) items.push(item);
	}
	items.sort((x, y) => Math.abs(y.monthlyEq) - Math.abs(x.monthlyEq));

	const upcoming = items
		.flatMap((i) => upcomingFor(i, today))
		.sort((x, y) => x.date.localeCompare(y.date));

	const totalFor = (side: Side) =>
		items
			.filter((i) => i.side === side && i.kind === 'expense')
			.reduce((s, i) => s + i.monthlyEq, 0);

	return {
		items,
		upcoming,
		upcomingNet30: upcoming.reduce((s, u) => s + u.amount, 0),
		personalMonthlyTotal: totalFor('personal'),
		businessMonthlyTotal: totalFor('business'),
	};
}

export async function computeRecurring(
	client: QueryRunner,
	_cfg: DomainConfig,
): Promise<RecurringSummary> {
	const today = todayISO();
	const rows = await client.runQuery(BQL.postings(monthsAgo(LOOKBACK_MONTHS)));
	return detectRecurring(rows, today);
}
