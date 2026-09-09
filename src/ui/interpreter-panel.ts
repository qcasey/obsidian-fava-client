// "Paste text / screenshot" panel for the quick-entry modal. Heuristic parse
// always works; AI parse and screenshots need an Ollama URL in settings.

import { Notice, setIcon, type Component } from 'obsidian';
import { fileToBase64Jpeg, interpretImage, interpretText, type InterpretDeps } from '../lib/interpret';
import { OllamaClient } from '../lib/ollama';
import type FavaClientPlugin from '../main';
import type { ParsedDraft, Side } from '../types';

export interface InterpreterPanelOptions {
	kind: () => Side;
	onParsed: (draft: ParsedDraft) => void;
	/** Owner for DOM event cleanup (the modal). */
	component: Component;
}

export class InterpreterPanel {
	private readonly textarea: HTMLTextAreaElement;
	private readonly buttons: HTMLButtonElement[] = [];
	private readonly fileInput: HTMLInputElement | null = null;
	private readonly body: HTMLElement;
	private busy = false;
	private open = false;

	constructor(
		private readonly plugin: FavaClientPlugin,
		container: HTMLElement,
		private readonly opts: InterpreterPanelOptions,
	) {
		const ai = plugin.aiEnabled;
		const root = container.createDiv({ cls: 'fava-interp' });

		const header = root.createEl('button', {
			cls: 'fava-interp__header',
			attr: { type: 'button', 'aria-expanded': 'false' },
		});
		const icon = header.createSpan({ cls: 'fava-interp__icon' });
		setIcon(icon, 'wand-2');
		header.createSpan({ text: ai ? 'Paste text or screenshot' : 'Paste text' });
		const chevron = header.createSpan({ cls: 'fava-interp__chevron' });
		setIcon(chevron, 'chevron-down');

		this.body = root.createDiv({ cls: 'fava-interp__body' });
		this.body.hidden = true;

		this.textarea = this.body.createEl('textarea', {
			cls: 'fava-interp__text',
			attr: {
				rows: '4',
				placeholder:
					'Paste a bank alert, receipt email, or any text describing the transaction…',
			},
		});

		const row = this.body.createDiv({ cls: 'fava-interp__actions' });
		const parseBtn = this.addButton(row, 'Parse', () => void this.parse(false));
		this.buttons.push(parseBtn);

		if (ai) {
			this.buttons.push(this.addButton(row, 'AI parse', () => void this.parse(true), 'sparkles'));
			this.buttons.push(
				this.addButton(row, 'Screenshot', () => this.fileInput?.click(), 'image'),
			);
			const file = this.body.createEl('input', {
				type: 'file',
				cls: 'fava-interp__file',
				attr: { accept: 'image/*' },
			});
			file.hidden = true;
			this.fileInput = file;
			opts.component.registerDomEvent(file, 'change', () => {
				const f = file.files?.[0];
				if (f) void this.parseImage(f);
			});
		} else {
			this.body.createEl('p', {
				cls: 'fava-interp__tip',
				text: 'Tip: for screenshots, use "copy text from image" on your phone and paste it here. Ollama (set its URL in settings) enables AI parsing.',
			});
		}

		opts.component.registerDomEvent(header, 'click', () => {
			this.open = !this.open;
			this.body.hidden = !this.open;
			header.setAttribute('aria-expanded', String(this.open));
			header.toggleClass('is-open', this.open);
			if (this.open) this.textarea.focus();
		});
		opts.component.registerDomEvent(this.textarea, 'input', () => this.syncButtons());
		opts.component.registerDomEvent(this.textarea, 'paste', (e: ClipboardEvent) => {
			const f = e.clipboardData?.files?.[0];
			if (f && f.type.startsWith('image/')) {
				e.preventDefault();
				if (!this.plugin.aiEnabled) {
					new Notice('Ollama URL is not set, so screenshots cannot be parsed');
					return;
				}
				void this.parseImage(f);
			}
		});
		this.syncButtons();
	}

	private addButton(
		parent: HTMLElement,
		label: string,
		onClick: () => void,
		icon?: string,
	): HTMLButtonElement {
		const btn = parent.createEl('button', { cls: 'fava-interp__btn', attr: { type: 'button' } });
		if (icon) {
			const i = btn.createSpan({ cls: 'fava-interp__btn-icon' });
			setIcon(i, icon);
		}
		btn.createSpan({ text: label });
		this.opts.component.registerDomEvent(btn, 'click', onClick);
		return btn;
	}

	private syncButtons(): void {
		const hasText = this.textarea.value.trim() !== '';
		this.buttons.forEach((b, i) => {
			// Parse and AI parse need text; Screenshot only needs to be idle.
			const needsText = i < 2;
			b.disabled = this.busy || (needsText && !hasText);
		});
		this.body.toggleClass('is-busy', this.busy);
	}

	private setBusy(v: boolean): void {
		this.busy = v;
		this.syncButtons();
	}

	private deps(payees: string[]): InterpretDeps {
		return {
			client: this.plugin.client,
			ollama: new OllamaClient(() => this.plugin.settings),
			payees,
			cfg: this.plugin.domainConfig,
		};
	}

	private async parse(useAi: boolean): Promise<void> {
		const text = this.textarea.value;
		if (!text.trim() || this.busy) return;
		this.setBusy(true);
		try {
			const { payees } = await this.plugin.store.getLedgerMeta();
			const draft = await interpretText(text, { useAi, kind: this.opts.kind() }, this.deps(payees));
			this.opts.onParsed(draft);
			new Notice('Draft filled from text');
		} catch (e) {
			new Notice(e instanceof Error ? e.message : 'Parse failed');
		} finally {
			this.setBusy(false);
		}
	}

	private async parseImage(file: File | Blob): Promise<void> {
		if (this.busy) return;
		this.setBusy(true);
		try {
			const [b64, { payees }] = await Promise.all([
				fileToBase64Jpeg(file),
				this.plugin.store.getLedgerMeta(),
			]);
			const draft = await interpretImage(b64, this.opts.kind(), this.deps(payees));
			this.opts.onParsed(draft);
			new Notice('Draft filled from screenshot');
		} catch (e) {
			new Notice(e instanceof Error ? e.message : 'Screenshot parse failed');
		} finally {
			this.setBusy(false);
			if (this.fileInput) this.fileInput.value = '';
		}
	}
}
