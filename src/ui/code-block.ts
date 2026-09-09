// ```fava code blocks → embedded cards that follow the shared store.

import { MarkdownRenderChild, type MarkdownPostProcessorContext } from 'obsidian';
import { CARDS, coerceParams, getCard, parseFavaBlock, renderCard } from '../cards/registry';
import { SetCardUi, type CardContext, type CardDef, type Params } from '../cards/types';
import type FavaClientPlugin from '../main';
import { skeletonCard } from './dom';

export function registerFavaCodeBlock(plugin: FavaClientPlugin): void {
	plugin.registerMarkdownCodeBlockProcessor('fava', (source, el, ctx: MarkdownPostProcessorContext) => {
		el.addClass('fava-embed');
		const parsed = parseFavaBlock(source);
		if (!parsed.ok) {
			errorCard(el, parsed.error);
			return;
		}
		const def = getCard(parsed.card);
		if (!def) {
			errorCard(el, `Unknown card "${parsed.card}". Cards: ${CARDS.map((c) => c.id).join(', ')}`);
			return;
		}
		const params = coerceParams(def, parsed.raw);
		if (!params.ok) {
			errorCard(el, params.error);
			return;
		}
		ctx.addChild(new FavaCardChild(el, plugin, def, params.params));
	});
}

export function errorCard(parent: HTMLElement, message: string): void {
	const card = parent.createDiv({ cls: 'fava-card fava-error' });
	card.createDiv({ cls: 'fava-card__label', text: 'Fava card' });
	card.createDiv({ cls: 'fava-error__msg', text: message });
}

class FavaCardChild extends MarkdownRenderChild {
	private readonly ui = new SetCardUi();

	constructor(
		containerEl: HTMLElement,
		private readonly plugin: FavaClientPlugin,
		private readonly def: CardDef,
		private readonly params: Params,
	) {
		super(containerEl);
	}

	onload(): void {
		this.registerEvent(this.plugin.store.onChange(() => this.render()));
		this.render();
		void this.plugin.store.ensure().catch(() => undefined);
	}

	private render(): void {
		this.containerEl.empty();
		const store = this.plugin.store;
		if (!store.snapshot) {
			if (store.status === 'error' && store.error) {
				errorCard(this.containerEl, store.error.message);
			} else {
				skeletonCard(this.containerEl);
			}
			return;
		}
		const ctx: CardContext = {
			snapshot: store.snapshot,
			cfg: this.plugin.domainConfig,
			settings: this.plugin.settings,
			links: this.plugin.links,
			ui: this.ui,
			component: this,
			keyPrefix: 'embed',
			inDashboard: false,
			openQuickEntry: () => this.plugin.openQuickEntry(),
			setHoursPerWeek: (v) => {
				this.plugin.settings.hoursPerWeek = v;
				void this.plugin.saveSettings();
			},
		};
		renderCard(this.containerEl, this.def, ctx, this.params);
	}
}
