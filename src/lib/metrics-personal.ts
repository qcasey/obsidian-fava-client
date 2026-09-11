// Personal-side derivations: spend/income/surplus, burns, survival spend,
// month-to-date pace, monthly series and savings envelopes.

import type { DomainConfig } from './config';
import { cell } from './csv';
import { DAYS_PER_MONTH, daysBetween } from './dates';
import { parseNum } from './fava-client';
import {
	type AcctRows,
	firstNum,
	monthKey,
	movers,
	rollupCategory,
	sumAll,
	sumWhere,
	toAcctRows,
} from './metrics-util';
import type { CategoryPace, Envelope, PersonalMetrics } from '../types';

export interface PersonalInputs {
	cfg: DomainConfig;
	today: string;
	mE3: number;
	mE6: number;
	monthPctThrough: number;
	balances: AcctRows;
	persExp3: AcctRows;
	persExp6: AcctRows;
	persInc3Raw: string[][];
	persInc6Raw: string[][];
	persExpMtdRaw: string[][];
	rentCreditsRaw: string[][];
	rentLastRaw: string[][];
	reimbCreditsRaw: string[][];
	persExpMonthlyRaw: string[][];
	persIncMonthlyRaw: string[][];
	contribRaw: string[][];
}

export function computePersonal(i: PersonalInputs): PersonalMetrics {
	const { cfg, mE3, mE6, balances, persExp3, persExp6 } = i;
	const a = cfg.accounts;
	const balanceOf = (account: string) => balances.find(([x]) => x === account)?.[1] ?? 0;

	const liquid = sumWhere(
		balances,
		(x) =>
			a.liquidPrefixes.some((p) => x.startsWith(p)) &&
			!a.liquidExclude.some((p) => x.startsWith(p)),
	);

	const exp3 = sumAll(persExp3);
	const exp6 = sumAll(persExp6);
	const monthlySpend = exp3 / mE3;
	const monthlySpend6 = exp6 / mE6;
	const monthlyIncome = Math.abs(firstNum(i.persInc3Raw)) / mE3;
	const monthlyIncomeTrailing = Math.abs(firstNum(i.persInc6Raw)) / mE6;
	const monthlySurplus = monthlyIncome - monthlySpend;
	const savingsRate =
		monthlyIncome > 0 ? ((monthlyIncome - monthlySpend) / monthlyIncome) * 100 : 0;
	const runwayMonths = monthlySpend > 0 ? liquid / monthlySpend : 99;
	const emergencyFund = balanceOf(a.emergencyFund);
	const spendTrendPct =
		monthlySpend6 > 0 ? ((monthlySpend - monthlySpend6) / monthlySpend6) * 100 : 0;
	const spendMovers = movers(rollupCategory(persExp3), rollupCategory(persExp6), mE3, mE6);

	// Month-to-date pace per category vs the trailing average, prorated by day
	// of month. Taxes excluded — quarterly estimates would always scream red.
	const mtdCats = rollupCategory(toAcctRows(i.persExpMtdRaw));
	const categoryPace: CategoryPace[] = [...rollupCategory(persExp6).entries()]
		.map(([category, sum6]) => ({ category, typicalMo: sum6 / mE6 }))
		.filter((c) => c.typicalMo >= 50 && c.category !== 'Government')
		.sort((x, y) => y.typicalMo - x.typicalMo)
		.slice(0, 8)
		.map((c) => {
			const mtd = mtdCats.get(c.category) ?? 0;
			const expected = c.typicalMo * i.monthPctThrough;
			return { ...c, mtd, pace: expected > 0 ? (mtd / expected) * 100 : 0 };
		});

	// Burns (trailing window = 6mo)
	const monthlySpendTrailing = exp6 / mE6;
	const dailyBurn = monthlySpendTrailing / DAYS_PER_MONTH;
	const lifestyle6 = sumWhere(persExp6, (x) => !x.startsWith(a.personalTaxPrefix));
	const monthlyLifestyleTrailing = lifestyle6 / mE6;
	const dailyBurnLifestyle = monthlyLifestyleTrailing / DAYS_PER_MONTH;
	const taxMoTrailing = monthlySpendTrailing - monthlyLifestyleTrailing;
	const burnCats = [...rollupCategory(persExp6).entries()]
		.map(([category, sum]) => ({ category, monthly: sum / mE6 }))
		.sort((x, y) => y.monthly - x.monthly);

	// Survival spend: gross lifestyle (credits added back) minus the fixed rent credit
	const rentCredits6 = Math.abs(firstNum(i.rentCreditsRaw));
	const reimbCredits6 = Math.abs(firstNum(i.reimbCreditsRaw));
	const grossLifestyleMo = monthlyLifestyleTrailing + (rentCredits6 + reimbCredits6) / mE6;
	const rentLastDate = cell(i.rentLastRaw[0], 0);
	const rentLastAmt = Math.abs(parseNum(cell(i.rentLastRaw[0], 1)));
	const survivalIncomeMo =
		rentLastDate && daysBetween(rentLastDate, i.today) <= cfg.rent.staleDays ? rentLastAmt : 0;
	const monthlySurvivalSpend = Math.max(0, grossLifestyleMo - survivalIncomeMo);

	// ── Monthly chart series ──
	const seriesMap = new Map<string, { spend: number; income: number }>();
	for (const r of i.persExpMonthlyRaw) {
		const k = monthKey(cell(r, 0), cell(r, 1));
		const e = seriesMap.get(k) ?? { spend: 0, income: 0 };
		e.spend += parseNum(cell(r, 2));
		seriesMap.set(k, e);
	}
	for (const r of i.persIncMonthlyRaw) {
		const k = monthKey(cell(r, 0), cell(r, 1));
		const e = seriesMap.get(k) ?? { spend: 0, income: 0 };
		e.income += Math.abs(parseNum(cell(r, 2)));
		seriesMap.set(k, e);
	}
	const monthlySeries = [...seriesMap.entries()]
		.sort(([x], [y]) => x.localeCompare(y))
		.map(([month, v]) => ({ month, ...v }));

	// ── Investment contributions (spend ring) ──
	const contribRows = toAcctRows(i.contribRaw);
	const contrib = cfg.contribAccounts
		.map(({ label, prefix }) => ({
			label,
			monthly: sumWhere(contribRows, (x) => x.startsWith(prefix)) / mE6,
		}))
		.filter((c) => c.monthly > 0.5);

	return {
		liquid,
		monthlySpend,
		monthlyIncome,
		monthlyIncomeTrailing,
		monthlySurplus,
		savingsRate,
		runwayMonths,
		emergencyFund,
		spendTrendPct,
		spendMovers,
		dailyBurn,
		monthlySpendTrailing,
		dailyBurnLifestyle,
		monthlyLifestyleTrailing,
		taxMoTrailing,
		burnCats,
		grossLifestyleMo,
		survivalIncomeMo,
		monthlySurvivalSpend,
		monthlySeries,
		categoryPace,
		contrib,
	};
}

