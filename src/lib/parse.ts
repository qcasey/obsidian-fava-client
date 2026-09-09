// Heuristic text → entry-draft parser (no AI). Ported rules from the
// email-import pipeline: prefer contextual amount phrases, normalize bank-code
// payee prefixes, map sender domains / issuer names to funding accounts.

import type { DomainConfig } from './config';
import { todayISO } from './dates';
import type { Confidence, ParsedDraft, ParsedField } from '../types';

export type ParseConfig = Pick<DomainConfig, 'domainFunding' | 'nameFunding'>;

function field<T>(value: T, confidence: Confidence): ParsedField<T> {
	return { value, confidence };
}

const MONTH_NAMES: Record<string, number> = {
	jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
	jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

// "more than $1.00", "over $50", "up to $..." — alert-threshold settings,
// never the transaction amount.
const THRESHOLD_WORDS =
	/\b(?:more than|over|above|at least|exceed\w*|greater than|up to|limit(?: of)?|minimum|maximum)\b/i;

function isThresholdContext(text: string, dollarIndex: number): boolean {
	return THRESHOLD_WORDS.test(text.slice(Math.max(0, dollarIndex - 24), dollarIndex));
}

function stripCommas(s: string | undefined): string {
	return (s ?? '').replace(/,/g, '');
}

function parseAmount(text: string): ParsedField<string> | undefined {
	// 1. An amount standing alone on its own line (receipt/alert style,
	//    possibly with a pre-auth asterisk: "$24.98*") is the strongest signal.
	const standalone = text.match(/^\s*\$\s?([\d,]+\.\d{2})\s*\*?\s*$/m);
	if (standalone) return field(stripCommas(standalone[1]), 'high');

	// 2. Amount attached to a transactional phrase — unless the phrase is a
	//    notification threshold ("purchase was more than $1.00").
	for (const m of text.matchAll(
		/(?:purchase|charge|payment|transaction|sent|paid|refund|credit(?:ed)?|total|amount(?:\s+due)?)\D{0,16}\$\s?([\d,]+\.\d{2})/gi,
	)) {
		if (!THRESHOLD_WORDS.test(m[0])) {
			return field(stripCommas(m[1]), 'high');
		}
	}

	// 3. Any remaining amounts, skipping threshold contexts.
	const all = [...text.matchAll(/\$\s?([\d,]+\.\d{2})/g)]
		.filter((m) => !isThresholdContext(text, m.index ?? 0))
		.map((m) => stripCommas(m[1]));
	const first = all[0];
	if (first === undefined) return undefined;
	const unique = new Set(all);
	return field(first, unique.size === 1 ? 'medium' : 'low');
}

function parseDate(text: string): ParsedField<string> {
	// Explicitly labeled date line gets scoped parsing at high confidence
	const labeled = text.match(/^\s*(?:date|transaction date|posted(?: on)?)\s*:\s*(.+)$/im);
	if (labeled) {
		const inner = parseDate((labeled[1] ?? '').trim().slice(0, 40));
		if (inner.confidence !== 'low') return field(inner.value, 'high');
	}
	const iso = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
	if (iso) return field(iso[0], 'high');
	const us = text.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/);
	if (us) {
		const mo = us[1] ?? '';
		const d = us[2] ?? '';
		const yRaw = us[3] ?? '';
		const y = yRaw.length === 2 ? `20${yRaw}` : yRaw;
		return field(`${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`, 'medium');
	}
	const long = text.match(
		/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2})(?:,?\s+(20\d{2}))?/i,
	);
	if (long) {
		const mo = MONTH_NAMES[(long[1] ?? '').slice(0, 3).toLowerCase()] ?? 1;
		const y = long[3] ?? String(new Date().getFullYear());
		return field(`${y}-${String(mo).padStart(2, '0')}-${(long[2] ?? '').padStart(2, '0')}`, 'medium');
	}
	return field(todayISO(), 'low');
}

