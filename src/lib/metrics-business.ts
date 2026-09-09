// Business-side derivations: cash, opex, survival model, liabilities,
// breakeven, organic revenue floor, monthly series and net-worth composition.

import type { DomainConfig } from './config';
import { cell } from './csv';
import { DAYS_PER_MONTH, addDays, todayISO, weekStartISO } from './dates';
import { parseNum } from './fava-client';
import {
	type AcctRows,
	firstNum,
	hasPrefix,
	monthKey,
	movers,
	rollupCategory,
	sumAll,
	sumWhere,
} from './metrics-util';
import type { BusinessMetrics, CompositionSlice, OrganicFloor, SurvivalAccountRow } from '../types';

/** Minimum full weeks of data before the organic-floor fit is shown. */
const ORGANIC_MIN_WEEKS = 12;

/**
 * Organic revenue floor: OLS fit of weekly revenue = a + b × weekly ad spend.
 * The intercept `a` is revenue that keeps arriving at $0 spend. Only full
 * Mon–Sun weeks inside the window count; a week with no postings is a real $0.
 */
export function fitOrganicFloor(
	rows: string[][], // [date, account, usd] from BQL.adsRevenueByDate
	since: string,
	breakevenRevenue: number,
): OrganicFloor {
	const empty: OrganicFloor = {
		weekly: 0,
		monthly: 0,
		share: 0,
		revenuePerAdDollar: 0,
		breakevenCoverage: 0,
		r2: 0,
		nWeeks: 0,
		usable: false,
	};

	const spendByWeek = new Map<string, number>();
	const revByWeek = new Map<string, number>();
	for (const r of rows) {
		const date = cell(r, 0);
		const acct = cell(r, 1);
		const usd = cell(r, 2);
		const wk = weekStartISO(date);
		if (acct.startsWith('Income:')) {
			revByWeek.set(wk, (revByWeek.get(wk) ?? 0) + Math.abs(parseNum(usd)));
		} else {
			spendByWeek.set(wk, (spendByWeek.get(wk) ?? 0) + parseNum(usd));
		}
	}

	// First Monday on/after the window start through the last completed week.
	const firstMonday = weekStartISO(since) === since ? since : addDays(weekStartISO(since), 7);
	const points: { x: number; y: number }[] = [];
	const today = todayISO();
	for (let wk = firstMonday; addDays(wk, 7) <= today; wk = addDays(wk, 7)) {
		points.push({ x: spendByWeek.get(wk) ?? 0, y: revByWeek.get(wk) ?? 0 });
	}

	const n = points.length;
	if (n < ORGANIC_MIN_WEEKS) return { ...empty, nWeeks: n };

	const meanX = points.reduce((s, p) => s + p.x, 0) / n;
	const meanY = points.reduce((s, p) => s + p.y, 0) / n;
	const sxx = points.reduce((s, p) => s + (p.x - meanX) ** 2, 0);
	const sxy = points.reduce((s, p) => s + (p.x - meanX) * (p.y - meanY), 0);
	if (sxx === 0) return { ...empty, nWeeks: n };

	const b = sxy / sxx;
	const a = meanY - b * meanX;
	const ssTot = points.reduce((s, p) => s + (p.y - meanY) ** 2, 0);
	const ssRes = points.reduce((s, p) => s + (p.y - (a + b * p.x)) ** 2, 0);
	const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
	if (b <= 0 || a <= 0) return { ...empty, r2, nWeeks: n };

	const monthly = (a * DAYS_PER_MONTH) / 7;
	return {
		weekly: a,
		monthly,
		share: meanY > 0 ? a / meanY : 0,
		revenuePerAdDollar: b,
		breakevenCoverage: breakevenRevenue > 0 ? monthly / breakevenRevenue : 99,
		r2,
		nWeeks: n,
		usable: true,
	};
}

export interface BusinessInputs {
	cfg: DomainConfig;
	mE3: number;
	mE6: number;
	twelveMo: string;
	balances: AcctRows;
	bizExp3: AcctRows;
	bizExp6: AcctRows;
	bizInc6Raw: string[][];
	bizOpexMonthlyRaw: string[][];
	bizIncMonthlyRaw: string[][];
	adsRevenueRaw: string[][];
}

