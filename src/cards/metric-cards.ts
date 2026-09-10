// Headline metric cards. Each shows one number plus at most two supporting
// figures; everything else lives in the expandable body.

import { WEEKS_PER_MONTH } from '../settings';
import { fmtBy, fmtDuration, fmtMoney, fmtSigned, fmtSignedPct, fmtWorkTime, type NumberFormat } from '../lib/fmt';
import { getNumberByPath } from '../lib/path';
import type { Status } from '../types';
import { cardShell, kv, note } from '../ui/dom';
import { drawLine } from '../ui/charts/line';
import { fmtMonth } from '../lib/fmt';
import type { CardContext, CardDef, Params } from './types';

const FORMATS = ['money', 'signed', 'compact', 'pct', 'signedPct', 'months', 'days', 'ratio', 'int', 'perMonth', 'perDay'] as const;

const key = (ctx: CardContext, id: string) => `${ctx.keyPrefix}:${id}`;
const str = (p: Params, k: string): string | undefined => (typeof p[k] === 'string' ? (p[k]) : undefined);
const bool = (p: Params, k: string, d: boolean): boolean => (typeof p[k] === 'boolean' ? (p[k]) : d);
const num = (p: Params, k: string, d: number): number => (typeof p[k] === 'number' ? (p[k]) : d);

export const metricCard: CardDef = {
	id: 'metric',
	title: 'Single metric',
	desc: 'Any number from the metrics tree, by dotted path.',
	params: [
		{ name: 'key', kind: 'string', required: true, desc: 'Dotted path, e.g. personal.liquid' },
		{ name: 'label', kind: 'string', desc: 'Card label (defaults to the key)' },
		{ name: 'format', kind: { enum: FORMATS }, default: 'money', desc: 'Number format' },
		{ name: 'status', kind: 'string', desc: 'Status key, e.g. runway' },
		{ name: 'detail', kind: 'string', desc: 'Small text under the value' },
	],
	render(el, ctx, p) {
		const path = str(p, 'key') ?? '';
		const v = getNumberByPath(ctx.snapshot.metrics, path);
		const status = str(p, 'status');
		cardShell(el, {
			label: str(p, 'label') ?? path,
			value: v === undefined ? '—' : fmtBy((str(p, 'format') as NumberFormat | undefined) ?? 'money', v),
			detail: v === undefined ? `No number at "${path}"` : str(p, 'detail'),
			status: status ? ctx.snapshot.metrics.statuses[status] : undefined,
		});
	},
};

export const netWorthCard: CardDef = {
	id: 'net-worth',
	title: 'Net worth',
	desc: 'Personal + business net worth with 3/6-month change and a trend line.',
	params: [
		{ name: 'sparkline', kind: 'boolean', default: true, desc: 'Show the trend line' },
		{ name: 'months', kind: 'number', default: 24, desc: 'Months of history' },
	],
	render(el, ctx, p) {
		const { netWorth: nw, statuses } = ctx.snapshot.metrics;
		const shell = cardShell(el, {
			label: 'Net worth',
			value: fmtMoney(nw.current),
			detail: `${fmtSigned(nw.delta3mo)} in 3 months · ${fmtSigned(nw.delta6mo)} in 6`,
			status: statuses.netWorth,
			href: ctx.links.enabled ? ctx.links.netWorth() : undefined,
			toggle: { key: key(ctx, 'net-worth'), ui: ctx.ui },
		});
		if (bool(p, 'sparkline', true)) {
			const series = nw.series.slice(-num(p, 'months', 24));
			drawLine(shell.card.createDiv({ cls: 'fava-card__chart' }), series.map((s) => ({ label: s.month, value: s.value })), {
				formatY: (v) => fmtBy('compact', v),
				formatX: (l) => fmtMonth(l, true),
				sparkline: true,
			});
		}
		for (const s of nw.composition) {
			kv(shell.body, s.label, fmtMoney(s.value), { valueClass: s.value < 0 ? 'is-red' : '' });
		}
	},
};

