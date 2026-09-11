// Metric computations ported from healthcheck.py (via quinns-beans-web).
// Fires every BQL query in one Promise.all, then assembles the Metrics object.

import { BQL } from './bql';
import type { DomainConfig } from './config';
import { cell } from './csv';
import { daysBetween, monthInfo, monthsAgo, monthsElapsed, quarterInfo, todayISO } from './dates';
import type { QueryRunner } from './fava-client';
import { computeBusiness, computeComposition } from './metrics-business';
import { FLOW_MONTHS, computeFlows, rootOf } from './metrics-flows';
import { computeEnvelopes, computePersonal } from './metrics-personal';
import {
	firstNum,
	monthKey,
	pctChange,
	status,
	sumCol,
	sumWhere,
	toAcctRows,
} from './metrics-util';
import { parseNum } from './fava-client';
import type { Metrics, Status } from '../types';

const NW_REGEX = /^(Assets|Liabilities):(Personal|PhotoPanda):/;

export async function computeMetrics(client: QueryRunner, cfg: DomainConfig): Promise<Metrics> {
	const a = cfg.accounts;
	const t = cfg.thresholds;
	const today = todayISO();
	const trailing = 6;
	const threeMo = monthsAgo(3);
	const sixMo = monthsAgo(trailing);
	const twelveMo = monthsAgo(12);
	const mE3 = monthsElapsed(threeMo);
	const mE6 = monthsElapsed(sixMo);
	const q = quarterInfo();
	const mo = monthInfo();
	const lastYear = new Date().getFullYear() - 1;
	const qStartLastYear = q.qStart.replace(/^\d{4}/, String(lastYear));
	// Kept as in the source (UTC date math) for parity with the web app.
	const qCutoffLastYear = (() => {
		const d = new Date(qStartLastYear);
		d.setDate(d.getDate() + q.dayOfQuarter);
		return d.toISOString().slice(0, 10);
	})();

	const run = (bql: string) => client.runQuery(bql);
	const envelopeAccounts = cfg.savingsEnvelopes.map((e) => e.account);

	const [
		balancesRaw,
		persExp3Raw,
		persExp6Raw,
		persExpQtdRaw,
		persExpMtdRaw,
		persExpYoyRaw,
		persInc3Raw,
		persInc6Raw,
		persIncQtdRaw,
		persIncYoyRaw,
		bizExp3Raw,
		bizExp6Raw,
		bizExpQtdRaw,
		bizExpYoyRaw,
		bizInc6Raw,
		bizIncQtdRaw,
		bizIncYoyRaw,
		rentCreditsRaw,
		rentLastRaw,
		reimbCreditsRaw,
		nw3Raw,
		nw6Raw,
		nwMonthlyRaw,
		persExpMonthlyRaw,
		persIncMonthlyRaw,
		bizOpexMonthlyRaw,
		bizIncMonthlyRaw,
		envelopeDefsRaw,
		envelopes3Raw,
		contribRaw,
		adsRevenueRaw,
		lastEntryRaw,
		flowsRaw,
	] = await Promise.all([
		run(BQL.balances()),
		run(BQL.accountSums(a.personalExpense, threeMo)),
		run(BQL.accountSums(a.personalExpense, sixMo)),
		run(BQL.accountSums(a.personalExpense, q.qStart)),
		run(BQL.accountSums(a.personalExpense, mo.monthStart)),
		run(BQL.accountSums(a.personalExpense, qStartLastYear, qCutoffLastYear)),
		run(BQL.sumPrefix(a.personalIncome, threeMo)),
		run(BQL.sumPrefix(a.personalIncome, sixMo)),
		run(BQL.sumPrefix(a.personalIncome, q.qStart)),
		run(BQL.sumPrefix(a.personalIncome, qStartLastYear, qCutoffLastYear)),
		run(BQL.bizExpByAcct(a.businessExpense, threeMo)),
		run(BQL.bizExpByAcct(a.businessExpense, sixMo)),
		run(BQL.bizExpByAcct(a.businessExpense, q.qStart)),
		run(BQL.bizExpByAcct(a.businessExpense, qStartLastYear, qCutoffLastYear)),
		run(BQL.sumPrefix(a.businessIncome, sixMo)),
		run(BQL.sumPrefix(a.businessIncome, q.qStart)),
		run(BQL.sumPrefix(a.businessIncome, qStartLastYear, qCutoffLastYear)),
		run(BQL.rentCredits(cfg.rent, sixMo)),
		run(BQL.rentLast(cfg.rent)),
		run(BQL.reimbCredits(cfg.reimbursementPayee, a.personalExpense, sixMo)),
		run(BQL.netWorthAt(threeMo)),
		run(BQL.netWorthAt(sixMo)),
		run(BQL.netWorthMonthly()),
		run(BQL.monthlySums(a.personalExpense, twelveMo)),
		run(BQL.monthlySums(a.personalIncome, twelveMo)),
		run(BQL.bizMonthlyOpex(a.businessExpense, twelveMo)),
		run(BQL.monthlySums(a.businessIncome, twelveMo)),
		run(BQL.envelopeDefs()),
		run(BQL.envelopeBalancesAt(threeMo, envelopeAccounts)),
		cfg.contribAccounts.length
			? run(
					BQL.contribByAcct(
						cfg.contribAccounts.map((c) => c.prefix),
						sixMo,
					),
				)
			: Promise.resolve([] as string[][]),
		run(BQL.adsRevenueByDate(a.businessIncome, a.businessExpense, twelveMo)),
		run(BQL.lastEntry()),
		run(BQL.flowsByMonth(rootOf(a.personalIncome), rootOf(a.personalExpense), monthsAgo(FLOW_MONTHS))),
	]);

	const balances = toAcctRows(balancesRaw);
	const persExp3 = toAcctRows(persExp3Raw);
	const persExp6 = toAcctRows(persExp6Raw);
	const bizExp3 = toAcctRows(bizExp3Raw);
	const bizExp6 = toAcctRows(bizExp6Raw);
	const bizExpQtd = toAcctRows(bizExpQtdRaw);
	const bizExpYoy = toAcctRows(bizExpYoyRaw);

	// ── Personal ──
	const personal = computePersonal({
		cfg,
		today,
		mE3,
		mE6,
		monthPctThrough: mo.pctThrough,
		balances,
		persExp3,
		persExp6,
		persInc3Raw,
		persInc6Raw,
		persExpMtdRaw,
		rentCreditsRaw,
		rentLastRaw,
		reimbCreditsRaw,
		persExpMonthlyRaw,
		persIncMonthlyRaw,
		contribRaw,
	});

	// ── Business ──
	const { business, notNonOpex } = computeBusiness({
		cfg,
		mE3,
		mE6,
		twelveMo,
		balances,
		bizExp3,
		bizExp6,
		bizInc6Raw,
		bizOpexMonthlyRaw,
		bizIncMonthlyRaw,
		adsRevenueRaw,
	});

	// ── Runway ──
	const phase1 = business.monthlySurvivalOpex > 0 ? business.bizCash / business.monthlySurvivalOpex : 99;
	const phase2 =
		personal.monthlySurvivalSpend > 0 ? personal.liquid / personal.monthlySurvivalSpend : 99;
	const runwayTotal = phase1 + phase2;

	// ── Net worth ──
	const nwCurrent = sumWhere(balances, (x) => NW_REGEX.test(x));
	const nw3 = firstNum(nw3Raw);
	const nw6 = firstNum(nw6Raw);
	const composition = computeComposition(cfg, balances, personal.liquid);
	let cum = 0;
	const nwSeries = nwMonthlyRaw
		.map((r) => {
			cum += parseNum(cell(r, 2));
			return { month: monthKey(cell(r, 0), cell(r, 1)), value: cum };
		})
		.slice(-24);

	// ── QTD ──
	const pExpQtd = sumCol(persExpQtdRaw, 1);
	const pIncQtd = Math.abs(firstNum(persIncQtdRaw));
	const pExpTypical = personal.monthlySpend * 3;
	const pIncTypical = personal.monthlyIncome * 3;
	const pace = (actual: number, typical: number) =>
		typical * q.pctThrough > 0 ? (actual / (typical * q.pctThrough)) * 100 : 0;
	const bExpQtd = sumWhere(bizExpQtd, notNonOpex);
	const bRevQtd = Math.abs(firstNum(bizIncQtdRaw));
	const bExpTypical = business.monthlyOpex * 3;
	const bRevTypical = business.monthlyRevenue * 3;

	// ── YoY (same QTD window last year) ──
	const pExpYoyLast = sumCol(persExpYoyRaw, 1);
	const pIncYoyLast = Math.abs(firstNum(persIncYoyRaw));
	const bExpYoyLast = sumWhere(bizExpYoy, notNonOpex);
	const bRevYoyLast = Math.abs(firstNum(bizIncYoyRaw));

	// ── Envelopes ──
	const envelopes = computeEnvelopes(cfg, balances, envelopeDefsRaw, envelopes3Raw);

	// ── Statuses & verdict ──
	const b = business;
	const p = personal;
	const statuses: Record<string, Status> = {
		netWorth: nwCurrent - nw3 > 0 ? 'green' : nwCurrent - nw3 > -1000 ? 'yellow' : 'red',
		runway: status(runwayTotal, t.combinedRunwayGreen, t.combinedRunwayYellow),
		personalRunway: status(p.runwayMonths, t.runwayGreen, t.runwayYellow),
		surplus: status(p.monthlySurplus, t.surplusGreen, t.surplusYellow),
		emergencyFund: status(p.emergencyFund, t.efundGreen, t.efundYellow),
		daysOfCash: status(b.daysOfCash, t.bizDaysGreen, t.bizDaysYellow),
		breakeven: status(b.breakevenRatio, t.breakevenGreen, t.breakevenYellow),
		// Would organic revenue alone keep the lights on if ads went to $0?
		organicFloor: b.organic.usable
			? status(b.organic.breakevenCoverage, t.breakevenGreen, t.breakevenYellow)
			: 'none',
		hardCoverage: status(b.hardCoverage, t.hardCovGreen, t.hardCovYellow),
		// Red only when OPERATIONS lose money; drawing more owner pay than the
		// business nets (ops positive, total negative) is a choice, not a fire.
		excess: b.operatingNet <= 0 ? 'red' : b.monthlyExcess > 0 ? 'green' : 'yellow',
		spendTrend: p.spendTrendPct <= 0 ? 'green' : p.spendTrendPct < 10 ? 'yellow' : 'red',
		opexTrend: b.opexTrendPct <= 0 ? 'green' : b.opexTrendPct < 10 ? 'yellow' : 'red',
		liabBand:
			b.liabBand === 'low-range' || b.liabBand === 'mid-range'
				? 'green'
				: b.liabBand === 'high-range' || b.liabBand === 'below'
					? 'yellow'
					: 'red',
	};

	const indicatorDefs: [number, number, string][] = [
		[p.runwayMonths, t.runwayYellow, 'Personal runway'],
		[p.emergencyFund, t.efundYellow, 'Emergency fund'],
		[p.monthlySurplus, t.surplusYellow, 'Monthly surplus'],
		[b.daysOfCash, t.bizDaysYellow, 'Biz days of cash'],
		[b.breakevenRatio, t.breakevenYellow, 'Breakeven coverage'],
		[b.hardCoverage, t.hardCovYellow, 'Hard liab coverage'],
	];
	const reds = indicatorDefs.filter(([v, y]) => v < y).map(([, , l]) => l);
	const warnings =
		p.monthlySurplus < 0
			? [`Spending exceeds income by $${Math.abs(p.monthlySurplus).toFixed(0)}/mo.`]
			: [];

	const lastEntryDate = cell(lastEntryRaw[0], 0);
	const stalenessDays = lastEntryDate ? daysBetween(lastEntryDate, today) : -1;

	return {
		generatedAt: new Date().toISOString(),
		trailing,
		stalenessDays,
		personal,
		business,
		runway: { phase1, phase2, total: runwayTotal },
		netWorth: {
			current: nwCurrent,
			delta3mo: nwCurrent - nw3,
			delta6mo: nwCurrent - nw6,
			series: nwSeries,
			composition,
		},
		month: { dayOfMonth: mo.dayOfMonth, daysInMonth: mo.daysInMonth, pctThrough: mo.pctThrough },
		qtd: {
			qNum: q.qNum,
			dayOfQuarter: q.dayOfQuarter,
			daysInQuarter: q.daysInQuarter,
			pctThrough: q.pctThrough,
			pExpQtd,
			pExpTypical,
			pExpPace: pace(pExpQtd, pExpTypical),
			pIncQtd,
			pIncTypical,
			pIncPace: pace(pIncQtd, pIncTypical),
			pProjectedSurplus:
				q.pctThrough > 0
					? pIncQtd / q.pctThrough - pExpQtd / q.pctThrough
					: pIncTypical - pExpTypical,
			bExpQtd,
			bExpTypical,
			bExpPace: pace(bExpQtd, bExpTypical),
			bRevQtd,
			bRevTypical,
			bRevPace: pace(bRevQtd, bRevTypical),
			bProjectedNet:
				q.pctThrough > 0 ? (bRevQtd - bExpQtd) / q.pctThrough : bRevTypical - bExpTypical,
		},
		yoy: {
			lastYear,
			pSpend: pctChange(pExpQtd, pExpYoyLast),
			pIncome: pctChange(pIncQtd, pIncYoyLast),
			bRevenue: pctChange(bRevQtd, bRevYoyLast),
			bOpex: pctChange(bExpQtd, bExpYoyLast),
		},
		forecast: {
			combinedNow: p.liquid + b.bizCash,
			combined30d:
				p.liquid + p.monthlySurplus + b.bizCash + (b.monthlyRevenue - b.monthlyTotalExp),
			delta: p.monthlySurplus + b.monthlyRevenue - b.monthlyTotalExp,
		},
		envelopes,
		flows: computeFlows(flowsRaw, cfg, today),
		statuses,
		verdict: { reds, warnings },
	};
}