/** An envelope before its balance is attached: where it came from, and its order. */
interface EnvelopeDef {
	account: string;
	label: string;
	target: number;
	/** `envelope_sort` metadata; undefined sorts after every numbered envelope. */
	sort: number | undefined;
}

/**
 * Envelope definitions from `open`-directive metadata, in `envelope_sort` order.
 * Unnumbered envelopes trail the numbered ones, largest target first.
 */
function ledgerEnvelopeDefs(envelopeDefsRaw: string[][]): EnvelopeDef[] {
	// Column 4 is the balance the GROUP BY needs an aggregate for; balances come
	// from the ledger-wide query instead, so both sources are read the same way.
	const defs = envelopeDefsRaw.map((r) => ({
		account: cell(r, 0),
		label: cell(r, 1),
		target: parseNum(cell(r, 2)),
		sort: cell(r, 3) ? parseNum(cell(r, 3)) : undefined,
	}));
	return defs.sort(
		(a, b) =>
			(a.sort ?? Infinity) - (b.sort ?? Infinity) ||
			b.target - a.target ||
			a.label.localeCompare(b.label),
	);
}

/**
 * Savings envelopes, preferring the ledger: any account whose `open` directive
 * carries `envelope` metadata wins outright, and `savingsEnvelopes` is the
 * fallback for ledgers that are not annotated yet.
 */
export function computeEnvelopes(
	cfg: DomainConfig,
	balances: AcctRows,
	envelopeDefsRaw: string[][],
	envelopes3Raw: string[][],
): Envelope[] {
	const envelopes3 = toAcctRows(envelopes3Raw);
	const fromLedger = ledgerEnvelopeDefs(envelopeDefsRaw);
	const defs: EnvelopeDef[] = fromLedger.length
		? fromLedger
		: cfg.savingsEnvelopes.map((e) => ({ ...e, sort: undefined }));
	return defs.map(({ account, label, target }) => {
		const balance = balances.find(([x]) => x === account)?.[1] ?? 0;
		const hist = envelopes3.find(([x]) => x === account)?.[1] ?? 0;
		return {
			label,
			account,
			balance,
			target,
			pct: target > 0 ? (balance / target) * 100 : 0,
			delta3mo: balance - hist,
		};
	});
}