export function normalizePayee(raw: string): string {
	let s = raw.trim();
	s = s.replace(/^(SQ|TST|TS|PP|PY|PAYPAL|AMZN|WL)\s*\*\s*/i, '');
	// Store numbers and trailing location: "RALPHS #0686 in TEMECULA, CA, USA"
	s = s.replace(/#\s?\d{2,}/g, ' ');
	s = s.replace(/\s+in\s+[A-Z][A-Za-z .]*,.*$/, '');
	s = s.replace(/[,.]\s*$/, '');
	s = s.replace(/\s{2,}/g, ' ');
	if (s === s.toUpperCase() && /[A-Z]/.test(s)) {
		s = s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
	}
	return s.trim();
}

// Card issuers / platforms whose names appear in alert emails as the SENDER,
// not the merchant — never pick these as the payee from a bare mention.
const BANK_NAMES = [
	'wells fargo', 'chase', 'citi', 'american express', 'amex', 'capital one',
	'discover', 'bank of america', 'venmo', 'paypal', 'zelle', 'bluevine',
];

function matchAgainstPayees(candidate: string, payees: string[]): ParsedField<string> {
	const norm = normalizePayee(candidate);
	const normLower = norm.toLowerCase();
	const exact = payees.find((p) => p.toLowerCase() === normLower);
	if (exact) return field(exact, 'high');
	const sub = payees.find(
		(p) => p.toLowerCase().startsWith(normLower) || normLower.startsWith(p.toLowerCase()),
	);
	if (sub) return field(sub, 'medium');
	// Token overlap ≥ 0.5
	const tokens = normLower.split(/\s+/).filter((t) => t.length > 2);
	if (tokens.length) {
		let best: { p: string; score: number } | null = null;
		for (const p of payees) {
			const pt = p.toLowerCase().split(/\s+/);
			const overlap = tokens.filter((t) => pt.includes(t)).length / tokens.length;
			if (overlap >= 0.5 && (!best || overlap > best.score)) {
				best = { p, score: overlap };
			}
		}
		if (best) return field(best.p, 'low');
	}
	return field(norm, 'low');
}

function matchPayee(text: string, payees: string[]): ParsedField<string> | undefined {
	// 0. Explicitly labeled merchant line: "Merchant: RALPHS #0686 in TEMECULA..."
	const labeled = text.match(/^\s*(?:merchant|payee|vendor|store|seller)\s*:\s*(.+)$/im);
	if (labeled) return matchAgainstPayees(labeled[1] ?? '', payees);

	// 1. Contextual merchant: "purchase ... at MERCHANT", "sent to MERCHANT"
	const at = text.match(
		/\b(?:at|to)\s+([A-Z][A-Za-z0-9*&.' -]{2,40}?)(?=\s+(?:on|for|was|of)\b|[.,\n]|$)/m,
	);
	if (at) return matchAgainstPayees(at[1] ?? '', payees);

	// 2. Known payee appearing anywhere — longest match wins; skip card
	//    issuers/platforms, which show up as the email SENDER.
	const lower = text.toLowerCase();
	const hits = payees
		.filter(
			(p) =>
				p.length >= 3 && lower.includes(p.toLowerCase()) && !BANK_NAMES.includes(p.toLowerCase()),
		)
		.sort((a, b) => b.length - a.length);
	const top = hits[0];
	if (top !== undefined) return field(top, 'high');

	// 3. An ALL-CAPS merchant-looking run
	const caps = text.match(/\b([A-Z][A-Z0-9*&.'-]{2,}(?: [A-Z0-9*&.'-]{2,}){0,4})\b/);
	if (caps) return matchAgainstPayees(caps[1] ?? '', payees);
	return undefined;
}

function compilePattern(source: string): RegExp | null {
	try {
		return new RegExp(source, 'i');
	} catch {
		return null;
	}
}

// Sender domain first, then issuer/platform NAMES for emails that never
// mention the domain ("Thank you for choosing Wells Fargo."). Name patterns
// are word-boundary matched so "purchase" never hits "chase". First match wins.
function matchFunding(raw: string, cfg: ParseConfig): ParsedField<string> | undefined {
	const lower = raw.toLowerCase();
	for (const [domain, account] of Object.entries(cfg.domainFunding)) {
		if (lower.includes(domain)) return field(account, 'high');
	}
	for (const { pattern, account } of cfg.nameFunding) {
		const re = compilePattern(pattern);
		if (re && re.test(raw)) return field(account, 'high');
	}
	return undefined;
}

export function parseText(raw: string, payees: string[], cfg: ParseConfig): ParsedDraft {
	const draft: ParsedDraft = {};
	const amount = parseAmount(raw);
	if (amount) draft.amount = amount;
	draft.date = parseDate(raw);
	const refund = /\brefund(?:ed)?|credited|return(?:ed)?|reversal\b/i.test(raw);
	if (refund) draft.refund = field(true, 'medium');
	const payee = matchPayee(raw, payees);
	if (payee) draft.payee = payee;
	const funding = matchFunding(raw, cfg);
	if (funding) draft.fundingAccount = funding;
	return draft;
}
