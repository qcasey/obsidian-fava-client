// `fava:<alias>` inline code → a live number in running text.

import { MarkdownRenderChild, setTooltip } from 'obsidian';
import { resolveInline } from '../cards/inline';
import { fmtAgo } from '../lib/dates';
import type FavaClientPlugin from '../main';

const PREFIX = 'fava:';

export function registerFavaInline(plugin: FavaClientPlugin): void {
	plugin.registerMarkdownPostProcessor((el, ctx) => {
		const codes = el.querySelectorAll('code');
		codes.forEach((code) => {
			if (code.parentElement instanceof HTMLPreElement) return;
			const text = code.textContent ?? '';
			if (!text.startsWith(PREFIX)) return;
			const ref = text.slice(PREFIX.length).trim();
			if (!ref) return;
			const span = createSpan({ cls: 'fava-inline' });
			code.replaceWith(span);
			ctx.addChild(new FavaInlineChild(span, plugin, ref));
		});
	});
}

class FavaInlineChild extends MarkdownRenderChild {
	constructor(
		containerEl: HTMLElement,
		private readonly plugin: FavaClientPlugin,
		private readonly ref: string,
	) {
		super(containerEl);
	}

	onload(): void {
		this.registerEvent(this.plugin.store.onChange(() => this.render()));
		this.render();
		void this.plugin.store.ensure().catch(() => undefined);
	}

	private render(): void {
		const el = this.containerEl;
		el.className = 'fava-inline';
		const store = this.plugin.store;
		if (!store.snapshot) {
			if (store.status === 'error' && store.error) {
				el.setText('!');
				el.addClass('is-error');
				setTooltip(el, store.error.message);
			} else {
				el.setText('…');
				el.addClass('is-loading');
			}
			return;
		}
		const r = resolveInline(this.ref, store.snapshot, this.plugin.domainConfig);
		if (!r.ok) {
			el.setText('?');
			el.addClass('is-error');
			setTooltip(el, r.error);
			return;
		}
		el.setText(r.value.text);
		if (r.value.status && r.value.status !== 'none') el.addClass(`is-${r.value.status}`);
		setTooltip(el, `${r.value.label} · updated ${fmtAgo(store.snapshot.loadedAt)}`);
	}
}
