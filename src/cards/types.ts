// Card registry contracts. Dashboard sections and ```fava embeds both render
// through CardDef so the two always match.

import type { Component } from 'obsidian';
import type { DomainConfig } from '../lib/config';
import type { FavaLinks } from '../lib/fava-links';
import type { FavaSettings } from '../settings';
import type { Snapshot } from '../types';

/** Fields the add-entry form can open with already filled in. */
export interface QuickEntryPrefill {
	amount?: string;
	payee?: string;
	narration?: string;
	/** YYYY-MM-DD */
	date?: string;
	/** Funding account (Paid with) */
	funding?: string;
	/** Expense / income account */
	category?: string;
	refund?: boolean;
	uncertain?: boolean;
	/** Raw text (email, receipt) to run through the interpreter first */
	text?: string;
}

export type ParamValue = string | number | boolean;
export type Params = Record<string, ParamValue>;
export type ParamKind = 'string' | 'number' | 'boolean' | { enum: readonly string[] };

export interface ParamSpec {
	name: string;
	kind: ParamKind;
	required?: boolean;
	default?: ParamValue;
	desc: string;
}

/** Expand/collapse and selection state that survives re-renders. */
export interface CardUi {
	isExpanded(key: string): boolean;
	toggle(key: string): void;
	/** Remembered value of a multi-option switch */
	getChoice(key: string): string | undefined;
	setChoice(key: string, value: string): void;
}

export interface CardContext {
	snapshot: Snapshot;
	cfg: DomainConfig;
	settings: FavaSettings;
	links: FavaLinks;
	ui: CardUi;
	/** Owner for DOM event cleanup */
	component: Component;
	/** Unique prefix so the same card twice on one page keeps separate state */
	keyPrefix: string;
	/** True on the dashboard, false for cards embedded in notes */
	inDashboard: boolean;
	/** A background refresh is replacing the visible snapshot */
	updating: boolean;
	openQuickEntry(opts?: QuickEntryPrefill): void;
	setHoursPerWeek(v: number): void;
}

export interface CardDef {
	id: string;
	title: string;
	desc: string;
	/** Spans two grid columns when the container is wide enough */
	wide?: boolean;
	params: ParamSpec[];
	render(el: HTMLElement, ctx: CardContext, p: Params): void;
}

/** Somewhere to keep switch positions between sessions. */
export interface ChoiceStore {
	get(key: string): string | undefined;
	set(key: string, value: string): void;
}

export class SetCardUi implements CardUi {
	private readonly expanded = new Set<string>();
	private readonly choices = new Map<string, string>();

	/** Without a store, choices last only as long as this view. */
	constructor(private readonly store?: ChoiceStore) {}

	isExpanded(key: string): boolean {
		return this.expanded.has(key);
	}
	toggle(key: string): void {
		if (this.expanded.has(key)) this.expanded.delete(key);
		else this.expanded.add(key);
	}
	getChoice(key: string): string | undefined {
		return this.store ? this.store.get(key) : this.choices.get(key);
	}
	setChoice(key: string, value: string): void {
		if (this.store) this.store.set(key, value);
		else this.choices.set(key, value);
	}
}
