// Small createEl-based building blocks shared by every card.

import { setIcon, setTooltip, type Component } from 'obsidian';
import type { CardUi } from '../cards/types';
import type { Status } from '../types';

export function statusDot(parent: HTMLElement, status: Status | undefined): HTMLElement | null {
	if (!status || status === 'none') return null;
	const dot = parent.createSpan({ cls: `fava-dot is-${status}` });
	setTooltip(dot, status === 'green' ? 'Healthy' : status === 'yellow' ? 'Watch' : 'Needs attention');
	return dot;
}

export interface CardShellOpts {
	label: string;
	value?: string;
	detail?: string;
	status?: Status;
	/** External link (Fava deep link) */
	href?: string;
	/** Extra class on the value, e.g. is-negative */
	valueClass?: string;
	/** When set, the header toggles the body */
	toggle?: { key: string; ui: CardUi };
	/** Suppress the header padding when the card is only a body (charts) */
	bare?: boolean;
}

export interface CardShell {
	card: HTMLElement;
	header: HTMLElement;
	/** Always returned; hidden when collapsed */
	body: HTMLElement;
}

export function cardShell(el: HTMLElement, o: CardShellOpts): CardShell {
	el.addClass('fava-card');
	const header = el.createDiv({ cls: 'fava-card__header' });
	const main = header.createDiv({ cls: 'fava-card__main' });
	const labelRow = main.createDiv({ cls: 'fava-card__label' });
	labelRow.createSpan({ text: o.label });
	statusDot(labelRow, o.status);
	if (o.value !== undefined) {
		main.createDiv({ cls: `fava-card__value ${o.valueClass ?? ''}`.trim(), text: o.value });
	}
	if (o.detail) main.createDiv({ cls: 'fava-card__detail', text: o.detail });

	const aside = header.createDiv({ cls: 'fava-card__aside' });
	if (o.href) externalLink(aside, o.href);

	const body = el.createDiv({ cls: 'fava-card__body' });
	if (o.toggle) {
		const { key, ui } = o.toggle;
		const chevron = aside.createSpan({ cls: 'fava-card__chevron' });
		setIcon(chevron, 'chevron-down');
		header.addClass('fava-card__header--toggle');
		header.setAttr('role', 'button');
		header.setAttr('tabindex', '0');
		const apply = () => {
			const open = ui.isExpanded(key);
			body.hidden = !open;
			el.toggleClass('is-expanded', open);
			header.setAttr('aria-expanded', String(open));
		};
		apply();
		const flip = (evt: Event) => {
			if (evt.target instanceof HTMLElement && evt.target.closest('a, input, button')) return;
			ui.toggle(key);
			apply();
		};
		header.addEventListener('click', flip);
		header.addEventListener('keydown', (e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				flip(e);
			}
		});
	}
	if (o.bare) el.addClass('fava-card--bare');
	return { card: el, header, body };
}

export function externalLink(parent: HTMLElement, href: string, label = 'Open in Fava'): HTMLAnchorElement {
	const a = parent.createEl('a', {
		cls: 'fava-card__link',
		href,
		attr: { target: '_blank', rel: 'noopener', 'aria-label': label },
	});
	setIcon(a, 'external-link');
	setTooltip(a, label);
	return a;
}

/** Label/value row used inside card bodies. */
export function kv(
	parent: HTMLElement,
	label: string,
	value: string,
	opts: { muted?: boolean; strong?: boolean; valueClass?: string } = {},
): HTMLElement {
	const row = parent.createDiv({
		cls: `fava-kv${opts.muted ? ' is-muted' : ''}${opts.strong ? ' is-strong' : ''}`,
	});
	row.createSpan({ cls: 'fava-kv__label', text: label });
	row.createSpan({ cls: `fava-kv__value ${opts.valueClass ?? ''}`.trim(), text: value });
	return row;
}

export function note(parent: HTMLElement, text: string): HTMLElement {
	return parent.createDiv({ cls: 'fava-note', text });
}

export type BarTone = 'normal' | 'red' | 'green' | 'accent';

/** Horizontal progress/magnitude bar. pct is clamped 0–100. */
export function bar(parent: HTMLElement, pct: number, tone: BarTone = 'normal'): HTMLElement {
	const track = parent.createDiv({ cls: 'fava-bar' });
	const fill = track.createDiv({ cls: `fava-bar__fill is-${tone}` });
	fill.setCssProps({ '--fava-pct': `${Math.min(100, Math.max(0, pct))}%` });
	return track;
}

