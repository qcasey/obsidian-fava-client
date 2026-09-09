// List/table style cards: envelopes, recurring charges, composition, pacing.

import { DAYS_PER_MONTH } from '../lib/dates';
import { fmtDay, fmtMoney, fmtSigned } from '../lib/fmt';
import type { RecurringItem, Side } from '../types';
import { bar, barRow, cardShell, kv, note, trendGlyph } from '../ui/dom';
import type { CardContext, CardDef, Params } from './types';

const key = (ctx: CardContext, id: string) => `${ctx.keyPrefix}:${id}`;
const str = (p: Params, k: string): string | undefined => (typeof p[k] === 'string' ? (p[k]) : undefined);
const bool = (p: Params, k: string, d: boolean): boolean => (typeof p[k] === 'boolean' ? (p[k]) : d);
const num = (p: Params, k: string, d: number): number => (typeof p[k] === 'number' ? (p[k]) : d);

const CADENCE_SHORT: Record<RecurringItem['cadence'], string> = {
	weekly: 'wk',
	'every 2 weeks': '2wk',
	monthly: 'mo',
	quarterly: 'qtr',
	yearly: 'yr',
};

function envelopeRow(parent: HTMLElement, e: { label: string; balance: number; target: number; pct: number; delta3mo: number }): void {
	const row = parent.createDiv({ cls: 'fava-envelope' });
	const top = row.createDiv({ cls: 'fava-envelope__top' });
	top.createSpan({ cls: 'fava-envelope__label', text: e.label });
	const right = top.createSpan({ cls: 'fava-envelope__amounts' });
	right.createSpan({ text: `${fmtMoney(e.balance)} / ${fmtMoney(e.target)}` });
	if (e.delta3mo !== 0) {
		right.createSpan({ cls: e.delta3mo > 0 ? 'is-green' : 'is-red', text: ` ${fmtSigned(e.delta3mo)} (3 mo)` });
	}
	bar(row, e.pct, e.pct >= 100 ? 'green' : 'normal');
	row.createDiv({ cls: 'fava-envelope__pct', text: `${e.pct.toFixed(0)}%` });
}

export const envelopeCard: CardDef = {
	id: 'envelope',
	title: 'Savings envelope',
	desc: 'One savings goal: balance, target, progress and 3-month change.',
	params: [
		{ name: 'label', kind: 'string', desc: 'Envelope label, e.g. Home Downpayment' },
		{ name: 'account', kind: 'string', desc: 'Or the account name' },
	],
	render(el, ctx, p) {
		const label = str(p, 'label');
		const account = str(p, 'account');
		const e = ctx.snapshot.metrics.envelopes.find(
			(x) => (label && x.label.toLowerCase() === label.toLowerCase()) || (account && x.account === account),
		);
		if (!e) {
			cardShell(el, {
				label: 'Savings envelope',
				value: '—',
				detail: `No envelope matches "${label ?? account ?? '(missing label/account)'}". Known: ${ctx.snapshot.metrics.envelopes.map((x) => x.label).join(', ')}`,
			});
			return;
		}
		const shell = cardShell(el, {
			label: e.label,
			value: fmtMoney(e.balance),
			detail: `${e.pct.toFixed(0)}% of ${fmtMoney(e.target)}${e.delta3mo !== 0 ? ` · ${fmtSigned(e.delta3mo)} in 3 months` : ''}`,
			href: ctx.links.enabled ? ctx.links.account(e.account) : undefined,
		});
		bar(shell.body, e.pct, e.pct >= 100 ? 'green' : 'normal');
		if (e.pct < 100 && e.delta3mo > 0) {
			const monthsLeft = (e.target - e.balance) / (e.delta3mo / 3);
			note(shell.body, `At the recent pace, ${fmtMoney(e.target - e.balance)} to go ≈ ${monthsLeft.toFixed(0)} months.`);
		}
	},
};

export const envelopesCard: CardDef = {
	id: 'envelopes',
	title: 'Savings envelopes',
	desc: 'Every configured savings goal with progress bars.',
	params: [],
	render(el, ctx) {
		const shell = cardShell(el, { label: 'Savings envelopes' });
		for (const e of ctx.snapshot.metrics.envelopes) envelopeRow(shell.body, e);
		if (ctx.snapshot.metrics.envelopes.length === 0) note(shell.body, 'No envelopes configured.');
	},
};

