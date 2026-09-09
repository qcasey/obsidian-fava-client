// `fava:<alias>` inline values. Aliases are stable, friendly names; any dotted
// Metrics path works as a fallback.

import type { DomainConfig } from '../lib/config';
import { fmtBy, type NumberFormat } from '../lib/fmt';
import { getNumberByPath, slug } from '../lib/path';
import type { Snapshot, Status } from '../types';

export interface InlineAlias {
	alias: string;
	label: string;
	format: NumberFormat;
	status?: string;
	get(s: Snapshot): number;
}

export const INLINE_ALIASES: InlineAlias[] = [
	{ alias: 'net-worth', label: 'Net worth', format: 'money', status: 'netWorth', get: (s) => s.metrics.netWorth.current },
	{ alias: 'net-worth.3mo', label: 'Net worth change, 3 months', format: 'signed', get: (s) => s.metrics.netWorth.delta3mo },
	{ alias: 'net-worth.6mo', label: 'Net worth change, 6 months', format: 'signed', get: (s) => s.metrics.netWorth.delta6mo },
	{ alias: 'runway', label: 'Survival runway', format: 'months', status: 'runway', get: (s) => s.metrics.runway.total },
	{ alias: 'runway.biz', label: 'Business runway phase', format: 'months', get: (s) => s.metrics.runway.phase1 },
	{ alias: 'runway.personal', label: 'Personal runway phase', format: 'months', get: (s) => s.metrics.runway.phase2 },
	{ alias: 'personal-runway', label: 'Personal runway at current spend', format: 'months', status: 'personalRunway', get: (s) => s.metrics.personal.runwayMonths },
	{ alias: 'surplus', label: 'Personal surplus per month', format: 'signed', status: 'surplus', get: (s) => s.metrics.personal.monthlySurplus },
	{ alias: 'savings-rate', label: 'Savings rate', format: 'pct', get: (s) => s.metrics.personal.savingsRate },
	{ alias: 'income', label: 'Personal income per month (3 mo)', format: 'money', get: (s) => s.metrics.personal.monthlyIncome },
	{ alias: 'spend', label: 'Personal spend per month (3 mo)', format: 'money', get: (s) => s.metrics.personal.monthlySpend },
	{ alias: 'burn', label: 'Daily burn, all-in', format: 'perDay', get: (s) => s.metrics.personal.dailyBurn },
	{ alias: 'burn.lifestyle', label: 'Daily burn, lifestyle', format: 'perDay', get: (s) => s.metrics.personal.dailyBurnLifestyle },
	{ alias: 'liquid', label: 'Personal liquid assets', format: 'money', get: (s) => s.metrics.personal.liquid },
	{ alias: 'efund', label: 'Emergency fund', format: 'money', status: 'emergencyFund', get: (s) => s.metrics.personal.emergencyFund },
	{ alias: 'biz-cash', label: 'Business cash', format: 'money', status: 'daysOfCash', get: (s) => s.metrics.business.bizCash },
	{ alias: 'days-of-cash', label: 'Business days of cash', format: 'days', status: 'daysOfCash', get: (s) => s.metrics.business.daysOfCash },
	{ alias: 'breakeven', label: 'Breakeven coverage', format: 'ratio', status: 'breakeven', get: (s) => s.metrics.business.breakevenRatio },
	{ alias: 'revenue', label: 'Business revenue per month', format: 'money', get: (s) => s.metrics.business.monthlyRevenue },
	{ alias: 'opex', label: 'Business opex per month', format: 'money', get: (s) => s.metrics.business.monthlyOpex },
	{ alias: 'biz-net', label: 'Business net after owner pay', format: 'signed', status: 'excess', get: (s) => s.metrics.business.monthlyExcess },
	{ alias: 'hard-liabilities', label: 'Hard liabilities', format: 'money', status: 'hardCoverage', get: (s) => s.metrics.business.hardLiabilities },
	{ alias: 'outstanding', label: 'Outstanding liability', format: 'money', status: 'liabBand', get: (s) => s.metrics.business.outstandingLiability },
	{ alias: 'organic-floor', label: 'Organic revenue floor per month', format: 'money', status: 'organicFloor', get: (s) => s.metrics.business.organic.monthly },
	{ alias: 'fixed.personal', label: 'Personal recurring per month', format: 'money', get: (s) => s.recurring.personalMonthlyTotal },
	{ alias: 'fixed.business', label: 'Business recurring per month', format: 'money', get: (s) => s.recurring.businessMonthlyTotal },
	{ alias: 'upcoming.net30', label: 'Net recurring flows, next 30 days', format: 'signed', get: (s) => s.recurring.upcomingNet30 },
	{ alias: 'forecast.30d', label: 'Combined cash in 30 days', format: 'money', get: (s) => s.metrics.forecast.combined30d },
	{ alias: 'last-entry-days', label: 'Days since last ledger entry', format: 'int', get: (s) => s.metrics.stalenessDays },
];

const FORMATS = new Set<string>(['money', 'signed', 'compact', 'pct', 'signedPct', 'months', 'days', 'ratio', 'int', 'perMonth', 'perDay']);

export interface InlineValue {
	text: string;
	label: string;
	status?: Status;
}

export type InlineResult = { ok: true; value: InlineValue } | { ok: false; error: string };

/** Resolve `<ref>[|<format>]` against a snapshot. */
export function resolveInline(ref: string, snapshot: Snapshot, _cfg: DomainConfig): InlineResult {
	const [rawPath = '', rawFmt] = ref.split('|').map((s) => s.trim());
	const fmtOverride = rawFmt && FORMATS.has(rawFmt) ? (rawFmt as NumberFormat) : undefined;
	const statuses = snapshot.metrics.statuses;

	const alias = INLINE_ALIASES.find((a) => a.alias === rawPath);
	if (alias) {
		return {
			ok: true,
			value: {
				text: fmtBy(fmtOverride ?? alias.format, alias.get(snapshot)),
				label: alias.label,
				status: alias.status ? statuses[alias.status] : undefined,
			},
		};
	}

	const env = /^envelope\.([a-z0-9-]+)(?:\.(balance|target|pct|delta))?$/.exec(rawPath);
	if (env) {
		const e = snapshot.metrics.envelopes.find((x) => slug(x.label) === env[1]);
		if (!e) return { ok: false, error: `No envelope "${env[1]}"` };
		const field = env[2] ?? 'balance';
		const v = field === 'balance' ? e.balance : field === 'target' ? e.target : field === 'pct' ? e.pct : e.delta3mo;
		const f: NumberFormat = field === 'pct' ? 'pct' : field === 'delta' ? 'signed' : 'money';
		return { ok: true, value: { text: fmtBy(fmtOverride ?? f, v), label: `${e.label} ${field}` } };
	}

	const st = /^status\.([A-Za-z]+)$/.exec(rawPath);
	if (st) {
		const s = statuses[st[1] ?? ''];
		if (!s) return { ok: false, error: `No status "${st[1]}"` };
		return { ok: true, value: { text: '●', label: `${st[1]} status: ${s}`, status: s } };
	}

	const n = getNumberByPath(snapshot.metrics, rawPath);
	if (n !== undefined) return { ok: true, value: { text: fmtBy(fmtOverride ?? 'money', n), label: rawPath } };
	return { ok: false, error: `Unknown reference "${rawPath}"` };
}
