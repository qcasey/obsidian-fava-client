// Shared domain types. Ported from quinns-beans-web/lib/types.ts.

export type Status = 'green' | 'yellow' | 'red' | 'none';
export type Side = 'personal' | 'business';

export interface Mover {
	category: string;
	changePerMo: number;
	pctChange: number;
	avgRecent: number;
}

export interface SurvivalAccountRow {
	sub: string;
	fullMo: number;
	survivalMo: number;
	changePerMo: number;
	trendPct: number;
	scaleNote: string | null;
}

export type Cadence =
	| 'weekly'
	| 'every 2 weeks'
	| 'monthly'
	| 'quarterly'
	| 'yearly';

export interface RecurringItem {
	payee: string;
	/** 3rd account segment, e.g. "Subscriptions" */
	category: string;
	/** Most frequent account in the group */
	account: string;
	side: Side;
	kind: 'expense' | 'income';
	cadence: Cadence;
	/** Observed median gap between charges, days */
	intervalDays: number;
	/** Signed (beancount convention): expense positive, credits negative */
	typicalAmount: number;
	monthlyEq: number;
	lastAmount: number;
	lastDate: string;
	nextDue: string;
	occurrences: number;
	amountVaries: boolean;
	/** Last charge vs typical, %; 0 when within ±5% */
	driftPct: number;
}

export interface UpcomingFlow {
	date: string;
	payee: string;
	/** Cash impact: negative = outflow */
	amount: number;
	side: Side;
	overdue: boolean;
}

export interface RecurringSummary {
	items: RecurringItem[];
	upcoming: UpcomingFlow[];
	/** Sum of upcoming cash impacts (negative = net outflow) */
	upcomingNet30: number;
	/** Net monthly-equivalent of recurring expense items, per side */
	personalMonthlyTotal: number;
	businessMonthlyTotal: number;
}

export interface CategoryPace {
	category: string;
	mtd: number;
	typicalMo: number;
	/** 100 = exactly on typical pace for this point in the month */
	pace: number;
}

export interface CompositionSlice {
	label: string;
	value: number;
}

export interface Envelope {
	label: string;
	account: string;
	balance: number;
	target: number;
	pct: number;
	delta3mo: number;
}

export interface OrganicFloor {
	/** Revenue that keeps arriving at $0 ad spend (regression intercept) */
	weekly: number;
	monthly: number;
	/** Organic share of average weekly revenue, 0–1 */
	share: number;
	/** Regression slope: revenue per ad dollar */
	revenuePerAdDollar: number;
	/** Organic monthly ÷ breakeven (survival opex) */
	breakevenCoverage: number;
	r2: number;
	nWeeks: number;
	usable: boolean;
}

export interface PersonalMetrics {
	liquid: number;
	monthlySpend: number;
	monthlyIncome: number;
	monthlyIncomeTrailing: number;
	monthlySurplus: number;
	savingsRate: number;
	runwayMonths: number;
	emergencyFund: number;
	spendTrendPct: number;
	spendMovers: Mover[];
	dailyBurn: number;
	monthlySpendTrailing: number;
	dailyBurnLifestyle: number;
	monthlyLifestyleTrailing: number;
	taxMoTrailing: number;
	burnCats: { category: string; monthly: number }[];
	grossLifestyleMo: number;
	survivalIncomeMo: number;
	monthlySurvivalSpend: number;
	monthlySeries: { month: string; spend: number; income: number }[];
	categoryPace: CategoryPace[];
	/** Net investment inflows at cost (e.g. Roth IRA), trailing average */
	contrib: { label: string; monthly: number }[];
}