function recurringRows(parent: HTMLElement, items: RecurringItem[]): void {
	for (const i of items) {
		const credit = i.typicalAmount < 0;
		const row = parent.createDiv({ cls: 'fava-rec' });
		const left = row.createDiv({ cls: 'fava-rec__left' });
		const name = left.createDiv({ cls: 'fava-rec__name' });
		name.createSpan({ text: i.payee });
		if (i.driftPct !== 0) {
			name.createSpan({
				cls: `fava-rec__drift ${i.driftPct > 0 ? 'is-red' : 'is-green'}`,
				text: `${i.driftPct > 0 ? '▲' : '▼'}${Math.abs(i.driftPct).toFixed(0)}%`,
			});
		}
		left.createDiv({
			cls: 'fava-rec__meta',
			text: `${i.category} · ${i.cadence}${i.amountVaries ? ' · varies' : ''} · next ${fmtDay(i.nextDue)}`,
		});
		const right = row.createDiv({ cls: 'fava-rec__right' });
		const amt = right.createDiv({ cls: `fava-rec__amount${credit ? ' is-green' : ''}` });
		amt.createSpan({ text: `${credit ? '+' : ''}${fmtMoney(Math.abs(i.typicalAmount))}` });
		amt.createSpan({ cls: 'fava-rec__unit', text: `/${CADENCE_SHORT[i.cadence]}` });
		if (i.cadence !== 'monthly') right.createDiv({ cls: 'fava-rec__meta', text: `≈${fmtMoney(Math.abs(i.monthlyEq))}/mo` });
	}
}

export const recurringCard: CardDef = {
	id: 'recurring',
	title: 'Recurring charges',
	desc: 'Charges detected on a steady cadence — the spending floor.',
	params: [
		{ name: 'side', kind: { enum: ['personal', 'business', 'both'] }, default: 'personal', desc: 'Ledger side' },
		{ name: 'kind', kind: { enum: ['expense', 'income', 'all'] }, default: 'expense', desc: 'Expenses, income or both' },
		{ name: 'limit', kind: 'number', desc: 'Show at most N rows' },
		{ name: 'collapsed', kind: 'boolean', default: false, desc: 'Start collapsed (total only)' },
	],
	render(el, ctx, p) {
		const side = str(p, 'side') ?? 'personal';
		const kind = str(p, 'kind') ?? 'expense';
		const rec = ctx.snapshot.recurring;
		let items = rec.items.filter((i) => (side === 'both' || i.side === side) && (kind === 'all' || i.kind === kind));
		items = [...items].sort((a, b) => Math.abs(b.monthlyEq) - Math.abs(a.monthlyEq));
		const limit = num(p, 'limit', 0);
		if (limit > 0) items = items.slice(0, limit);
		const total = side === 'personal' ? rec.personalMonthlyTotal : side === 'business' ? rec.businessMonthlyTotal : rec.personalMonthlyTotal + rec.businessMonthlyTotal;
		const k = key(ctx, `recurring-${side}-${kind}`);
		const collapsed = bool(p, 'collapsed', false);
		const shell = cardShell(el, {
			label: `${side === 'both' ? '' : side === 'business' ? 'Business ' : 'Personal '}recurring`.replace(/^r/, 'R'),
			value: `${fmtMoney(total)}/mo`,
			detail: `${items.length} charge${items.length === 1 ? '' : 's'} on a steady cadence`,
			toggle: collapsed ? { key: k, ui: ctx.ui } : undefined,
		});
		if (items.length === 0) {
			note(shell.body, 'No recurring charges detected yet — needs a few repeats on a steady cadence.');
			return;
		}
		recurringRows(shell.body, items);
	},
};

