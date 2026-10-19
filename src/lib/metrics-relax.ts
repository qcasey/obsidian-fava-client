// "Relax?" — the overview's plain-language answer to "can I keep living like
// this?". Three checks, each reduced to one sentence, and a verdict that is
// the worst of them.
//
// The sentences are written here rather than in the card: every phrasing turns
// on the same branch as the status it reports, and keeping both next to the
// thresholds is what stops the two drifting apart.

import type { DomainConfig } from './config';
import { fmtApproxDuration, fmtApproxMoney } from './fmt';
import { status } from './metrics-util';
import type {
	BusinessMetrics,
	CushionTrend,
	PersonalMetrics,
	Relax,
	RelaxCheck,
	Status,
} from '../types';

/** Months the drain rate is fitted over — long enough to ignore one odd month. */
const TREND_MONTHS = 12;
/** Below this, a month-over-month move is rounding, not a trend. */
const FLAT_PER_MONTH = 50;

/** Least-squares dollars per step through a short series. */
function slope(values: number[]): number {
	const n = values.length;
	if (n < 3) return 0;
	const meanX = (n - 1) / 2;
	const meanY = values.reduce((s, v) => s + v, 0) / n;
	let sxx = 0;
	let sxy = 0;
	for (let i = 0; i < n; i++) {
		sxx += (i - meanX) ** 2;
		sxy += (i - meanX) * ((values[i] ?? 0) - meanY);
	}
	return sxx > 0 ? sxy / sxx : 0;
}

/**
 * The cushion's direction, read off the net-worth series. A fitted slope rather
 * than this month minus that one: the series swings by tens of thousands when a
 * quarterly tax payment lands, and a verdict should not turn on which month you
 * happened to open the dashboard in.
 */
export function computeCushion(series: { month: string; value: number }[]): CushionTrend {
	const back = (n: number): number | undefined => series[series.length - 1 - n]?.value;
	const now = back(0) ?? 0;
	const perMonth = slope(series.slice(-TREND_MONTHS).map((s) => s.value));
	return {
		now,
		change6mo: now - (back(6) ?? now),
		change12mo: now - (back(12) ?? now),
		perMonth,
		drainMonths: perMonth < 0 ? now / -perMonth : Infinity,
	};
}

function billsCheck(cfg: DomainConfig, p: PersonalMetrics, b: BusinessMetrics): RelaxCheck {
	const t = cfg.thresholds;
	// Operating profit is what the business makes before it pays anyone, so this
	// holds whether owner draws are booked as expense, payroll or equity.
	const costOfLife = p.monthlySpendTrailing;
	const headroom = b.operatingNet - costOfLife;
	const coverage = costOfLife > 0 ? b.operatingNet / costOfLife : b.operatingNet > 0 ? 99 : 0;
	return {
		id: 'bills',
		title: 'The bills',
		topic: 'what the business covers',
		status: status(coverage, t.relaxBillsGreen, t.relaxBillsYellow),
		text:
			headroom >= 0
				? `The business earns about ${fmtApproxMoney(headroom)} a month more than your life costs.`
				: `Life costs about ${fmtApproxMoney(-headroom)} a month more than the business earns.`,
	};
}

function cushionCheck(cfg: DomainConfig, c: CushionTrend): RelaxCheck {
	const t = cfg.thresholds;
	const holding = c.perMonth >= -FLAT_PER_MONTH;
	const held = `You are worth about ${fmtApproxMoney(c.now)} all in`;
	let text: string;
	if (holding && c.change12mo > 0) {
		text = `${held}, up roughly ${fmtApproxMoney(c.change12mo)} over the past year. Nothing is being drained.`;
	} else if (holding) {
		text = `${held}, about where you were a year ago. Nothing is being drained.`;
	} else {
		text = `${held}, and slipping about ${fmtApproxMoney(-c.perMonth)} a month. At that pace the cushion lasts ${fmtApproxDuration(c.drainMonths)}.`;
	}
	return {
		id: 'cushion',
		title: 'The cushion',
		topic: 'the cushion',
		status: holding ? 'green' : status(c.drainMonths, t.relaxCushionGreen, t.relaxCushionYellow),
		text,
	};
}

function floorCheck(cfg: DomainConfig, p: PersonalMetrics): RelaxCheck {
	const t = cfg.thresholds;
	const months = p.monthlySpendTrailing > 0 ? p.netAssets / p.monthlySpendTrailing : 99;
	return {
		id: 'floor',
		title: 'Survival runway',
		topic: 'what your own savings cover',
		status: status(months, t.relaxFloorGreen, t.relaxFloorYellow),
		text: `Your own savings cover ${fmtApproxDuration(months)} of life with the business switched off.`,
	};
}

function summaryFor(verdict: Status, sore: RelaxCheck | undefined): string {
	if (verdict === 'green' || !sore) {
		return 'The pace you are living at pays for itself.';
	}
	if (verdict === 'yellow') {
		return `Nothing here needs a decision this month, but ${sore.topic} has started to drift. Worth a look next time you are in the ledger.`;
	}
	return `This is the one that costs you something real: ${sore.topic} has turned. Worth a proper look before the next quarter.`;
}

export function computeRelax(
	cfg: DomainConfig,
	p: PersonalMetrics,
	b: BusinessMetrics,
	cushion: CushionTrend,
): Relax {
	const checks = [billsCheck(cfg, p, b), cushionCheck(cfg, cushion), floorCheck(cfg, p)];
	const verdict: Status = checks.some((c) => c.status === 'red')
		? 'red'
		: checks.some((c) => c.status === 'yellow')
			? 'yellow'
			: 'green';
	const sore = checks.find((c) => c.status === verdict && verdict !== 'green');
	return {
		status: verdict,
		answer: verdict === 'green' ? 'Yes.' : verdict === 'yellow' ? 'Mostly.' : 'Not right now.',
		summary: summaryFor(verdict, sore),
		checks,
		cushion,
	};
}