export interface BusinessMetrics {
	bizCash: number;
	monthlyOpex: number;
	monthlyTotalExp: number;
	monthlySurvivalOpex: number;
	survivalAccounts: SurvivalAccountRow[];
	daysOfCash: number;
	outstandingLiability: number;
	liabBand: string;
	hardLiabilities: number;
	hardCoverage: number;
	monthlyRevenue: number;
	breakevenRevenue: number;
	breakevenRatio: number;
	opexTrendPct: number;
	opexMovers: Mover[];
	monthlyExcess: number;
	operatingNet: number;
	ownerOutflowsMo: number;
	organic: OrganicFloor;
	monthlySeries: { month: string; revenue: number; opex: number }[];
}

export interface QtdMetrics {
	qNum: number;
	dayOfQuarter: number;
	daysInQuarter: number;
	pctThrough: number;
	pExpQtd: number;
	pExpTypical: number;
	pExpPace: number;
	pIncQtd: number;
	pIncTypical: number;
	pIncPace: number;
	pProjectedSurplus: number;
	bExpQtd: number;
	bExpTypical: number;
	bExpPace: number;
	bRevQtd: number;
	bRevTypical: number;
	bRevPace: number;
	bProjectedNet: number;
}

export type FlowScope = 'all' | 'personal' | 'business';

export interface MonthlyFlow {
	month: string;
	income: number;
	expenses: number;
	net: number;
	/** The current calendar month, still filling up */
	partial: boolean;
}

export interface FlowWindow {
	/** Months requested */
	months: number;
	/** Complete months actually available */
	counted: number;
	income: number;
	expenses: number;
	net: number;
	prevIncome: number;
	prevExpenses: number;
	prevNet: number;
	/** Net change vs the preceding window, dollars per month */
	changeAbs: number;
	/** Change as % of the previous net; null when that base is too small to mean anything */
	changePct: number | null;
	/** Change as a share of income — the scale-free signal behind the status dot */
	marginPts: number;
	status: Status;
}

export interface FlowScopeData {
	series: MonthlyFlow[];
	/** Trailing summaries, shortest first */
	windows: FlowWindow[];
}

export type IncomeExpense = Record<FlowScope, FlowScopeData>;

export interface Metrics {
	generatedAt: string;
	trailing: number;
	stalenessDays: number;
	personal: PersonalMetrics;
	business: BusinessMetrics;
	runway: { phase1: number; phase2: number; total: number };
	netWorth: {
		current: number;
		delta3mo: number;
		delta6mo: number;
		series: { month: string; value: number }[];
		composition: CompositionSlice[];
	};
	month: { dayOfMonth: number; daysInMonth: number; pctThrough: number };
	qtd: QtdMetrics;
	yoy: {
		lastYear: number;
		pSpend: number;
		pIncome: number;
		bRevenue: number;
		bOpex: number;
	};
	forecast: { combinedNow: number; combined30d: number; delta: number };
	envelopes: Envelope[];
	/** Income vs expenses by month, whole ledger and per side */
	flows: IncomeExpense;
	statuses: Record<string, Status>;
	verdict: { reds: string[]; warnings: string[] };
}

/** One successful load of everything the UI needs. */
export interface Snapshot {
	metrics: Metrics;
	recurring: RecurringSummary;
	loadedAt: number;
	/** Built while queries were still arriving: some figures read zero */
	partial?: boolean;
}

// ── Quick entry ──

export interface EntryPosting {
	account: string;
	/** Positive user-entered amount as string, e.g. "24.98" */
	amount: string;
}

export interface EntryDraft {
	kind: Side;
	date: string;
	flag: '*' | '!';
	payee: string;
	narration: string;
	refund: boolean;
	/** Funding postings (amounts negated unless refund) */
	fundings: EntryPosting[];
	/** Amount-less final leg */
	category: string;
}

export type Confidence = 'high' | 'medium' | 'low';

export interface ParsedField<T> {
	value: T;
	confidence: Confidence;
}

export interface ParsedDraft {
	payee?: ParsedField<string>;
	narration?: ParsedField<string>;
	amount?: ParsedField<string>;
	date?: ParsedField<string>;
	refund?: ParsedField<boolean>;
	fundingAccount?: ParsedField<string>;
	categoryAccount?: ParsedField<string>;
}