export const upcomingCard: CardDef = {
	id: 'upcoming',
	title: 'Next 30 days',
	desc: 'Recurring charges and credits scheduled to hit, with the 30-day cash forecast.',
	params: [
		{ name: 'side', kind: { enum: ['personal', 'business', 'both'] }, default: 'both', desc: 'Ledger side' },
		{ name: 'forecast', kind: 'boolean', default: true, desc: 'Show the 30-day combined-cash forecast' },
	],
	render(el, ctx, p) {
		const side = str(p, 'side') ?? 'both';
		const { recurring: rec, metrics: m } = ctx.snapshot;
		const flows = rec.upcoming.filter((f) => side === 'both' || f.side === side);
		const net = flows.reduce((s, f) => s + f.amount, 0);
		const showForecast = bool(p, 'forecast', true);
		const shell = cardShell(el, {
			label: 'Next 30 days',
			value: showForecast ? fmtMoney(m.forecast.combined30d) : fmtSigned(net),
			detail: showForecast
				? `combined cash from ${fmtMoney(m.forecast.combinedNow)} · ${fmtSigned(m.forecast.delta)} at trailing rates`
				: 'net of known recurring flows',
			toggle: { key: key(ctx, `upcoming-${side}`), ui: ctx.ui },
		});
		if (flows.length === 0) {
			note(shell.body, 'No recurring charges due in the next 30 days.');
			return;
		}
		for (const f of flows) {
			const row = shell.body.createDiv({ cls: 'fava-flow' });
			row.createSpan({ cls: `fava-flow__date${f.overdue ? ' is-red' : ''}`, text: f.overdue ? 'due' : fmtDay(f.date) });
			row.createSpan({ cls: 'fava-flow__payee', text: f.payee });
			if (f.side === 'business') row.createSpan({ cls: 'fava-flow__tag', text: 'biz' });
			row.createSpan({ cls: `fava-flow__amount${f.amount > 0 ? ' is-green' : ''}`, text: `${f.amount > 0 ? '+' : '−'}${fmtMoney(Math.abs(f.amount))}` });
		}
		kv(shell.body, 'Net known flows', fmtSigned(net), { strong: true });
	},
};

export const liabilitiesBandCard: CardDef = {
	id: 'liabilities-band',
	title: 'Outstanding liability',
	desc: 'Where the receivable holding sits inside its target band, plus hard liabilities.',
	params: [],
	render(el, ctx) {
		const { business: b, statuses } = ctx.snapshot.metrics;
		const { liabBandLow: lo, liabBandHigh: hi } = ctx.cfg.thresholds;
		const pos = Math.min(100, Math.max(0, ((b.outstandingLiability - lo) / (hi - lo)) * 100));
		const shell = cardShell(el, {
			label: 'Outstanding liability',
			value: fmtMoney(b.outstandingLiability),
			detail:
				b.liabBand === 'below' || b.liabBand === 'above'
					? `${b.liabBand} the ${fmtMoney(lo)}–${fmtMoney(hi)} band`
					: `${b.liabBand.replace('-', ' ')} of the ${fmtMoney(lo)}–${fmtMoney(hi)} band`,
			status: statuses.liabBand,
			href: ctx.links.enabled ? ctx.links.outstanding() : undefined,
		});
		const track = shell.body.createDiv({ cls: 'fava-band' });
		const marker = track.createDiv({ cls: 'fava-band__marker' });
		marker.setCssProps({ '--fava-pos': `${pos}%` });
		const labels = shell.body.createDiv({ cls: 'fava-band__labels' });
		labels.createSpan({ text: fmtMoney(lo) });
		labels.createSpan({ text: fmtMoney(hi) });
		kv(shell.body, 'Hard liabilities (cards + taxes)', fmtMoney(b.hardLiabilities), { valueClass: statuses.hardCoverage && statuses.hardCoverage !== 'none' ? `is-${statuses.hardCoverage}` : '' });
		kv(shell.body, 'Cash covers them', `${b.hardCoverage.toFixed(1)}x`, { muted: true });
	},
};

export const compositionCard: CardDef = {
	id: 'composition',
	title: 'Net worth composition',
	desc: 'Signed slices: liquid, invested, business, receivable, liabilities.',
	params: [],
	render(el, ctx) {
		const { netWorth: nw } = ctx.snapshot.metrics;
		const shell = cardShell(el, { label: 'Composition', value: fmtMoney(nw.current) });
		const max = Math.max(...nw.composition.map((s) => Math.abs(s.value)), 1);
		for (const s of nw.composition) {
			barRow(shell.body, {
				label: s.label,
				pct: Math.max(2, (Math.abs(s.value) / max) * 100),
				value: fmtMoney(s.value),
				tone: s.value < 0 ? 'red' : 'normal',
			});
		}
	},
};

