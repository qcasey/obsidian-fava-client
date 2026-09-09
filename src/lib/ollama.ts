// Optional AI parse via a local Ollama instance. Only used when an Ollama URL
// is set; results are ALWAYS re-validated against the raw text (small local
// models are known to misread amounts — the heuristic regex wins conflicts).

import { requestUrl } from 'obsidian';
import type { FavaSettings } from '../settings';
import { withTimeout } from './fava-client';

export type OllamaSettings = Pick<FavaSettings, 'ollamaUrl' | 'ollamaTextModel' | 'ollamaVisionModel'>;

export interface OllamaExtraction {
	merchant?: string;
	amount_string?: string;
	date?: string;
	memo?: string;
	direction?: string;
	source?: string;
}

const OLLAMA_TIMEOUT_MS = 120_000;

const PROMPT = `Extract financial information from this content. Do NOT classify or categorize — just extract the raw data.

Respond with JSON only:
{"merchant": "who was paid or who paid", "amount_string": "the dollar amount COPIED CHARACTER-FOR-CHARACTER from the content, including the $ sign — do not compute or reformat it", "date": "transaction date as YYYY-MM-DD if present, else empty", "memo": "item names or brief description if available", "direction": "outgoing or incoming", "source": "card issuer or platform name if identifiable"}

Rules:
- amount_string must appear verbatim in the content. Never calculate.
- direction is "incoming" for refunds/credits/deposits, otherwise "outgoing".
- Keep memo brief.`;

function str(v: unknown): string | undefined {
	return typeof v === 'string' && v.trim() ? v : undefined;
}

export class OllamaClient {
	constructor(private readonly settings: () => OllamaSettings) {}

	get enabled(): boolean {
		return this.settings().ollamaUrl.trim() !== '';
	}

	async generate(input: { text?: string; imageBase64?: string }): Promise<OllamaExtraction | null> {
		const s = this.settings();
		const base = s.ollamaUrl.trim().replace(/\/+$/, '');
		if (!base) return null;
		const isImage = Boolean(input.imageBase64);
		const body = {
			model: isImage ? s.ollamaVisionModel : s.ollamaTextModel,
			prompt: isImage
				? `${PROMPT}\n\nThe content is the attached screenshot.`
				: `${PROMPT}\n\nCONTENT:\n${(input.text ?? '').slice(0, 4000)}`,
			...(isImage ? { images: [input.imageBase64] } : {}),
			stream: false,
			format: 'json',
			options: { temperature: 0.1, num_predict: 300 },
		};
		const res = await withTimeout(
			requestUrl({
				url: `${base}/api/generate`,
				method: 'POST',
				contentType: 'application/json',
				body: JSON.stringify(body),
				throw: false,
			}),
			OLLAMA_TIMEOUT_MS,
			'Ollama',
		);
		if (res.status >= 400) throw new Error(`Ollama ${res.status}`);
		const response = (res.json as { response?: unknown } | null)?.response;
		if (typeof response !== 'string') return null;
		try {
			const parsed: unknown = JSON.parse(response);
			if (typeof parsed !== 'object' || parsed === null) return null;
			const p = parsed as Record<string, unknown>;
			return {
				merchant: str(p.merchant),
				amount_string: str(p.amount_string),
				date: str(p.date),
				memo: str(p.memo),
				direction: str(p.direction),
				source: str(p.source),
			};
		} catch {
			return null;
		}
	}
}

/** amount_string is only trusted if it looks like money AND (for text input)
 *  appears verbatim in the source. Returns a cleaned "12.34" or null. */
export function validateAmountString(
	amountString: string | undefined,
	sourceText?: string,
): string | null {
	if (!amountString) return null;
	const m = amountString.match(/\$?\s?([\d,]+\.\d{2})/);
	const captured = m?.[1];
	if (!captured) return null;
	if (sourceText && !sourceText.includes(captured)) return null;
	return captured.replace(/,/g, '');
}