/** Row: label · bar · value (· extra) */
export function barRow(
	parent: HTMLElement,
	o: { label: string; pct: number; value: string; extra?: string; tone?: BarTone; href?: string },
): HTMLElement {
	const row = parent.createDiv({ cls: 'fava-barrow' });
	row.createSpan({ cls: 'fava-barrow__label', text: o.label });
	bar(row, o.pct, o.tone);
	row.createSpan({ cls: 'fava-barrow__value', text: o.value });
	if (o.extra !== undefined) row.createSpan({ cls: 'fava-barrow__extra', text: o.extra });
	return row;
}

/**
 * Masonry: distribute the grid's cards into as many columns as fit, each card
 * going to the currently shortest column. Re-runs when the width changes.
 */
export function applyMasonry(grid: HTMLElement, component: Component, minCol = 260): void {
	const cards = Array.from(grid.children).filter((c): c is HTMLElement => c.instanceOf(HTMLElement));
	grid.addClass('is-masonry');
	let lastCols = 0;
	const layout = () => {
		const width = grid.clientWidth;
		if (width === 0) return;
		const gap = 12;
		const cols = Math.max(1, Math.floor((width + gap) / (minCol + gap)));
		if (cols === lastCols) return;
		lastCols = cols;
		grid.empty();
		const colEls: HTMLElement[] = [];
		for (let i = 0; i < cols; i++) colEls.push(grid.createDiv({ cls: 'fava-col' }));
		// First pass gives every card its final width so heights are measurable.
		cards.forEach((c, i) => colEls[i % cols]?.appendChild(c));
		const heights = cards.map((c) => c.offsetHeight);
		const totals = new Array<number>(cols).fill(0);
		cards.forEach((c, i) => {
			const shortest = totals.indexOf(Math.min(...totals));
			colEls[shortest]?.appendChild(c);
			totals[shortest] = (totals[shortest] ?? 0) + (heights[i] ?? 0) + gap;
		});
	};
	layout();
	const ro = new ResizeObserver(() => layout());
	ro.observe(grid);
	component.register(() => ro.disconnect());
}

export function skeletonCard(parent: HTMLElement): HTMLElement {
	const card = parent.createDiv({ cls: 'fava-card fava-skeleton' });
	card.createDiv({ cls: 'fava-skeleton__line is-short' });
	card.createDiv({ cls: 'fava-skeleton__line is-big' });
	card.createDiv({ cls: 'fava-skeleton__line' });
	return card;
}

export function iconButton(
	parent: HTMLElement,
	icon: string,
	label: string,
	onClick: (evt: MouseEvent) => void,
): HTMLButtonElement {
	const btn = parent.createEl('button', {
		cls: 'fava-iconbtn clickable-icon',
		attr: { 'aria-label': label, type: 'button' },
	});
	setIcon(btn, icon);
	setTooltip(btn, label);
	btn.addEventListener('click', onClick);
	return btn;
}

/** Two-or-more option segmented control. Returns a setter for the active value. */
export function segmented<T extends string>(
	parent: HTMLElement,
	options: { value: T; label: string }[],
	current: T,
	onChange: (v: T) => void,
): (v: T) => void {
	const wrap = parent.createDiv({ cls: 'fava-seg', attr: { role: 'tablist' } });
	const buttons = new Map<T, HTMLButtonElement>();
	const set = (v: T) => {
		for (const [val, b] of buttons) {
			const on = val === v;
			b.toggleClass('is-active', on);
			b.setAttr('aria-pressed', String(on));
		}
	};
	for (const o of options) {
		const b = wrap.createEl('button', { text: o.label, attr: { type: 'button', role: 'tab' } });
		b.addEventListener('click', () => {
			set(o.value);
			onChange(o.value);
		});
		buttons.set(o.value, b);
	}
	set(current);
	return set;
}

export function trendGlyph(pct: number, threshold = 5): { text: string; cls: string } {
	if (Math.abs(pct) <= threshold) return { text: '=', cls: 'is-muted' };
	return {
		text: `${pct > 0 ? '▲' : '▼'} ${Math.abs(pct).toFixed(0)}%`,
		cls: pct > 0 ? 'is-red' : 'is-green',
	};
}
