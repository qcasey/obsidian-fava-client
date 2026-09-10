// Card registry contracts. Dashboard sections and ```fava embeds both render
// through CardDef so the two always match.

import type { Component } from 'obsidian';
import type { DomainConfig } from '../lib/config';
import type { FavaLinks } from '../lib/fava-links';
import type { FavaSettings } from '../settings';
import type { Snapshot } from '../types';

export interface QuickEntryPrefill {
	amount?: string;
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

/** Expand/collapse state that survives re-renders. */
export interface CardUi {
	isExpanded(key: string): boolean;
	toggle(key: string): void;
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

export class SetCardUi implements CardUi {
	private readonly expanded = new Set<string>();
	constructor(private readonly onChange?: () => void) {}
	isExpanded(key: string): boolean {
		return this.expanded.has(key);
	}
	toggle(key: string): void {
		if (this.expanded.has(key)) this.expanded.delete(key);
		else this.expanded.add(key);
		this.onChange?.();
	}
}