export const runwayCard: CardDef = {
	id: 'runway',
	title: 'Survival runway',
	desc: 'Months you could last: business on survival opex, then personal savings.',
	params: [],
	render(el, ctx) {
		const m = ctx.snapshot.metrics;
		const { runway: r, business: b, personal: p, statuses } = m;
		const shell = cardShell(el, {
			label: 'Survival runway',
			value: `${r.total.toFixed(1)} mo`,
			detail: `business ${r.phase1.toFixed(1)} + personal ${r.phase2.toFixed(1)}`,
			status: statuses.runway,
			toggle: { key: key(ctx, 'runway'), ui: ctx.ui },
		});
		note(shell.body, 'Sequential drawdown: cut the business to survival opex first, then live off personal savings. Taxes excluded.');
		kv(shell.body, 'Phase 1 · business cash', `${fmtMoney(b.bizCash)} ÷ ${fmtMoney(b.monthlySurvivalOpex)}/mo`, { muted: true });
		kv(shell.body, '', `${r.phase1.toFixed(1)} months`, { strong: true });
		kv(shell.body, 'Phase 2 · personal liquid', `${fmtMoney(p.liquid)} ÷ ${fmtMoney(p.monthlySurvivalSpend)}/mo`, { muted: true });
		kv(shell.body, '', `${r.phase2.toFixed(1)} months`, { strong: true });
		if (p.survivalIncomeMo > 0) {
			note(shell.body, `Survival spend is ${fmtMoney(p.grossLifestyleMo)}/mo lifestyle less ${fmtMoney(p.survivalIncomeMo)}/mo rent income.`);
		}
		kv(shell.body, 'Personal-only runway at current spend', `${p.runwayMonths.toFixed(1)} mo`, { valueClass: statusClass(statuses.personalRunway) });
	},
};

export const surplusCard: CardDef = {
	id: 'surplus',
	title: 'Personal surplus',
	desc: 'Monthly income minus spend (3-month average) and savings rate.',
	params: [],
	render(el, ctx) {
		const { personal: p, statuses, trailing } = ctx.snapshot.metrics;
		const shell = cardShell(el, {
			label: 'Personal surplus',
			value: `${fmtSigned(p.monthlySurplus)}/mo`,
			detail: `saving ${p.savingsRate.toFixed(0)}% of income`,
			status: statuses.surplus,
			valueClass: p.monthlySurplus < 0 ? 'is-red' : '',
			href: ctx.links.enabled ? ctx.links.personal() : undefined,
			toggle: { key: key(ctx, 'surplus'), ui: ctx.ui },
		});
		kv(shell.body, 'Income (3 mo avg)', `${fmtMoney(p.monthlyIncome)}/mo`);
		kv(shell.body, 'Spend (3 mo avg)', `${fmtMoney(p.monthlySpend)}/mo`);
		kv(shell.body, `Income (${trailing} mo avg)`, `${fmtMoney(p.monthlyIncomeTrailing)}/mo`, { muted: true });
		kv(shell.body, 'Emergency fund', fmtMoney(p.emergencyFund), { valueClass: statusClass(statuses.emergencyFund) });
	},
};

export const businessCashCard: CardDef = {
	id: 'business-cash',
	title: 'Business cash',
	desc: 'Checking + Stripe balance and days of cash at current opex.',
	params: [],
	render(el, ctx) {
		const { business: b, statuses } = ctx.snapshot.metrics;
		const shell = cardShell(el, {
			label: 'Business cash',
			value: fmtMoney(b.bizCash),
			detail: `${b.daysOfCash} days at current opex`,
			status: statuses.daysOfCash,
			href: ctx.links.enabled ? ctx.links.bizCash() : undefined,
			toggle: { key: key(ctx, 'business-cash'), ui: ctx.ui },
		});
		kv(shell.body, 'Full opex', `${fmtMoney(b.monthlyOpex)}/mo`);
		kv(shell.body, 'Survival opex', `${fmtMoney(b.monthlySurvivalOpex)}/mo`);
		kv(shell.body, 'All business outflows', `${fmtMoney(b.monthlyTotalExp)}/mo`, { muted: true });
		kv(shell.body, 'Hard liabilities', fmtMoney(b.hardLiabilities), { valueClass: statusClass(statuses.hardCoverage) });
		kv(shell.body, 'Cash covers them', `${b.hardCoverage.toFixed(1)}x`, { muted: true });
	},
};

export const businessNetCard: CardDef = {
	id: 'business-net',
	title: 'Business net after owner pay',
	desc: 'Revenue minus every business outflow, including your pay and taxes.',
	params: [],
	render(el, ctx) {
		const { business: b, statuses } = ctx.snapshot.metrics;
		const shell = cardShell(el, {
			label: 'Business net (after paying you)',
			value: `${fmtSigned(b.monthlyExcess)}/mo`,
			detail:
				b.monthlyExcess >= 0
					? 'surplus available'
					: b.operatingNet > 0
						? 'drawing down business cash by choice'
						: 'operations are losing money',
			status: statuses.excess,
			valueClass: b.monthlyExcess < 0 ? 'is-red' : '',
			href: ctx.links.enabled ? ctx.links.business() : undefined,
			toggle: { key: key(ctx, 'business-net'), ui: ctx.ui },
		});
		kv(shell.body, 'Revenue', `${fmtMoney(b.monthlyRevenue)}/mo`);
		kv(shell.body, 'Operating net', `${fmtSigned(b.operatingNet)}/mo`);
		kv(shell.body, 'Owner pay & taxes', `${fmtMoney(b.ownerOutflowsMo)}/mo`);
		kv(shell.body, 'Breakeven coverage', `${b.breakevenRatio.toFixed(1)}x`, { muted: true });
	},
};

