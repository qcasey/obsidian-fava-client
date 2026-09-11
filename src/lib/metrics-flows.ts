// Income vs expenses by calendar month — the whole ledger and each side —
// with trailing summaries that compare against the preceding equal window.

import type { DomainConfig } from './config';
import { cell } from './csv';
import { parseNum } from './fava-client';
import { monthKey, status } from './metrics-util';
import type { FlowScope, FlowScopeData, FlowWindow, IncomeExpense, MonthlyFlow } from '../types';

/** Months of history fetched: twice the longest window, for the comparison. */
export const FLOW_MONTHS = 24;
const WINDOWS = [3, 6, 12];

/** "Income:Personal:" → "Income" */
export function rootOf(prefix: string): string {
	return prefix.split(':')[0] ?? prefix;
}

/** ":Personal:" style token from a configured prefix. */
function sideToken(prefix: string): string {
	return `:${prefix.split(':')[1] ?? ''}:`;
}

interface Bucket {
	income: number;
	expenses: number;
}

const SCOPES: FlowScope[] = ['all', 'personal', 'business'];

export function computeFlows(rows: string[][], cfg: DomainConfig, today: string): IncomeExpense {
	const incomeRoot = `${rootOf(cfg.accounts.personalIncome)}:`;
	const personalToken = sideToken(cfg.accounts.personalExpense);
	const businessToken = sideToken(cfg.accounts.businessExpense);
	const thisMonth = today.slice(0, 7);

	const byScope = new Map<FlowScope, Map<string, Bucket>>(SCOPES.map((s) => [s, new Map()]));
	const add = (scope: FlowScope, month: string, income: number, expenses: number) => {
		const months = byScope.get(scope);
		if (!months) return;
		const b = months.get(month) ?? { income: 0, expenses: 0 };
		b.income += income;
		b.expenses += expenses;
		months.set(month, b);
	};

	for (const r of rows) {
		const month = monthKey(cell(r, 0), cell(r, 1));
		const account = cell(r, 2);
		const value = parseNum(cell(r, 3));
		if (value === 0) continue;
		// Beancount signs income negative; show it as money in.
		const isIncome = account.startsWith(incomeRoot);
		const income = isIncome ? -value : 0;
		const expenses = isIncome ? 0 : value;
		add('all', month, income, expenses);
		if (account.includes(personalToken)) add('personal', month, income, expenses);
		else if (account.includes(businessToken)) add('business', month, income, expenses);
	}

	const out = {} as IncomeExpense;
	for (const scope of SCOPES) {
		out[scope] = scopeData(byScope.get(scope) ?? new Map<string, Bucket>(), thisMonth, cfg);
	}
	return out;
}

function scopeData(months: Map<string, Bucket>, thisMonth: string, cfg: DomainConfig): FlowScopeData {
	const series: MonthlyFlow[] = [...months.entries()]
		.sort((a, b) => a[0].localeCompare(b[0]))
		.map(([month, b]) => ({
			month,
			income: b.income,
			expenses: b.expenses,
			net: b.income - b.expenses,
			partial: month === thisMonth,
		}));
	// The current month is still filling up, so averages use complete months only.
	const complete = series.filter((m) => !m.partial);
	return { series, windows: WINDOWS.map((n) => windowFor(complete, n, cfg)) };
}

function windowFor(complete: MonthlyFlow[], months: number, cfg: DomainConfig): FlowWindow {
	const cur = complete.slice(-months);
	const prev = complete.slice(-2 * months, -months);
	const avg = (rows: MonthlyFlow[], pick: (m: MonthlyFlow) => number) =>
		rows.length ? rows.reduce((s, m) => s + pick(m), 0) / rows.length : 0;

	const income = avg(cur, (m) => m.income);
	const expenses = avg(cur, (m) => m.expenses);
	const net = income - expenses;
	const prevIncome = avg(prev, (m) => m.income);
	const prevExpenses = avg(prev, (m) => m.expenses);
	const prevNet = prevIncome - prevExpenses;

	const changeAbs = net - prevNet;
	// Percent-of-previous-net explodes when the previous net was near zero, so
	// only quote it when that base is a real share of income.
	const meaningfulBase = prev.length > 0 && Math.abs(prevNet) >= 0.1 * Math.max(prevIncome, 1);
	const changePct = meaningfulBase ? (changeAbs / Math.abs(prevNet)) * 100 : null;
	// The dot reads the change as a share of income: scale-free, and unbothered
	// by a net that crosses zero.
	const base = prevIncome > 0 ? prevIncome : income;
	const marginPts = base > 0 ? (changeAbs / base) * 100 : 0;
	const t = cfg.thresholds;
	const flowStatus = prev.length === 0 ? 'none' : status(marginPts, t.flowTrendGreen, t.flowTrendYellow);

	return {
		months,
		counted: cur.length,
		income,
		expenses,
		net,
		prevIncome,
		prevExpenses,
		prevNet,
		changeAbs,
		changePct,
		marginPts,
		status: flowStatus,
	};
}