function burnCategories(ctx: CardContext, lifestyle: boolean) {
	const cats = ctx.snapshot.metrics.personal.burnCats.filter((c) => Math.abs(c.monthly) >= 1);
	return lifestyle ? cats.filter((c) => c.category !== 'Government') : cats;
}

export function categoryBarsInto(parent: HTMLElement, items: { category: string; monthly: number }[], perDay: boolean): void {
	const max = Math.max(...items.map((i) => Math.abs(i.monthly)), 1);
	for (const c of items) {
		barRow(parent, {
			label: c.category,
			pct: Math.max(2, (Math.abs(c.monthly) / max) * 100),
			value: fmtMoney(c.monthly),
			extra: perDay ? `${fmtMoney(c.monthly / DAYS_PER_MONTH)}/d` : undefined,
		});
	}
}

export const categoryBarsCard: CardDef = {
	id: 'category-bars',
	title: 'Spend by category',
	desc: 'Trailing-average monthly spend per category as magnitude bars.',
	params: [
		{ name: 'lifestyle', kind: 'boolean', default: false, desc: 'Exclude tax payments' },
		{ name: 'perDay', kind: 'boolean', default: true, desc: 'Show a per-day column' },
		{ name: 'limit', kind: 'number', desc: 'Show at most N categories' },
	],
	render(el, ctx, p) {
		const lifestyle = bool(p, 'lifestyle', false);
		let items = burnCategories(ctx, lifestyle);
		const limit = num(p, 'limit', 0);
		if (limit > 0) items = items.slice(0, limit);
		const pm = ctx.snapshot.metrics.personal;
		const shell = cardShell(el, {
			label: lifestyle ? 'Lifestyle spend by category' : 'Spend by category',
			value: `${fmtMoney(lifestyle ? pm.monthlyLifestyleTrailing : pm.monthlySpendTrailing)}/mo`,
			detail: `${ctx.snapshot.metrics.trailing} month average`,
		});
		categoryBarsInto(shell.body, items, bool(p, 'perDay', true));
	},
};

function paceRow(parent: HTMLElement, o: { label: string; actual: number; typical: number; pace: number; lowerIsBetter?: boolean }): void {
	const good = o.lowerIsBetter ? o.pace <= 105 : o.pace >= 85;
	const row = parent.createDiv({ cls: 'fava-pace' });
	const top = row.createDiv({ cls: 'fava-pace__top' });
	top.createSpan({ text: o.label });
	top.createSpan({ cls: 'fava-pace__nums', text: `${fmtMoney(o.actual)} of ~${fmtMoney(o.typical)}` });
	bar(row, o.pace, good ? 'normal' : 'red');
	row.createDiv({ cls: 'fava-pace__pct', text: `${o.pace.toFixed(0)}% of pace` });
}

export const categoryPaceCard: CardDef = {
	id: 'category-pace',
	title: 'Category pace',
	desc: 'Month-to-date spend per category vs the trailing average, prorated to today.',
	params: [{ name: 'limit', kind: 'number', default: 8, desc: 'Categories to show' }],
	render(el, ctx, p) {
		const m = ctx.snapshot.metrics;
		const rows = m.personal.categoryPace.slice(0, num(p, 'limit', 8));
		const shell = cardShell(el, {
			label: 'Category pace',
			detail: `day ${m.month.dayOfMonth} of ${m.month.daysInMonth} (${Math.round(m.month.pctThrough * 100)}%) · vs ${m.trailing} mo average, taxes excluded`,
		});
		if (rows.length === 0) {
			note(shell.body, 'No categories above the $50/mo floor yet.');
			return;
		}
		for (const c of rows) paceRow(shell.body, { label: c.category, actual: c.mtd, typical: c.typicalMo * m.month.pctThrough, pace: c.pace, lowerIsBetter: true });
	},
};

