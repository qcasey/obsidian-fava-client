// Domain configuration: account names, thresholds and model rules.
// Ported from quinns-beans-web/lib/config.ts (itself a port of healthcheck.py).
// Defaults ship here; the settings tab lets a JSON blob override any part.

export interface DomainConfig {
	accounts: {
		personalExpense: string;
		businessExpense: string;
		personalIncome: string;
		businessIncome: string;
		businessLiability: string;
		emergencyFund: string;
		/** Prefix: all sub-accounts count as business checking */
		bizChecking: string;
		bizStripe: string;
		outstandingLiab: string;
		/** Personal tax payments (excluded from "lifestyle" burn) */
		personalTaxPrefix: string;
		liquidPrefixes: string[];
		liquidExclude: string[];
	};
	/** Green above / yellow above, unless noted */
	thresholds: {
		runwayGreen: number;
		runwayYellow: number;
		efundGreen: number;
		efundYellow: number;
		surplusGreen: number;
		surplusYellow: number;
		bizDaysGreen: number;
		bizDaysYellow: number;
		breakevenGreen: number;
		breakevenYellow: number;
		liabBandLow: number;
		liabBandHigh: number;
		hardCovGreen: number;
		hardCovYellow: number;
		combinedRunwayGreen: number;
		combinedRunwayYellow: number;
	};
	/** Fixed rent credit posting that offsets HomeOffice */
	rent: {
		payee: string;
		narration: string;
		expensePrefix: string;
		staleDays: number;
	};
	/** Monthly business reimbursement credits to Expenses:Personal:* */
	reimbursementPayee: string;
	survival: {
		nonOpex: string[];
		cut: string[];
		scale: { prefix: string; factor: number }[];
		liabExclude: string[];
	};
	/** Spend ring groups: 3rd account segment → group label. Unmapped → "Other". */
	spendGroups: { label: string; categories: string[] }[];
	/** Investment contributions shown in the spend ring */
	contribAccounts: { label: string; prefix: string }[];
	savingsEnvelopes: { account: string; label: string; target: number }[];
	/** Sender-domain → funding account (interpreter) */
	domainFunding: Record<string, string>;
	/** Issuer-name regex source → funding account (interpreter, first match wins) */
	nameFunding: { pattern: string; account: string }[];
	/** Column where "±X.XX USD" ends, per entry file */
	entryLineWidth: { personal: number; business: number };
	/** Basename templates for the hand-maintained entry files; {year} is substituted */
	entryFiles: { personal: string; business: string };
	/** Funding account used by the add-transaction card's cash button */
	quickCashAccount: string;
}

