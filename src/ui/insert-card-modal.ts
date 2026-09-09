// Suggest modals for the insert-card and copy-inline-reference commands.

import { Notice, SuggestModal, type App, type Editor } from 'obsidian';
import { INLINE_ALIASES, type InlineAlias } from '../cards/inline';
import { CARDS, cardTemplate } from '../cards/registry';
import type { CardDef } from '../cards/types';

export class InsertCardModal extends SuggestModal<CardDef> {
	constructor(
		app: App,
		private readonly editor: Editor,
	) {
		super(app);
		this.setPlaceholder('Pick a card to insert');
	}

	getSuggestions(query: string): CardDef[] {
		const q = query.toLowerCase();
		return CARDS.filter((c) => !q || c.id.includes(q) || c.title.toLowerCase().includes(q) || c.desc.toLowerCase().includes(q));
	}

	renderSuggestion(c: CardDef, el: HTMLElement): void {
		el.createDiv({ text: c.title });
		el.createEl('small', { text: `${c.id} — ${c.desc}` });
	}

	onChooseSuggestion(c: CardDef): void {
		this.editor.replaceSelection(cardTemplate(c));
	}
}

export class CopyInlineModal extends SuggestModal<InlineAlias> {
	constructor(
		app: App,
		private readonly editor: Editor | null,
	) {
		super(app);
		this.setPlaceholder(this.editor ? 'Pick a value to insert' : 'Pick a value to copy');
	}

	getSuggestions(query: string): InlineAlias[] {
		const q = query.toLowerCase();
		return INLINE_ALIASES.filter((a) => !q || a.alias.includes(q) || a.label.toLowerCase().includes(q));
	}

	renderSuggestion(a: InlineAlias, el: HTMLElement): void {
		el.createDiv({ text: a.label });
		el.createEl('small', { text: `fava:${a.alias}` });
	}

	onChooseSuggestion(a: InlineAlias): void {
		const text = `\`fava:${a.alias}\``;
		if (this.editor) {
			this.editor.replaceSelection(text);
			return;
		}
		void navigator.clipboard.writeText(text).then(
			() => new Notice(`Copied ${text}`),
			() => new Notice('Could not copy to clipboard'),
		);
	}
}
