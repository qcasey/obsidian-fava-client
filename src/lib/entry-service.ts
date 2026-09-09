// Quick-entry service: autocomplete partitions, payee prefill, duplicate check,
// validation and the GET → append → PUT write. Port of the web app's
// /api/{autocomplete,payee,duplicate-check,entry} routes.

import type { DataStore } from '../data/store';
import { BQL } from './bql';
import type { DomainConfig } from './config';
import { cell } from './csv';
import type { FavaClient, LedgerMeta } from './fava-client';
import { formatEntry, normalizeAmount } from './format-entry';
import type { EntryDraft, Side } from '../types';

export interface Autocomplete {
	payees: string[];
	expensePersonal: string[];
	expenseBusiness: string[];
	fundingPersonal: string[];
	fundingBusiness: string[];
}

export interface DupMatch {
	date: string;
	payee: string;
	narration: string;
}

export interface PayeePrefill {
	categoryAccount: string | null;
	fundingAccount: string | null;
}

/** ":Personal:" / ":PhotoPanda:" from the configured expense prefix's 2nd segment. */
function sideToken(kind: Side, cfg: DomainConfig): string {
	const prefix = kind === 'business' ? cfg.accounts.businessExpense : cfg.accounts.personalExpense;
	const seg = prefix.split(':')[1] ?? (kind === 'business' ? 'PhotoPanda' : 'Personal');
	return `:${seg}:`;
}

const isCategory = (a: string) => a.startsWith('Expenses:') || a.startsWith('Income:');
const isFunding = (a: string) => a.startsWith('Assets:') || a.startsWith('Liabilities:');

export function buildAutocomplete(meta: LedgerMeta, cfg: DomainConfig): Autocomplete {
	const a = cfg.accounts;
	const pSide = sideToken('personal', cfg);
	const bSide = sideToken('business', cfg);
	const pick = (pred: (acct: string) => boolean) => meta.accounts.filter(pred);
	return {
		payees: meta.payees,
		expensePersonal: pick(
			(x) => x.startsWith(a.personalExpense) || x.startsWith(a.personalIncome),
		),
		expenseBusiness: pick(
			(x) => x.startsWith(a.businessExpense) || x.startsWith(a.businessIncome),
		),
		fundingPersonal: pick((x) => isFunding(x) && x.includes(pSide)),
		fundingBusiness: pick((x) => isFunding(x) && x.includes(bSide)),
	};
}

/** Best category + funding account for a payee on the given side. */
export async function payeePrefill(
	client: FavaClient,
	payee: string,
	kind: Side,
	cfg: DomainConfig,
): Promise<PayeePrefill> {
	const side = sideToken(kind, cfg);
	const [ranked, funding] = await Promise.all([
		client.getPayeeAccounts(payee),
		client.runQuery(BQL.payeeFunding(payee)),
	]);
	const categoryAccount = ranked.find((x) => isCategory(x) && x.includes(side)) ?? null;
	const fundingAccount =
		funding.map((r) => cell(r, 0)).find((x) => x.includes(side)) ??
		ranked.find((x) => isFunding(x) && x.includes(side)) ??
		null;
	return { categoryAccount, fundingAccount };
}

/** Same account, same |amount|, within ±3 days. Errors → no matches. */
export async function duplicateCheck(
	client: FavaClient,
	account: string,
	amount: string,
	date: string,
): Promise<DupMatch[]> {
	if (!account || !amount || !date) return [];
	try {
		// Funding postings are negative for normal spends; check both signs so
		// refunds match too.
		const amt = normalizeAmount(amount);
		const [neg, pos] = await Promise.all([
			client.runQuery(BQL.duplicateCheck(account, `-${amt}`, date)),
			client.runQuery(BQL.duplicateCheck(account, amt, date)),
		]);
		return [...neg, ...pos].map((r) => ({
			date: cell(r, 0),
			payee: cell(r, 1),
			narration: cell(r, 2),
		}));
	} catch {
		return [];
	}
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Returns an error message, or null when the draft is submittable. */
export function validateDraft(draft: EntryDraft, accounts: string[]): string | null {
	if (draft.kind !== 'personal' && draft.kind !== 'business') return 'Pick personal or business';
	if (!ISO_DATE.test(draft.date) || Number.isNaN(new Date(draft.date).getTime())) {
		return 'Invalid date';
	}
	if (draft.flag !== '*' && draft.flag !== '!') return 'Invalid flag';
	const payee = draft.payee.trim();
	if (!payee) return 'Payee is required';
	if (payee.length > 200) return 'Payee is too long';
	if (draft.narration.length > 300) return 'Narration is too long';
	if (draft.fundings.length < 1) return 'Add a funding account and amount';
	if (draft.fundings.length > 5) return 'Too many funding legs';
	for (const f of draft.fundings) {
		if (!f.account.trim()) return 'Funding account is required';
		let n: number;
		try {
			n = parseFloat(normalizeAmount(f.amount));
		} catch {
			return `Invalid amount: ${f.amount}`;
		}
		if (n < 0.01 || n > 50000) return `Amount out of range: ${f.amount}`;
	}
	if (!draft.category.trim()) return 'Category is required';
	// Accounts must exist. Cross-side accounts are deliberately allowed — the
	// toggle only decides which file the entry lands in.
	for (const acct of [...draft.fundings.map((f) => f.account), draft.category]) {
		if (!accounts.includes(acct)) return `Unknown account: ${acct}`;
	}
	return null;
}

/** Resolve the hand-maintained entry file for the current year from the include list. */
export function resolveEntryFile(kind: Side, include: string[], cfg: DomainConfig): string {
	const year = String(new Date().getFullYear());
	const wanted = cfg.entryFiles[kind].replace(/\{year\}/g, year);
	const match = include.find((p) => p.split('/').pop() === wanted);
	if (!match) throw new Error(`Could not find ${wanted} in the ledger's include list`);
	if (match.includes('automated')) throw new Error(`Refusing to write to automated file: ${match}`);
	return match;
}

/** Append the entry to its file: GET → append → PUT, one retry on conflict. */
export async function submitEntry(
	client: FavaClient,
	store: DataStore,
	cfg: DomainConfig,
	draft: EntryDraft,
): Promise<{ file: string; entryText: string }> {
	const meta = await store.getLedgerMeta();
	const err = validateDraft(draft, meta.accounts);
	if (err) throw new Error(err);
	const entryText = formatEntry(draft, cfg.entryLineWidth[draft.kind]);
	const file = resolveEntryFile(draft.kind, meta.include, cfg);

	let attempt = 0;
	for (;;) {
		attempt++;
		const src = await client.getSource(file);
		const newSource = `${src.source.replace(/\n*$/, '\n')}\n${entryText}\n`;
		try {
			await client.putSource(src.file_path || file, newSource, src.sha256sum);
			break;
		} catch (e) {
			if (attempt >= 2) {
				throw new Error(`Write conflict: ${e instanceof Error ? e.message : String(e)}`);
			}
		}
	}

	store.invalidateLedger();
	void store.refresh().catch(() => undefined);
	return { file, entryText };
}
