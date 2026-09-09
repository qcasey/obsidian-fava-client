// Chart-bearing cards: where income goes, monthly bars, burn.

import { fmtCompact, fmtMoney, fmtMonth } from '../lib/fmt';
import { drawGroupedBars } from '../ui/charts/bars';
import { drawDonut, type DonutSlice } from '../ui/charts/donut';
import { cardShell, kv, segmented } from '../ui/dom';
import { categoryBarsInto } from './list-cards';
import type { CardContext, CardDef, Params } from './types';

const key = (ctx: CardContext, id: string) => `${ctx.keyPrefix}:${id}`;
const str = (p: Params, k: string): string | undefined => (typeof p[k] === 'string' ? (p[k]) : undefined);
const bool = (p: Params, k: string, d: boolean): boolean => (typeof p[k] === 'boolean' ? (p[k]) : d);
const num = (p: Params, k: string, d: number): number => (typeof p[k] === 'number' ? (p[k]) : d);

const MAX_COLORED = 5;

interface RingCat {
	name: string;
	monthly: number;
}

/** Top-5 coloured slices, the rest folded into "Other". */
function toSlices(cats: RingCat[]): DonutSlice[] {
	const positive = cats.filter((c) => c.monthly > 0).sort((a, b) => b.monthly - a.monthly);
	const slices: DonutSlice[] = positive
		.slice(0, MAX_COLORED)
		.map((c, i) => ({ name: c.name, value: c.monthly, cls: `is-slot-${i + 1}` }));
	const other = positive.slice(MAX_COLORED).reduce((s, c) => s + c.monthly, 0);
	if (other > 0) slices.push({ name: 'Other', value: other, cls: 'is-other', muted: true });
	return slices;
}

export const spendRingCard: CardDef = {
	id: 'spend-ring',
	title: 'Where income goes',
	desc: 'Donut of spend as a share of income; the gap is unspent.',
	wide: true,
	params: [
		{ name: 'view', kind: { enum: ['general', 'specific'] }, default: 'general', desc: 'Group categories or show each' },
		{ name: 'toggle', kind: 'boolean', default: true, desc: 'Show the general/specific switch' },
	],
	render(el, ctx, p) {
		const m = ctx.snapshot.metrics;
		const pm = m.personal;
		const cats = pm.burnCats.filter((c) => Math.abs(c.monthly) >= 1);
		const groupOf = new Map<string, string>();
		for (const g of ctx.cfg.spendGroups) for (const c of g.categories) groupOf.set(c, g.label);
		const generalSums = new Map<string, number>();
		for (const c of cats) {
			const g = groupOf.get(c.category) ?? 'Other';
			generalSums.set(g, (generalSums.get(g) ?? 0) + c.monthly);
		}
		const general: RingCat[] = [...generalSums.entries()].map(([name, monthly]) => ({ name, monthly }));
		const specific: RingCat[] = cats.map((c) => ({ name: c.category, monthly: c.monthly }));
		const income = pm.monthlyIncomeTrailing;

		const shell = cardShell(el, {
			label: 'Where income goes',
			value: `${fmtMoney(income)}/mo`,
			detail: `${m.trailing} month average income`,
		});
		const viewKey = key(ctx, 'ring-view');
		let view: 'general' | 'specific' = (str(p, 'view') as 'general' | 'specific' | undefined) ?? 'general';
		if (ctx.ui.isExpanded(viewKey)) view = view === 'general' ? 'specific' : 'general';
		const initial = view;
		const chartHost = shell.body.createDiv({ cls: 'fava-ring' });

		const draw = () => {
			chartHost.empty();
			const spend = toSlices(view === 'general' ? general : specific);
			const contrib: DonutSlice[] = pm.contrib
				.filter((c) => c.monthly > 0)
				.map((c) => ({ name: c.label, value: c.monthly, cls: 'is-contrib' }));
			const spent = spend.reduce((s, x) => s + x.value, 0);
			const invested = contrib.reduce((s, x) => s + x.value, 0);
			const whole = Math.max(income, spent + invested);
			const unspent = whole - spent - invested;
			const all = [...spend, ...contrib];
			if (unspent > 0.5) all.push({ name: 'Unspent', value: unspent, cls: 'is-unspent', muted: true });
			const pctOf = (v: number) => (whole > 0 ? (v / whole) * 100 : 0);
			const fmtPctOf = (v: number) => {
				const pct = pctOf(v);
				return pct > 0 && pct < 1 ? '<1%' : `${pct.toFixed(0)}%`;
			};
			drawDonut(chartHost, all, {
				centerBig: income > 0 ? `${Math.round((spent / income) * 100)}%` : '—',
				centerSmall: 'of income spent',
				centerExtra: invested > 0 && income > 0 ? `+${Math.round((invested / income) * 100)}% invested` : undefined,
				formatTip: (s) => `${s.name}: ${fmtMoney(s.value)}/mo · ${fmtPctOf(s.value)}`,
			});
			const chips = chartHost.createDiv({ cls: 'fava-chips' });
			for (const s of all) {
				const chip = chips.createSpan({ cls: `fava-chip${s.muted ? ' is-muted' : ''}` });
				chip.createSpan({ cls: `fava-chip__swatch ${s.cls}` });
				chip.createSpan({ text: `${s.name} ${fmtPctOf(s.value)}` });
				chip.setAttr('title', `${fmtMoney(s.value)}/mo`);
			}
			if (spent + invested > income && income > 0) {
				chartHost.createDiv({
					cls: 'fava-note',
					text: `Spend and contributions exceed income (${Math.round(((spent + invested) / income) * 100)}%), so the ring shows shares of the total.`,
				});
			}
		};

		if (bool(p, 'toggle', true)) {
			segmented(
				shell.body,
				[
					{ value: 'general', label: 'Groups' },
					{ value: 'specific', label: 'Categories' },
				],
				view,
				(v) => {
					view = v;
					// Persist the flip relative to the configured default
					if ((v !== initial) !== ctx.ui.isExpanded(viewKey)) ctx.ui.toggle(viewKey);
					draw();
				},
			);
		}
		shell.body.appendChild(chartHost);
		draw();
	},
};

