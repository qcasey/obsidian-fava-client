// Input helpers for the quick-entry modal: text-field builders and
// AbstractInputSuggest popovers for payees and accounts.

import { AbstractInputSuggest, type App } from 'obsidian';

/** Multi-token "every word appears" filter, capped for popover speed. */
export function filterOptions(options: string[], query: string, cap = 50): string[] {
	const parts = query.toLowerCase().split(/\s+/).filter(Boolean);
	if (parts.length === 0) return options.slice(0, cap);
	const out: string[] = [];
	for (const o of options) {
		const lo = o.toLowerCase();
		if (parts.every((p) => lo.includes(p))) {
			out.push(o);
			if (out.length >= cap) break;
		}
	}
	return out;
}

abstract class BaseSuggest extends AbstractInputSuggest<string> {
	constructor(
		app: App,
		protected readonly inputEl: HTMLInputElement,
		private readonly items: () => string[],
		private readonly onPick: (value: string) => void,
	) {
		super(app, inputEl);
		this.limit = 50;
	}

	protected getSuggestions(query: string): string[] {
		return filterOptions(this.items(), query);
	}

	selectSuggestion(value: string): void {
		this.setValue(value);
		this.onPick(value);
		this.close();
	}
}

/** Payee picker: free text stays as typed; suggestions come from the ledger. */
export class PayeeSuggest extends BaseSuggest {
	renderSuggestion(value: string, el: HTMLElement): void {
		el.setText(value);
	}
}

/** Account picker: the tail segments are what distinguish long account names. */
export class AccountSuggest extends BaseSuggest {
	renderSuggestion(value: string, el: HTMLElement): void {
		const segs = value.split(':');
		const head = segs.slice(0, 2).join(':');
		const tail = segs.slice(2).join(':');
		el.addClass('fava-suggest-account');
		if (tail) {
			el.createSpan({ cls: 'fava-suggest-account__head', text: `${head}:` });
			el.createSpan({ cls: 'fava-suggest-account__tail', text: tail });
		} else {
			el.createSpan({ cls: 'fava-suggest-account__tail', text: value });
		}
	}
}

export interface FieldHandle {
	wrapper: HTMLElement;
	input: HTMLInputElement;
}

/** Label + input wrapper; the wrapper carries confidence ring classes. */
export function textField(
	parent: HTMLElement,
	label: string,
	opts: { type?: string; placeholder?: string; inputmode?: string; cls?: string } = {},
): FieldHandle {
	const wrapper = parent.createDiv({ cls: `fava-field${opts.cls ? ` ${opts.cls}` : ''}` });
	wrapper.createEl('label', { cls: 'fava-field__label', text: label });
	const input = wrapper.createEl('input', {
		type: opts.type ?? 'text',
		cls: 'fava-field__input',
		placeholder: opts.placeholder,
	});
	if (opts.inputmode) input.inputMode = opts.inputmode;
	return { wrapper, input };
}

const CONFIDENCE_CLASSES = ['fava-conf-medium', 'fava-conf-low'];

export function setConfidence(el: HTMLElement, confidence: 'high' | 'medium' | 'low' | null): void {
	el.removeClasses(CONFIDENCE_CLASSES);
	if (confidence === 'medium') el.addClass('fava-conf-medium');
	else if (confidence === 'low') el.addClass('fava-conf-low');
}

export function clearConfidence(el: HTMLElement): void {
	el.removeClasses(CONFIDENCE_CLASSES);
}
