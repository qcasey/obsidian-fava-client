// What the dashboard shows, section by section. Cards come from the registry
// so an embedded card in a note always matches its dashboard twin.

import type { Params } from '../cards/types';
import { fmtMoney } from '../lib/fmt';
import type { Snapshot } from '../types';

export interface SectionDef {
	id: string;
	title: string;
	cards: { id: string; params?: Params }[];
	/** One-line summary shown in the header while collapsed */
	summary?: (s: Snapshot) => string;
}

export const SECTIONS: SectionDef[] = [
	{
		id: 'health',
		title: 'Health',
		cards: [
			{ id: 'verdict' },
			{ id: 'net-worth' },
			{ id: 'runway' },
			{ id: 'burn', params: { mode: 'both' } },
			{ id: 'business-cash' },
			{ id: 'envelopes' },
			{ id: 'hours-to-buy' },
		],
		summary: (s) => `${fmtMoney(s.metrics.netWorth.current)} · ${s.metrics.runway.total.toFixed(1)} mo runway`,
	},
	{
		id: 'personal',
		title: 'Personal',
		cards: [
			{ id: 'surplus' },
			{ id: 'trend', params: { side: 'personal' } },
			{ id: 'spend-ring' },
			{ id: 'monthly-bars', params: { side: 'personal' } },
			{ id: 'qtd', params: { side: 'personal' } },
			{ id: 'category-pace' },
			{ id: 'envelopes' },
			{ id: 'recurring', params: { side: 'personal' } },
		],
		summary: (s) =>
			`$${s.metrics.personal.dailyBurn.toFixed(0)}/day · saving ${s.metrics.personal.savingsRate.toFixed(0)}% · ${fmtMoney(s.recurring.personalMonthlyTotal)}/mo fixed`,
	},
	{
		id: 'business',
		title: 'Business',
		cards: [
			{ id: 'business-net' },
			{ id: 'breakeven' },
			{ id: 'trend', params: { side: 'business' } },
			{ id: 'liabilities-band' },
			{ id: 'monthly-bars', params: { side: 'business' } },
			{ id: 'qtd', params: { side: 'business' } },
			{ id: 'recurring', params: { side: 'business', collapsed: true } },
		],
		summary: (s) => `${fmtMoney(s.metrics.business.bizCash)} cash · ${s.metrics.business.breakevenRatio.toFixed(1)}x breakeven`,
	},
	{
		id: 'runway',
		title: 'Net worth & runway',
		cards: [{ id: 'composition' }, { id: 'upcoming' }, { id: 'survival-opex' }],
		summary: (s) => `${fmtMoney(s.metrics.forecast.combined30d)} combined cash in 30 days`,
	},
];