export const DEFAULT_DOMAIN_CONFIG: DomainConfig = {
	accounts: {
		personalExpense: 'Expenses:Personal:',
		businessExpense: 'Expenses:PhotoPanda:',
		personalIncome: 'Income:Personal:',
		businessIncome: 'Income:PhotoPanda:',
		businessLiability: 'Liabilities:PhotoPanda:',
		emergencyFund: 'Assets:Personal:Banks:CFG:EmergencyFund',
		bizChecking: 'Assets:PhotoPanda:BlueVine',
		bizStripe: 'Assets:PhotoPanda:Stripe',
		outstandingLiab: 'Assets:PhotoPanda:BlueVine:Receivable:Holding',
		personalTaxPrefix: 'Expenses:Personal:Government:',
		liquidPrefixes: [
			'Assets:Personal:Banks:',
			'Assets:Personal:Investments:Vanguard:CashPlus',
		],
		liquidExclude: [],
	},
	thresholds: {
		runwayGreen: 5,
		runwayYellow: 3,
		efundGreen: 15000,
		efundYellow: 10000,
		surplusGreen: 500,
		surplusYellow: 0,
		bizDaysGreen: 120,
		bizDaysYellow: 60,
		breakevenGreen: 1.2,
		breakevenYellow: 1.0,
		liabBandLow: 120000,
		liabBandHigh: 150000,
		hardCovGreen: 2.0,
		hardCovYellow: 1.5,
		combinedRunwayGreen: 12,
		combinedRunwayYellow: 6,
	},
	rent: {
		payee: 'Kailey',
		narration: 'Rent',
		expensePrefix: 'Expenses:Personal:HomeOffice',
		staleDays: 45,
	},
	reimbursementPayee: 'Quinn - Distributions',
	survival: {
		nonOpex: [
			'Expenses:PhotoPanda:Distributions',
			'Expenses:PhotoPanda:Payroll',
			'Expenses:PhotoPanda:Government:Taxes',
			'Expenses:PhotoPanda:Government:PTETax',
		],
		cut: [
			'Expenses:PhotoPanda:Advertising',
			'Expenses:PhotoPanda:Distributions',
			'Expenses:PhotoPanda:Payroll:Informal',
			'Expenses:PhotoPanda:Equipment',
			'Expenses:PhotoPanda:Travel',
			'Expenses:PhotoPanda:Services:TaxPrep',
			'Expenses:PhotoPanda:Gifts',
		],
		scale: [
			{ prefix: 'Expenses:PhotoPanda:Supplies', factor: 0.65 },
			{ prefix: 'Expenses:PhotoPanda:Shipping', factor: 0.8 },
		],
		liabExclude: ['Liabilities:PhotoPanda:LongTerm:EmployeePayments'],
	},
	spendGroups: [
		{ label: 'Housing', categories: ['HomeOffice', 'Home'] },
		{
			label: 'Essentials',
			categories: ['Groceries', 'Toiletries', 'Medical', 'Car', 'Fees', 'Insurance'],
		},
		{
			label: 'Lifestyle',
			categories: [
				'Clothing',
				'Hobbies',
				'Entertainment',
				'Travel',
				'Restaurants',
				'Cat',
				'Gifts',
			],
		},
		{ label: 'Taxes', categories: ['Government'] },
	],
	contribAccounts: [
		{ label: 'Roth IRA', prefix: 'Assets:Personal:Investments:Vanguard:RothIRA' },
	],
	savingsEnvelopes: [
		{
			account: 'Assets:Personal:Investments:Vanguard:CashPlus',
			label: 'Home Downpayment',
			target: 60000,
		},
		{
			account: 'Assets:Personal:Banks:CFG:EmergencyFund',
			label: 'Emergency Fund',
			target: 15000,
		},
		{ account: 'Assets:Personal:Banks:CFG:Travel', label: 'Travel Fund', target: 3000 },
	],
	domainFunding: {
		'chase.com': 'Liabilities:Personal:Chase:Amazon',
		'americanexpress.com': 'Liabilities:Personal:AmEx:Blue',
		'wellsfargo.com': 'Liabilities:Personal:WellsFargo',
		'citi.com': 'Liabilities:Personal:Citi:DoubleCash',
		'venmo.com': 'Assets:Personal:Banks:Venmo',
		'paypal.com': 'Assets:Personal:Banks:Paypal',
		'zellepay.com': 'Assets:Personal:Banks:SF:Checking',
	},
	nameFunding: [
		{ pattern: '\\bwells fargo\\b', account: 'Liabilities:Personal:WellsFargo' },
		{ pattern: '\\bamerican express\\b|\\bamex\\b', account: 'Liabilities:Personal:AmEx:Blue' },
		{ pattern: '\\bchase\\b', account: 'Liabilities:Personal:Chase:Amazon' },
		{ pattern: '\\bciti(?:bank)?\\b', account: 'Liabilities:Personal:Citi:DoubleCash' },
		{ pattern: '\\bcapital one\\b', account: 'Liabilities:Personal:CapitalOne' },
		{ pattern: '\\bdiscover\\b', account: 'Liabilities:Personal:Discover' },
		{ pattern: '\\bvenmo\\b', account: 'Assets:Personal:Banks:Venmo' },
		{ pattern: '\\bpaypal\\b', account: 'Assets:Personal:Banks:Paypal' },
		{ pattern: '\\bzelle\\b', account: 'Assets:Personal:Banks:SF:Checking' },
	],
	entryLineWidth: { personal: 76, business: 72 },
	entryFiles: { personal: '{year}.beancount', business: '{year}-photopanda.beancount' },
	quickCashAccount: 'Assets:Personal:Cash:Car',
};

// ── Override validation (hand-rolled; no schema library) ──

type LeafKind = 'string' | 'number' | 'string[]' | 'record';
interface Shape {
	[key: string]: LeafKind | Shape | [Shape];
}