export const monthlyBarsCard: CardDef = {
	id: 'monthly-bars',
	title: 'Monthly bars',
	desc: 'Income vs spend (personal) or revenue vs opex (business) by month.',
	wide: true,
	params: [
		{ name: 'side', kind: { enum: ['personal', 'business'] }, default: 'personal', desc: 'Ledger side' },
		{ name: 'months', kind: 'number', default: 12, desc: 'Months to show' },
	],
	render(el, ctx, p) {
		const m = ctx.snapshot.metrics;
		const biz = str(p, 'side') === 'business';
		const months = num(p, 'months', 12);
		const shell = cardShell(el, {
			label: biz ? 'Revenue vs opex' : 'Income vs spend',
			detail: `last ${months} months`,
		});
		const host = shell.body.createDiv({ cls: 'fava-card__chart' });
		const opts = {
			formatY: (v: number) => fmtCompact(v),
			formatX: (l: string) => fmtMonth(l),
			formatTip: (v: number) => fmtMoney(v),
		};
		if (biz) {
			const data = m.business.monthlySeries.slice(-months).map((s) => ({ label: s.month, values: [s.revenue, s.opex] }));
			drawGroupedBars(host, data, [{ name: 'Revenue', slot: 1 }, { name: 'Opex', slot: 2 }], opts);
		} else {
			const data = m.personal.monthlySeries.slice(-months).map((s) => ({ label: s.month, values: [s.income, s.spend] }));
			drawGroupedBars(host, data, [{ name: 'Income', slot: 1 }, { name: 'Spend', slot: 2 }], opts);
		}
	},
};

export const burnCard: CardDef = {
	id: 'burn',
	title: 'Burn rate',
	desc: 'Daily burn all-in and lifestyle-only, with per-category bars on tap.',
	params: [
		{ name: 'mode', kind: { enum: ['all-in', 'lifestyle', 'both'] }, default: 'both', desc: 'Which burn figure leads' },
		{ name: 'categories', kind: 'boolean', default: true, desc: 'Expandable per-category bars' },
	],
	render(el, ctx, p) {
		const m = ctx.snapshot.metrics;
		const pm = m.personal;
		const mode = str(p, 'mode') ?? 'both';
		const lead = mode === 'lifestyle' ? pm.dailyBurnLifestyle : pm.dailyBurn;
		const showCats = bool(p, 'categories', true);
		const shell = cardShell(el, {
			label: mode === 'lifestyle' ? 'Burn — lifestyle' : mode === 'all-in' ? 'Burn — all-in' : 'Burn',
			value: `$${lead.toFixed(0)}/day`,
			detail:
				mode === 'both'
					? `${fmtMoney(pm.monthlySpendTrailing)}/mo all-in · $${pm.dailyBurnLifestyle.toFixed(0)}/day without taxes`
					: mode === 'lifestyle'
						? `${fmtMoney(pm.monthlyLifestyleTrailing)}/mo excluding ${fmtMoney(pm.taxMoTrailing)}/mo taxes`
						: `${fmtMoney(pm.monthlySpendTrailing)}/mo including taxes (${m.trailing} mo avg)`,
			toggle: showCats ? { key: key(ctx, `burn-${mode}`), ui: ctx.ui } : undefined,
		});
		if (!showCats) return;
		kv(shell.body, 'All-in', `${fmtMoney(pm.monthlySpendTrailing)}/mo`, { muted: true });
		kv(shell.body, 'Lifestyle (no taxes)', `${fmtMoney(pm.monthlyLifestyleTrailing)}/mo`, { muted: true });
		const cats = pm.burnCats.filter((c) => Math.abs(c.monthly) >= 1);
		categoryBarsInto(shell.body.createDiv({ cls: 'fava-cats' }), mode === 'lifestyle' ? cats.filter((c) => c.category !== 'Government') : cats, true);
	},
};

export const CHART_CARDS: CardDef[] = [spendRingCard, monthlyBarsCard, burnCard];
