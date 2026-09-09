// Single source of truth for cards: dashboard sections and ```fava blocks both
// render through here.

import { parseYaml } from 'obsidian';
import { CHART_CARDS } from './chart-cards';
import { LIST_CARDS } from './list-cards';
import { METRIC_CARDS } from './metric-cards';
import type { CardContext, CardDef, Params, ParamValue } from './types';

export const CARDS: CardDef[] = [...METRIC_CARDS, ...LIST_CARDS, ...CHART_CARDS];

export function getCard(id: string): CardDef | undefined {
	return CARDS.find((c) => c.id === id);
}

export type BlockParse = { ok: true; card: string; raw: Record<string, unknown> } | { ok: false; error: string };

/** Parse a ```fava block body: YAML with a required `card:` key. */
export function parseFavaBlock(source: string): BlockParse {
	let parsed: unknown;
	try {
		parsed = parseYaml(source) as unknown;
	} catch (e) {
		return { ok: false, error: `Could not parse block: ${e instanceof Error ? e.message : String(e)}` };
	}
	if (typeof parsed === 'string' && parsed.trim()) {
		// Bare "envelope" shorthand
		return { ok: true, card: parsed.trim(), raw: {} };
	}
	if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
		return { ok: false, error: 'Block must contain key: value lines, starting with card:' };
	}
	const rec = parsed as Record<string, unknown>;
	const card = rec.card;
	if (typeof card !== 'string' || !card.trim()) {
		return { ok: false, error: 'Missing card: <id>' };
	}
	const { card: _c, ...rest } = rec;
	return { ok: true, card: card.trim(), raw: rest };
}

export type ParamsResult = { ok: true; params: Params } | { ok: false; error: string };

export function coerceParams(def: CardDef, raw: Record<string, unknown>): ParamsResult {
	const out: Params = {};
	for (const spec of def.params) {
		const v = raw[spec.name];
		if (v === undefined || v === null) {
			if (spec.required) return { ok: false, error: `${def.id} needs ${spec.name}` };
			if (spec.default !== undefined) out[spec.name] = spec.default;
			continue;
		}
		const coerced = coerceOne(spec.kind, v);
		if (coerced === undefined) {
			const want = typeof spec.kind === 'string' ? spec.kind : `one of ${spec.kind.enum.join(', ')}`;
			return { ok: false, error: `${spec.name} must be ${want}` };
		}
		out[spec.name] = coerced;
	}
	const unknown = Object.keys(raw).filter((k) => !def.params.some((p) => p.name === k));
	if (unknown.length) {
		return {
			ok: false,
			error: `Unknown option${unknown.length > 1 ? 's' : ''} ${unknown.join(', ')} for ${def.id}${def.params.length ? ` (valid: ${def.params.map((p) => p.name).join(', ')})` : ''}`,
		};
	}
	return { ok: true, params: out };
}

function coerceOne(kind: CardDef['params'][number]['kind'], v: unknown): ParamValue | undefined {
	if (typeof kind === 'object') {
		const s = String(v);
		return kind.enum.includes(s) ? s : undefined;
	}
	switch (kind) {
		case 'string':
			return typeof v === 'string' || typeof v === 'number' ? String(v) : undefined;
		case 'number': {
			const n = typeof v === 'number' ? v : Number(v);
			return Number.isFinite(n) ? n : undefined;
		}
		case 'boolean':
			if (typeof v === 'boolean') return v;
			if (v === 'true' || v === 'yes') return true;
			if (v === 'false' || v === 'no') return false;
			return undefined;
	}
}

/**
 * Render one card into a fresh container inside `parent`. A card that throws
 * becomes an error card so one bad render never blanks the rest of the page.
 */
export function renderCard(parent: HTMLElement, def: CardDef, ctx: CardContext, params: Params): HTMLElement {
	const el = parent.createDiv({ cls: def.wide ? 'fava-card--wide' : '' });
	el.dataset.card = def.id;
	try {
		def.render(el, ctx, params);
	} catch (e) {
		el.empty();
		el.addClass('fava-card', 'fava-error');
		el.createDiv({ cls: 'fava-card__label', text: `${def.title} failed to render` });
		const msg = e instanceof Error ? `${e.message}\n${(e.stack ?? '').split('\n').slice(1, 3).join('\n')}` : String(e);
		el.createEl('pre', { cls: 'fava-error__msg', text: msg });
		console.error(`[fava-client] card ${def.id}`, e);
	}
	return el;
}

/** Text of a ```fava block for the insert command. */
export function cardTemplate(def: CardDef): string {
	const lines = [`card: ${def.id}`];
	for (const p of def.params) {
		if (p.required) lines.push(`${p.name}: `);
		else if (p.default !== undefined) lines.push(`# ${p.name}: ${String(p.default)}  — ${p.desc}`);
		else lines.push(`# ${p.name}:  — ${p.desc}`);
	}
	return '```fava\n' + lines.join('\n') + '\n```\n';
}
