// Text / screenshot → ParsedDraft. Port of the web app's /api/parse and
// /api/parse-image routes: heuristic first, optional AI fills the gaps, then
// category/funding suggestions from fava's payee ranking (matching side only).

import type { DomainConfig } from './config';
import { todayISO } from './dates';
import type { FavaClient } from './fava-client';
import { OllamaClient, validateAmountString } from './ollama';
import { normalizePayee, parseText } from './parse';
import type { ParsedDraft, Side } from '../types';

export interface InterpretDeps {
	client: FavaClient;
	ollama: OllamaClient;
	payees: string[];
	cfg: DomainConfig;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** ":Personal:" / ":PhotoPanda:" derived from the configured expense prefixes. */
export function sideToken(kind: Side, cfg: DomainConfig): string {
	const prefix = kind === 'business' ? cfg.accounts.businessExpense : cfg.accounts.personalExpense;
	const seg = prefix.split(':')[1] ?? (kind === 'business' ? 'PhotoPanda' : 'Personal');
	return `:${seg}:`;
}

const isCategory = (a: string) => a.startsWith('Expenses:') || a.startsWith('Income:');
const isFunding = (a: string) => a.startsWith('Assets:') || a.startsWith('Liabilities:');

async function suggestAccounts(
	draft: ParsedDraft,
	side: string,
	client: FavaClient,
	confidenceForCategory: 'medium' | 'low',
): Promise<void> {
	if (!draft.payee) return;
	const ranked = await client.getPayeeAccounts(draft.payee.value).catch(() => [] as string[]);
	if (!draft.categoryAccount) {
		const cat = ranked.find((a) => isCategory(a) && a.includes(side));
		if (cat) draft.categoryAccount = { value: cat, confidence: confidenceForCategory };
	}
	if (!draft.fundingAccount) {
		const funding = ranked.find((a) => isFunding(a) && a.includes(side));
		if (funding) draft.fundingAccount = { value: funding, confidence: 'low' };
	}
}

export async function interpretText(
	text: string,
	opts: { useAi: boolean; kind: Side },
	deps: InterpretDeps,
): Promise<ParsedDraft> {
	const side = sideToken(opts.kind, deps.cfg);
	const draft = parseText(text, deps.payees, deps.cfg);
	// Only suggest accounts on the active side (cross-side stays hand-selectable)
	if (draft.fundingAccount && !draft.fundingAccount.value.includes(side)) {
		delete draft.fundingAccount;
	}

	if (opts.useAi && deps.ollama.enabled) {
		const ai = await deps.ollama.generate({ text }).catch(() => null);
		if (ai) {
			// Heuristic wins on amount; AI fills gaps elsewhere.
			const aiAmount = validateAmountString(ai.amount_string, text);
			if (!draft.amount && aiAmount) draft.amount = { value: aiAmount, confidence: 'medium' };
			if (ai.merchant && (!draft.payee || draft.payee.confidence !== 'high')) {
				const norm = normalizePayee(ai.merchant);
				const known = deps.payees.find((p) => p.toLowerCase() === norm.toLowerCase());
				draft.payee = { value: known ?? norm, confidence: known ? 'high' : 'medium' };
			}
			if (ai.memo && !draft.narration) {
				draft.narration = { value: ai.memo.slice(0, 120), confidence: 'medium' };
			}
			if (ai.direction === 'incoming' && !draft.refund) {
				draft.refund = { value: true, confidence: 'medium' };
			}
			if (ai.date && ISO_DATE.test(ai.date) && draft.date?.confidence === 'low') {
				draft.date = { value: ai.date, confidence: 'medium' };
			}
		}
	}

	await suggestAccounts(
		draft,
		side,
		deps.client,
		draft.payee?.confidence === 'high' ? 'medium' : 'low',
	);
	return draft;
}

export async function interpretImage(
	imageBase64: string,
	kind: Side,
	deps: InterpretDeps,
): Promise<ParsedDraft> {
	const side = sideToken(kind, deps.cfg);
	const ai = await deps.ollama.generate({ imageBase64 });
	if (!ai) throw new Error('AI returned no result');
	const draft: ParsedDraft = {};
	const amount = validateAmountString(ai.amount_string);
	if (amount) draft.amount = { value: amount, confidence: 'medium' };
	if (ai.merchant) {
		const norm = normalizePayee(ai.merchant);
		const known = deps.payees.find((p) => p.toLowerCase() === norm.toLowerCase());
		draft.payee = { value: known ?? norm, confidence: known ? 'high' : 'low' };
	}
	if (ai.memo) draft.narration = { value: ai.memo.slice(0, 120), confidence: 'low' };
	if (ai.direction === 'incoming') draft.refund = { value: true, confidence: 'low' };
	draft.date =
		ai.date && ISO_DATE.test(ai.date)
			? { value: ai.date, confidence: 'medium' }
			: { value: todayISO(), confidence: 'low' };
	await suggestAccounts(draft, side, deps.client, 'low');
	return draft;
}

/**
 * Downscale an image to at most `maxEdge` px on its long side and return the
 * JPEG bytes as raw base64 (no data: prefix). Keeps the Ollama request body
 * small on mobile screenshots.
 */
export async function fileToBase64Jpeg(file: File | Blob, maxEdge = 1600): Promise<string> {
	const url = URL.createObjectURL(file);
	try {
		const img = await new Promise<HTMLImageElement>((resolve, reject) => {
			const el = new Image();
			el.onload = () => resolve(el);
			el.onerror = () => reject(new Error('Could not read image'));
			el.src = url;
		});
		const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
		const w = Math.max(1, Math.round(img.naturalWidth * scale));
		const h = Math.max(1, Math.round(img.naturalHeight * scale));
		const canvas = createEl('canvas');
		canvas.width = w;
		canvas.height = h;
		const ctx = canvas.getContext('2d');
		if (!ctx) throw new Error('Canvas unavailable');
		ctx.drawImage(img, 0, 0, w, h);
		const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
		return dataUrl.split(',')[1] ?? '';
	} finally {
		URL.revokeObjectURL(url);
	}
}