export const breakevenCard: CardDef = {
	id: 'breakeven',
	title: 'Breakeven coverage',
	desc: 'Revenue ÷ survival opex, with the ad-free organic revenue floor.',
	params: [{ name: 'organic', kind: 'boolean', default: true, desc: 'Show the organic-floor regression' }],
	render(el, ctx, p) {
		const { business: b, statuses } = ctx.snapshot.metrics;
		const o = b.organic;
		const shell = cardShell(el, {
			label: 'Breakeven coverage',
			value: `${b.breakevenRatio.toFixed(1)}x`,
			detail: `${fmtMoney(b.monthlyRevenue)}/mo revenue vs ${fmtMoney(b.breakevenRevenue)}/mo to keep the lights on`,
			status: statuses.breakeven,
			href: ctx.links.enabled ? ctx.links.bizOpex() : undefined,
			toggle: { key: key(ctx, 'breakeven'), ui: ctx.ui },
		});
		if (bool(p, 'organic', true)) {
			if (o.usable) {
				kv(shell.body, 'Organic floor (ads → $0)', `${fmtMoney(o.monthly)}/mo`, { strong: true, valueClass: statusClass(statuses.organicFloor) });
				kv(shell.body, 'Share of revenue', `${(o.share * 100).toFixed(0)}%`);
				kv(shell.body, 'Covers breakeven', `${o.breakevenCoverage.toFixed(1)}x`);
				kv(shell.body, 'Revenue per ad dollar', `$${o.revenuePerAdDollar.toFixed(2)}`, { muted: true });
				kv(shell.body, 'Fit', `r² ${o.r2.toFixed(2)} over ${o.nWeeks} weeks`, { muted: true });
			} else {
				note(shell.body, `Organic floor not estimable yet (${o.nWeeks} weeks of data, need 12 with a positive fit).`);
			}
		}
	},
};

export const trendCard: CardDef = {
	id: 'trend',
	title: 'Spend / opex trend',
	desc: '3-month vs trailing average, with the categories that moved most.',
	params: [{ name: 'side', kind: { enum: ['personal', 'business'] }, default: 'personal', desc: 'Which ledger side' }],
	render(el, ctx, p) {
		const m = ctx.snapshot.metrics;
		const biz = str(p, 'side') === 'business';
		const pct = biz ? m.business.opexTrendPct : m.personal.spendTrendPct;
		const movers = biz ? m.business.opexMovers : m.personal.spendMovers;
		const shell = cardShell(el, {
			label: biz ? `Opex trend (3 vs ${m.trailing} mo)` : `Spend trend (3 vs ${m.trailing} mo)`,
			value: fmtSignedPct(pct),
			detail: movers.length ? `${movers.length} categor${movers.length === 1 ? 'y' : 'ies'} shifted` : 'no significant category shifts',
			status: biz ? m.statuses.opexTrend : m.statuses.spendTrend,
			href: ctx.links.enabled ? (biz ? ctx.links.bizOpex() : ctx.links.spendAccount()) : undefined,
			toggle: movers.length ? { key: key(ctx, `trend-${biz ? 'b' : 'p'}`), ui: ctx.ui } : undefined,
		});
		for (const mv of movers) {
			kv(shell.body, mv.category, `${fmtSigned(mv.changePerMo)}/mo (${mv.pctChange > 0 ? '+' : ''}${mv.pctChange.toFixed(0)}%)`, {
				valueClass: mv.changePerMo > 0 ? 'is-red' : 'is-green',
			});
		}
	},
};