export interface BusinessResult {
	business: BusinessMetrics;
	/** Predicate used by QTD/YoY: excludes payroll, distributions, biz taxes */
	notNonOpex: (acct: string) => boolean;
}

export function computeBusiness(i: BusinessInputs): BusinessResult {
	const { cfg, mE3, mE6, balances, bizExp3, bizExp6 } = i;
	const a = cfg.accounts;
	const t = cfg.thresholds;
	const sv = cfg.survival;
	const balanceOf = (account: string) => balances.find(([x]) => x === account)?.[1] ?? 0;
	const balancePrefix = (prefix: string) => sumWhere(balances, (x) => x.startsWith(prefix));

	const bizCash = balancePrefix(a.bizChecking) + balanceOf(a.bizStripe);
	const notNonOpex = (x: string) => !hasPrefix(sv.nonOpex)(x);
	const opex6 = sumWhere(bizExp6, notNonOpex);
	const opex3 = sumWhere(bizExp3, notNonOpex);
	const monthlyOpex = opex6 / mE6;
	const monthlyOpex3 = opex3 / mE3;
	const monthlyTotalExp = sumAll(bizExp6) / mE6;

	// Survival opex: exclusions = (NON_OPEX ∪ CUT) minus Payroll (owner draw
	// stays), scaled accounts summed at their fraction.
	const payrollAccount = `${a.businessExpense}Payroll`;
	const survivalExclude = [...new Set([...sv.nonOpex, ...sv.cut])].filter(
		(p) => p !== payrollAccount,
	);
	const survivalAmountFor = (acct: string, n: number): number => {
		if (hasPrefix(survivalExclude)(acct)) return 0;
		const scale = sv.scale.find((s) => acct.startsWith(s.prefix));
		if (scale) return n * scale.factor;
		return n;
	};
	const survival6 = bizExp6.reduce((s, [x, n]) => s + survivalAmountFor(x, n), 0);
	const monthlySurvivalOpex = survival6 / mE6;

	// Per-subaccount survival table (first segment after the business expense prefix)
	const subMap = new Map<string, { full6: number; surv6: number; full3: number }>();
	const subOf = (x: string) => x.slice(a.businessExpense.length).split(':')[0] || 'Other';
	for (const [x, n] of bizExp6) {
		const sub = subOf(x);
		const e = subMap.get(sub) ?? { full6: 0, surv6: 0, full3: 0 };
		e.full6 += n;
		e.surv6 += survivalAmountFor(x, n);
		subMap.set(sub, e);
	}
	for (const [x, n] of bizExp3) {
		const sub = subOf(x);
		const e = subMap.get(sub) ?? { full6: 0, surv6: 0, full3: 0 };
		e.full3 += n;
		subMap.set(sub, e);
	}
	const survivalAccounts: SurvivalAccountRow[] = [...subMap.entries()]
		.sort(([x], [y]) => x.localeCompare(y))
		.map(([sub, e]) => {
			const fullMo = e.full6 / mE6;
			const survivalMo = e.surv6 / mE6;
			const fullMo3 = e.full3 / mE3;
			const scale = sv.scale.find((s) => s.prefix.startsWith(`${a.businessExpense}${sub}`));
			return {
				sub,
				fullMo,
				survivalMo,
				changePerMo: fullMo3 - fullMo,
				trendPct: fullMo > 0 ? ((fullMo3 - fullMo) / fullMo) * 100 : 0,
				scaleNote: scale ? `${Math.round(scale.factor * 100)}%` : null,
			};
		});

	const daysOfCash =
		monthlyOpex > 0 ? Math.floor(bizCash / (monthlyOpex / DAYS_PER_MONTH)) : 9999;
	const outstandingLiability = Math.abs(balanceOf(a.outstandingLiab));
	let liabBand: string;
	if (outstandingLiability < t.liabBandLow) liabBand = 'below';
	else if (outstandingLiability > t.liabBandHigh) liabBand = 'above';
	else {
		const pos = (outstandingLiability - t.liabBandLow) / (t.liabBandHigh - t.liabBandLow);
		liabBand = pos < 0.33 ? 'low-range' : pos < 0.67 ? 'mid-range' : 'high-range';
	}
	const hardLiabilities = Math.abs(
		sumWhere(
			balances,
			(x) => x.startsWith(a.businessLiability) && !hasPrefix(sv.liabExclude)(x),
		),
	);
	const hardCoverage = hardLiabilities > 0 ? bizCash / hardLiabilities : 99;

	const monthlyRevenue = Math.abs(firstNum(i.bizInc6Raw)) / mE6;
	const breakevenRevenue = monthlySurvivalOpex;
	const breakevenRatio = breakevenRevenue > 0 ? monthlyRevenue / breakevenRevenue : 99;
	const opexTrendPct = monthlyOpex > 0 ? ((monthlyOpex3 - monthlyOpex) / monthlyOpex) * 100 : 0;
	const opexMovers = movers(
		rollupCategory(bizExp3.filter(([x]) => notNonOpex(x))),
		rollupCategory(bizExp6.filter(([x]) => notNonOpex(x))),
		mE3,
		mE6,
	);
	const monthlyExcess = monthlyRevenue - monthlyTotalExp;
	// Operations vs owner outflows: monthlyOpex excludes payroll, distributions
	// and business taxes, so their difference is what flows to the owner + government.
	const operatingNet = monthlyRevenue - monthlyOpex;
	const ownerOutflowsMo = monthlyTotalExp - monthlyOpex;

	const organic = fitOrganicFloor(i.adsRevenueRaw, i.twelveMo, breakevenRevenue);

	// ── Monthly chart series ──
	const bizSeriesMap = new Map<string, { revenue: number; opex: number }>();
	for (const r of i.bizOpexMonthlyRaw) {
		// year, month, account, sum
		if (!notNonOpex(cell(r, 2))) continue;
		const k = monthKey(cell(r, 0), cell(r, 1));
		const e = bizSeriesMap.get(k) ?? { revenue: 0, opex: 0 };
		e.opex += parseNum(cell(r, 3));
		bizSeriesMap.set(k, e);
	}
	for (const r of i.bizIncMonthlyRaw) {
		const k = monthKey(cell(r, 0), cell(r, 1));
		const e = bizSeriesMap.get(k) ?? { revenue: 0, opex: 0 };
		e.revenue += Math.abs(parseNum(cell(r, 2)));
		bizSeriesMap.set(k, e);
	}
	const monthlySeries = [...bizSeriesMap.entries()]
		.sort(([x], [y]) => x.localeCompare(y))
		.map(([month, v]) => ({ month, ...v }));

	return {
		notNonOpex,
		business: {
			bizCash,
			monthlyOpex,
			monthlyTotalExp,
			monthlySurvivalOpex,
			survivalAccounts,
			daysOfCash,
			outstandingLiability,
			liabBand,
			hardLiabilities,
			hardCoverage,
			monthlyRevenue,
			breakevenRevenue,
			breakevenRatio,
			opexTrendPct,
			opexMovers,
			monthlyExcess,
			operatingNet,
			ownerOutflowsMo,
			organic,
			monthlySeries,
		},
	};
}

/**
 * Net-worth composition: partition the same accounts the NW regex covers. The
 * receivable holding is money that will be paid out, so it gets its own slice
 * instead of hiding inside business cash.
 */
export function computeComposition(
	cfg: DomainConfig,
	balances: AcctRows,
	liquid: number,
): CompositionSlice[] {
	const a = cfg.accounts;
	const balanceOf = (account: string) => balances.find(([x]) => x === account)?.[1] ?? 0;
	const balancePrefix = (prefix: string) => sumWhere(balances, (x) => x.startsWith(prefix));
	const receivable = balanceOf(a.outstandingLiab);
	return [
		{ label: 'Personal liquid', value: liquid },
		{ label: 'Personal invested & other', value: balancePrefix('Assets:Personal:') - liquid },
		{
			label: 'Business cash & assets',
			value: balancePrefix('Assets:PhotoPanda:') - receivable,
		},
		{ label: 'Receivable holding (owed out)', value: receivable },
		{ label: 'Personal liabilities', value: balancePrefix('Liabilities:Personal:') },
		{ label: 'Business liabilities', value: balancePrefix(a.businessLiability) },
	].filter((s) => Math.abs(s.value) >= 1);
}