export const qtdCard: CardDef = {
	id: 'qtd',
	title: 'Quarter to date',
	desc: 'Spend and income (or revenue and opex) so far this quarter vs typical pace.',
	params: [{ name: 'side', kind: { enum: ['personal', 'business', 'both'] }, default: 'both', desc: 'Ledger side' }],
	render(el, ctx, p) {
		const m = ctx.snapshot.metrics;
		const q = m.qtd;
		const side = (str(p, 'side') ?? 'both') as Side | 'both';
		const shell = cardShell(el, {
			label: `Q${q.qNum} to date`,
			detail: `day ${q.dayOfQuarter} of ${q.daysInQuarter} (${Math.round(q.pctThrough * 100)}%)`,
			toggle: { key: key(ctx, `qtd-${side}`), ui: ctx.ui },
		});
		const body = shell.body;
		if (side !== 'business') {
			if (side === 'both') body.createDiv({ cls: 'fava-subhead', text: 'Personal' });
			paceRow(body, { label: 'Spent so far', actual: q.pExpQtd, typical: q.pExpTypical, pace: q.pExpPace, lowerIsBetter: true });
			paceRow(body, { label: 'Income so far', actual: q.pIncQtd, typical: q.pIncTypical, pace: q.pIncPace });
			kv(body, 'Projected quarter surplus', fmtSigned(q.pProjectedSurplus), { strong: true });
		}
		if (side !== 'personal') {
			if (side === 'both') body.createDiv({ cls: 'fava-subhead', text: 'Business' });
			paceRow(body, { label: 'Revenue so far', actual: q.bRevQtd, typical: q.bRevTypical, pace: q.bRevPace });
			paceRow(body, { label: 'Opex so far', actual: q.bExpQtd, typical: q.bExpTypical, pace: q.bExpPace, lowerIsBetter: true });
			kv(body, 'Projected quarter net', fmtSigned(q.bProjectedNet), { strong: true });
			const y = m.yoy;
			const sp = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(0)}%`;
			body.createDiv({ cls: 'fava-subhead', text: `vs Q${q.qNum} ${y.lastYear}` });
			kv(body, 'Revenue', sp(y.bRevenue), { muted: true });
			kv(body, 'Opex', sp(y.bOpex), { muted: true });
			if (side === 'both') {
				kv(body, 'Personal spend', sp(y.pSpend), { muted: true });
				kv(body, 'Personal income', sp(y.pIncome), { muted: true });
			}
		}
	},
};

export const survivalOpexCard: CardDef = {
	id: 'survival-opex',
	title: 'Survival opex',
	desc: 'Per-account business opex: full vs survival mode, with trend.',
	params: [],
	render(el, ctx) {
		const { business: b } = ctx.snapshot.metrics;
		const shell = cardShell(el, {
			label: 'Survival opex',
			value: `${fmtMoney(b.monthlySurvivalOpex)}/mo`,
			detail: `full ${fmtMoney(b.monthlyOpex)}/mo`,
			toggle: { key: key(ctx, 'survival-opex'), ui: ctx.ui },
		});
		const table = shell.body.createEl('table', { cls: 'fava-table' });
		const thead = table.createEl('thead').createEl('tr');
		for (const h of ['Account', 'Full', 'Survival', 'Trend']) thead.createEl('th', { text: h });
		const tbody = table.createEl('tbody');
		for (const row of b.survivalAccounts) {
			const tr = tbody.createEl('tr');
			const acct = tr.createEl('td');
			acct.createSpan({ text: row.sub });
			if (row.scaleNote) acct.createSpan({ cls: 'is-muted', text: ` (${row.scaleNote})` });
			tr.createEl('td', { text: fmtMoney(row.fullMo) });
			tr.createEl('td', { text: row.survivalMo === 0 && row.fullMo > 0 ? '—' : fmtMoney(row.survivalMo) });
			const g = trendGlyph(row.trendPct);
			tr.createEl('td', { text: g.text, cls: g.cls });
		}
	},
};

export const LIST_CARDS: CardDef[] = [
	envelopeCard,
	envelopesCard,
	recurringCard,
	upcomingCard,
	liabilitiesBandCard,
	compositionCard,
	categoryBarsCard,
	categoryPaceCard,
	qtdCard,
	survivalOpexCard,
];