export const hoursToBuyCard: CardDef = {
	id: 'hours-to-buy',
	title: 'How many hours is that?',
	desc: 'Type a price, see the after-tax work time it costs.',
	params: [{ name: 'price', kind: 'number', desc: 'Prefill a price' }],
	render(el, ctx, p) {
		const { personal: pm, trailing } = ctx.snapshot.metrics;
		const hours = ctx.settings.hoursPerWeek;
		const hoursPerMonth = hours * WEEKS_PER_MONTH;
		const afterTax = (pm.monthlyIncomeTrailing - pm.taxMoTrailing) / hoursPerMonth;
		const gross = pm.monthlyIncomeTrailing / hoursPerMonth;
		const shell = cardShell(el, {
			label: 'How many hours is that?',
			toggle: { key: key(ctx, 'hours'), ui: ctx.ui },
		});
		const row = shell.header.querySelector('.fava-card__main');
		const form = (row instanceof HTMLElement ? row : shell.card).createDiv({ cls: 'fava-hours' });
		const inputWrap = form.createDiv({ cls: 'fava-hours__input' });
		inputWrap.createSpan({ text: '$', cls: 'fava-hours__prefix' });
		const input = inputWrap.createEl('input', {
			type: 'text',
			attr: { inputmode: 'decimal', placeholder: '0', 'aria-label': 'Price in dollars', 'data-persist': `${ctx.keyPrefix}:hours-price` },
		});
		const out = form.createDiv({ cls: 'fava-hours__out' });
		const big = out.createDiv({ cls: 'fava-card__value', text: '—' });
		const small = out.createDiv({ cls: 'fava-card__detail', text: 'of after-tax work' });
		const update = () => {
			const amount = Number(input.value.replace(/[^0-9.]/g, ''));
			const valid = input.value.trim() !== '' && Number.isFinite(amount) && amount > 0 && afterTax > 0;
			const total = valid ? amount / afterTax : 0;
			big.setText(valid ? fmtDuration(total) : '—');
			small.setText((valid && fmtWorkTime(total, hours)) || 'of after-tax work');
		};
		const preset = num(p, 'price', 0);
		if (preset > 0) input.value = String(preset);
		update();
		ctx.component.registerDomEvent(input, 'input', update);

		kv(shell.body, 'After tax', `$${afterTax.toFixed(0)}/hr`, { strong: true });
		kv(shell.body, 'Gross', `$${gross.toFixed(0)}/hr`, { muted: true });
		kv(shell.body, 'Lifestyle burn', `${(afterTax > 0 ? pm.dailyBurnLifestyle / afterTax : 0).toFixed(1)} h of work per day`);
		const sliderRow = shell.body.createDiv({ cls: 'fava-slider' });
		const sliderLabel = sliderRow.createDiv({ cls: 'fava-kv is-muted' });
		sliderLabel.createSpan({ cls: 'fava-kv__label', text: 'Hours worked per week' });
		const hoursOut = sliderLabel.createSpan({ cls: 'fava-kv__value', text: `${hours} h` });
		const slider = sliderRow.createEl('input', {
			type: 'range',
			attr: { min: '10', max: '80', step: '1', value: String(hours), 'aria-label': 'Hours worked per week' },
		});
		ctx.component.registerDomEvent(slider, 'input', () => hoursOut.setText(`${slider.value} h`));
		ctx.component.registerDomEvent(slider, 'change', () => ctx.setHoursPerWeek(Number(slider.value)));
		note(shell.body, `From ${fmtMoney(pm.monthlyIncomeTrailing)}/mo income and ${fmtMoney(pm.taxMoTrailing)}/mo taxes paid (${trailing} mo avg). Hours are your estimate.`);
	},
};

export const verdictCard: CardDef = {
	id: 'verdict',
	title: 'Verdict',
	desc: 'Indicators that need attention. Hidden on the dashboard while everything is healthy.',
	params: [],
	render(el, ctx) {
		const { verdict } = ctx.snapshot.metrics;
		const issues = [...verdict.reds, ...verdict.warnings];
		if (issues.length === 0 && ctx.inDashboard) {
			// Nothing to say: stay out of the way.
			el.addClass('fava-card--hidden');
			return;
		}
		el.addClass('fava-card', 'fava-verdict', issues.length ? 'is-red' : 'is-green');
		const head = el.createDiv({ cls: 'fava-verdict__head' });
		head.createSpan({ cls: 'fava-dot ' + (issues.length ? 'is-red' : 'is-green') });
		head.createSpan({ text: issues.length ? 'Needs attention' : 'All core indicators healthy' });
		if (issues.length) {
			const ul = el.createEl('ul', { cls: 'fava-verdict__list' });
			for (const x of issues) ul.createEl('li', { text: x });
		}
	},
};

function statusClass(s: Status | undefined): string {
	return s && s !== 'none' ? `is-${s}` : '';
}

export const METRIC_CARDS: CardDef[] = [
	metricCard,
	netWorthCard,
	runwayCard,
	surplusCard,
	businessCashCard,
	businessNetCard,
	breakevenCard,
	trendCard,
	hoursToBuyCard,
	verdictCard,
];