const SHAPE: Shape = {
	accounts: {
		personalExpense: 'string',
		businessExpense: 'string',
		personalIncome: 'string',
		businessIncome: 'string',
		businessLiability: 'string',
		emergencyFund: 'string',
		bizChecking: 'string',
		bizStripe: 'string',
		outstandingLiab: 'string',
		personalTaxPrefix: 'string',
		liquidPrefixes: 'string[]',
		liquidExclude: 'string[]',
	},
	thresholds: Object.fromEntries(
		Object.keys(DEFAULT_DOMAIN_CONFIG.thresholds).map((k) => [k, 'number']),
	),
	rent: { payee: 'string', narration: 'string', expensePrefix: 'string', staleDays: 'number' },
	reimbursementPayee: 'string',
	survival: {
		nonOpex: 'string[]',
		cut: 'string[]',
		scale: [{ prefix: 'string', factor: 'number' }],
		liabExclude: 'string[]',
	},
	spendGroups: [{ label: 'string', categories: 'string[]' }],
	contribAccounts: [{ label: 'string', prefix: 'string' }],
	savingsEnvelopes: [{ account: 'string', label: 'string', target: 'number' }],
	domainFunding: 'record',
	nameFunding: [{ pattern: 'string', account: 'string' }],
	entryLineWidth: { personal: 'number', business: 'number' },
	entryFiles: { personal: 'string', business: 'string' },
	quickCashAccount: 'string',
};

type Json = Record<string, unknown>;

function isPlainObject(v: unknown): v is Json {
	return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function checkLeaf(kind: LeafKind, v: unknown, path: string): string | null {
	switch (kind) {
		case 'string':
			return typeof v === 'string' ? null : `${path} must be a string`;
		case 'number':
			return typeof v === 'number' && Number.isFinite(v) ? null : `${path} must be a number`;
		case 'string[]':
			return Array.isArray(v) && v.every((x) => typeof x === 'string')
				? null
				: `${path} must be an array of strings`;
		case 'record':
			return isPlainObject(v) && Object.values(v).every((x) => typeof x === 'string')
				? null
				: `${path} must be an object of string values`;
	}
}

function checkShape(shape: Shape, v: unknown, path: string): string | null {
	if (!isPlainObject(v)) return `${path || 'config'} must be an object`;
	for (const [key, val] of Object.entries(v)) {
		const spec = shape[key];
		const p = path ? `${path}.${key}` : key;
		if (spec === undefined) return `Unknown key ${p}`;
		let err: string | null;
		if (typeof spec === 'string') err = checkLeaf(spec, val, p);
		else if (Array.isArray(spec)) {
			if (!Array.isArray(val)) return `${p} must be an array`;
			const inner = spec[0];
			err = null;
			for (let i = 0; i < val.length && !err; i++) {
				const item: unknown = val[i];
				if (!isPlainObject(item)) return `${p}[${i}] must be an object`;
				for (const k of Object.keys(inner)) {
					if (!(k in item)) return `${p}[${i}] is missing ${k}`;
				}
				err = checkShape(inner, item, `${p}[${i}]`);
			}
		} else err = checkShape(spec, val, p);
		if (err) return err;
	}
	return null;
}

export type OverrideResult =
	| { ok: true; value: Json }
	| { ok: false; error: string };

/** Parse and validate the advanced-config JSON. Empty text is a valid no-op. */
export function parseDomainOverride(json: string): OverrideResult {
	if (!json.trim()) return { ok: true, value: {} };
	let parsed: unknown;
	try {
		parsed = JSON.parse(json);
	} catch (e) {
		return { ok: false, error: `Invalid JSON: ${e instanceof Error ? e.message : String(e)}` };
	}
	const err = checkShape(SHAPE, parsed, '');
	if (err) return { ok: false, error: err };
	return { ok: true, value: parsed as Json };
}

/** Deep-merge objects; arrays and records replace so entries can be removed. */
export function mergeDomainConfig(base: DomainConfig, override: Json): DomainConfig {
	const merge = (b: Json, o: Json, shape: Shape): Json => {
		const out: Json = { ...b };
		for (const [k, v] of Object.entries(o)) {
			const spec = shape[k];
			if (spec !== undefined && typeof spec === 'object' && !Array.isArray(spec)) {
				out[k] = merge((b[k] ?? {}) as Json, v as Json, spec);
			} else {
				out[k] = v;
			}
		}
		return out;
	};
	return merge(base as unknown as Json, override, SHAPE) as unknown as DomainConfig;
}

/** Resolve the effective config from settings text, ignoring invalid input. */
export function resolveDomainConfig(json: string): DomainConfig {
	const r = parseDomainOverride(json);
	return r.ok ? mergeDomainConfig(DEFAULT_DOMAIN_CONFIG, r.value) : DEFAULT_DOMAIN_CONFIG;
}
