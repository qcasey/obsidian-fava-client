// The three readouts that sit beside net worth above the overview grid.
//
// Same contract as the Relax checks: one sentence each, written next to the
// thresholds that colour them, so copy and status cannot drift apart.

import type { DomainConfig } from './config';
import { fmtApproxMoney } from './fmt';
import { status } from './metrics-util';
import type { Envelope, FlowScopeData, Status, StatusNote } from '../types';

/** Trailing window the headline flows sentence speaks for. */
const FLOW_WINDOW = 6;
/** A three-month envelope move smaller than this is not worth mentioning. */
const ENVELOPE_DRIFT = 500;
/** Net change as a share of income, in points, that counts as a real move. */
const LEVEL_POINTS = 3;

function flowsVital(flows: FlowScopeData): StatusNote {
	const w = flows.windows.find((x) => x.months === FLOW_WINDOW) ?? flows.windows[0];
	if (!w || w.counted === 0) {
		return { id: 'flows', title: 'Income vs expenses', status: 'none', text: 'Not enough complete months yet.' };
	}
	const before = `the ${w.months} months before`;
	const direction =
		w.marginPts >= LEVEL_POINTS
			? `better than ${before}`
			: w.marginPts <= -LEVEL_POINTS
				? `down on ${before}`
				: `about level with ${before}`;
	const amount = fmtApproxMoney(Math.abs(w.net));
	return {
		id: 'flows',
		title: 'Income vs expenses',
		status: w.status,
		text:
			w.net >= 0
				? `Across everything you keep about ${amount} a month, ${direction}.`
				: `Across everything you are short about ${amount} a month, ${direction}.`,
	};
}

function envelopesVital(cfg: DomainConfig, envelopes: Envelope[]): StatusNote {
	const t = cfg.thresholds;
	const withTarget = envelopes.filter((e) => e.target > 0);
	if (withTarget.length === 0) {
		return { id: 'envelopes', title: 'Savings envelopes', status: 'none', text: 'No envelopes with a target yet.' };
	}
	const totalBalance = withTarget.reduce((s, e) => s + e.balance, 0);
	const totalTarget = withTarget.reduce((s, e) => s + e.target, 0);
	const ratio = totalTarget > 0 ? totalBalance / totalTarget : 1;
	const funded = withTarget.filter((e) => e.pct >= 100).length;

	// A funded envelope going backwards is the thing worth saying out loud,
	// ahead of one that was simply never started.
	const draining = withTarget
		.filter((e) => e.delta3mo < -ENVELOPE_DRIFT)
		.sort((a, b) => a.delta3mo - b.delta3mo)[0];
	if (draining) {
		return {
			id: 'envelopes',
			title: 'Savings envelopes',
			status: draining.pct < 50 ? 'red' : 'yellow',
			text: `${draining.label} is ${fmtApproxMoney(draining.balance)} of its ${fmtApproxMoney(draining.target)} target, down ${fmtApproxMoney(-draining.delta3mo)} over three months.`,
		};
	}

	const vitalStatus: Status = status(ratio, t.envelopesGreen, t.envelopesYellow);
	if (funded === withTarget.length) {
		return {
			id: 'envelopes',
			title: 'Savings envelopes',
			status: 'green',
			text: `All ${withTarget.length} envelopes are at their target.`,
		};
	}
	const shortest = [...withTarget].filter((e) => e.pct < 100).sort((a, b) => a.pct - b.pct)[0];
	const tail = shortest
		? ` ${shortest.label} is ${fmtApproxMoney(shortest.target - shortest.balance)} short.`
		: '';
	return {
		id: 'envelopes',
		title: 'Savings envelopes',
		status: vitalStatus,
		text: `${funded} of ${withTarget.length} envelopes are funded.${tail}`,
	};
}

export function computeVitals(
	cfg: DomainConfig,
	flows: FlowScopeData,
	envelopes: Envelope[],
): StatusNote[] {
	return [flowsVital(flows), envelopesVital(cfg, envelopes)];
}
