// BQL query catalog. Ported from quinns-beans-web/lib/fava.ts:146-211.
// Anything interpolated into a string literal goes through bqlString().

import { addDays, todayISO } from './dates';

export function bqlString(s: string): string {
	return s.replace(/[\\"]/g, "'");
}

const untilClause = (until?: string) =>
	until ? ` AND date < ${until}` : ` AND date <= ${todayISO()}`;

/** Keys read from an account's `open` directive to declare a savings envelope. */
export const ENVELOPE_META = {
	label: 'envelope',
	target: 'envelope_target',
	sort: 'envelope_sort',
} as const;

/**
 * Read one metadata key off an account's `open` directive. A missing key comes
 * back as "", which is what makes ENVELOPE_WHERE work.
 *
 * Never wrap this in BQL's str(): under beancount 2 (which older Fava servers
 * still run) str() is repr(), so a missing key becomes the two-character
 * string "''" — never equal to "", so every account in the ledger matches.
 * beancount 3 converts properly, which hides the bug locally.
 */
const META = (key: string) => `getitem(open_meta(account), "${key}")`;
const ENVELOPE_WHERE = `${META(ENVELOPE_META.label)} != ""`;

export interface RentRule {
	payee: string;
	narration: string;
	expensePrefix: string;
}

export const BQL = {
	balances: () => `SELECT account, sum(position) GROUP BY account`,

	accountSums: (prefix: string, since: string, until?: string) =>
		`SELECT account, sum(position) WHERE account ~ "^${prefix}" AND date >= ${since}${untilClause(until)} GROUP BY account`,

	/** Business expenses by account, dropping #irregular one-offs. */
	bizExpByAcct: (bizExpensePrefix: string, since: string, until?: string) =>
		`SELECT account, sum(position) WHERE account ~ "^${bizExpensePrefix}" AND NOT ("irregular" IN tags) AND date >= ${since}${untilClause(until)} GROUP BY account`,

	sumPrefix: (prefix: string, since: string, until?: string) =>
		`SELECT sum(position) WHERE account ~ "^${prefix}" AND date >= ${since}${untilClause(until)}`,

	rentCredits: (rent: RentRule, since: string) =>
		`SELECT sum(position) WHERE payee = "${bqlString(rent.payee)}" AND narration = "${bqlString(rent.narration)}" AND account ~ "^${rent.expensePrefix}" AND number < 0 AND date >= ${since} AND date <= ${todayISO()}`,

	rentLast: (rent: RentRule) =>
		`SELECT date, number WHERE payee = "${bqlString(rent.payee)}" AND narration = "${bqlString(rent.narration)}" AND account ~ "^${rent.expensePrefix}" AND number < 0 ORDER BY date DESC LIMIT 1`,

	reimbCredits: (payee: string, personalExpensePrefix: string, since: string) =>
		`SELECT sum(position) WHERE payee = "${bqlString(payee)}" AND account ~ "^${personalExpensePrefix}" AND number < 0 AND date >= ${since} AND date <= ${todayISO()}`,

	netWorthAt: (cutoff: string) =>
		`SELECT sum(position) WHERE account ~ "^(Assets|Liabilities):(Personal|PhotoPanda):" AND date < ${cutoff}`,

	netWorthMonthly: () =>
		`SELECT year, month, sum(position) WHERE account ~ "^(Assets|Liabilities):(Personal|PhotoPanda):" GROUP BY year, month ORDER BY year, month`,

	monthlySums: (prefix: string, since: string) =>
		`SELECT year, month, sum(position) WHERE account ~ "^${prefix}" AND date >= ${since} AND date <= ${todayISO()} GROUP BY year, month ORDER BY year, month`,

	bizMonthlyOpex: (bizExpensePrefix: string, since: string) =>
		`SELECT year, month, account, sum(position) WHERE account ~ "^${bizExpensePrefix}" AND NOT ("irregular" IN tags) AND date >= ${since} AND date <= ${todayISO()} GROUP BY year, month, account ORDER BY year, month`,

	/** Daily revenue and ad-spend flows for the organic-floor regression. */
	adsRevenueByDate: (bizIncomePrefix: string, bizExpensePrefix: string, since: string) =>
		`SELECT date, account, sum(position) WHERE account ~ "^(${bizIncomePrefix}|${bizExpensePrefix}Advertising)" AND date >= ${since} AND date <= ${todayISO()} GROUP BY date, account ORDER BY date`,

	balancesAt: (cutoff: string, accountsRegex: string) =>
		`SELECT account, sum(position) WHERE date < ${cutoff} AND account ~ "${accountsRegex}" GROUP BY account`,

	/**
	 * Savings envelopes declared in the ledger: metadata on the account's `open`
	 * directive. Columns are account, label, target, sort, then the balance.
	 *
	 * A missing key cannot be tested with `!= NULL` — getitem() is typed
	 * `object` under beancount 3 and that is a compile error — so compare
	 * against "" instead. See META above before touching this.
	 */
	envelopeDefs: () =>
		`SELECT account, ${META(ENVELOPE_META.label)} as label, ${META(ENVELOPE_META.target)} as target, ${META(ENVELOPE_META.sort)} as sort, sum(position) WHERE ${ENVELOPE_WHERE} GROUP BY account, label, target, sort`,

	/**
	 * Envelope balances as of `cutoff`, for the 3-month delta. Covers both
	 * sources in one query: accounts annotated in the ledger, plus any listed
	 * in `savingsEnvelopes` so the config fallback keeps working.
	 */
	envelopeBalancesAt: (cutoff: string, accounts: string[]) => {
		const clauses = [ENVELOPE_WHERE];
		if (accounts.length) clauses.unshift(`account ~ "^(${accounts.join('|')})$"`);
		return `SELECT account, sum(position) WHERE date < ${cutoff} AND (${clauses.join(' OR ')}) GROUP BY account`;
	},

	lastEntry: () => `SELECT date WHERE date <= ${todayISO()} ORDER BY date DESC LIMIT 1`,

	payeeFunding: (payee: string) =>
		`SELECT account, count(account) as c WHERE payee = "${bqlString(payee)}" AND account ~ "^(Assets|Liabilities):" GROUP BY account ORDER BY c DESC LIMIT 3`,

	duplicateCheck: (account: string, amount: string, date: string) =>
		`SELECT date, payee, narration WHERE account = "${bqlString(account)}" AND number = ${amount} AND date >= ${addDays(date, -3)} AND date <= ${addDays(date, 3)}`,

	/** Net inflow at cost basis — cost() folds fund shares back to the USD paid. */
	contribByAcct: (prefixes: string[], since: string) =>
		`SELECT account, sum(cost(position)) WHERE account ~ "^(${prefixes.join('|')})" AND date >= ${since} AND date <= ${todayISO()} GROUP BY account`,

	/** Income and expense totals per month and account, for the flows card. */
	flowsByMonth: (incomeRoot: string, expenseRoot: string, since: string) =>
		`SELECT year, month, account, sum(position) WHERE account ~ "^(${incomeRoot}|${expenseRoot}):" AND date >= ${since} AND date <= ${todayISO()} GROUP BY year, month, account ORDER BY year, month`,

	/** Posting-level feed for recurring detection. USD-only keeps the math clean. */
	postings: (since: string) =>
		`SELECT date, payee, account, number WHERE account ~ "^(Expenses|Income):(Personal|PhotoPanda):" AND payee != "" AND currency = "USD" AND date >= ${since} AND date <= ${todayISO()} ORDER BY date`,
};
