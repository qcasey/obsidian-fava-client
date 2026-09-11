// Quick entry: add a transaction to the ledger through fava's source API.
// Full-screen on mobile automatically (Obsidian modals).

import { Component, Modal, Notice, Platform, Setting, debounce, setIcon, type ToggleComponent } from 'obsidian';
import {
	buildAutocomplete,
	duplicateCheck,
	payeePrefill,
	submitEntry,
	validateDraft,
	type Autocomplete,
	type DupMatch,
} from '../lib/entry-service';
import { formatEntry } from '../lib/format-entry';
import { interpretText } from '../lib/interpret';
import { OllamaClient } from '../lib/ollama';
import { todayISO } from '../lib/dates';
import type { QuickEntryPrefill } from '../cards/types';
import type FavaClientPlugin from '../main';
import type { Confidence, EntryDraft, ParsedDraft, Side } from '../types';
import { InterpreterPanel } from './interpreter-panel';
import {
	AccountSuggest,
	PayeeSuggest,
	clearConfidence,
	setConfidence,
	textField,
	type FieldHandle,
} from './quick-entry-fields';

type FieldName = 'date' | 'amount' | 'payee' | 'narration' | 'funding' | 'category';

export class QuickEntryModal extends Modal {
	private kind: Side = 'personal';
	private refund = false;
	private uncertain = false;
	private showSplit = false;
	private busy = false;
	private dups: DupMatch[] = [];
	private ac: Autocomplete | null = null;
	private accounts: string[] = [];

	private fields!: Record<FieldName, FieldHandle>;
	private splitRow!: HTMLElement;
	private splitFunding!: HTMLInputElement;
	private splitAmount!: HTMLInputElement;
	private splitLink!: HTMLButtonElement;
	private kindNote!: HTMLElement;
	private dupBox!: HTMLElement;
	private previewBox!: HTMLElement;
	private previewPre!: HTMLElement;
	private previewOpen = false;
	private submitBtn!: HTMLButtonElement;
	private refundToggle: ToggleComponent | null = null;
	private uncertainToggle: ToggleComponent | null = null;

	private readonly runDupCheck = debounce(() => void this.checkDuplicates(), 300, true);
	/** Owns DOM listeners so they die with the modal (Modal itself isn't a Component). */
	private readonly owner = new Component();

	constructor(
		private readonly plugin: FavaClientPlugin,
		private readonly initial: QuickEntryPrefill = {},
	) {
		super(plugin.app);
	}

	onOpen(): void {
		this.owner.load();
		this.setTitle('Add entry');
		this.modalEl.addClass('fava-entry-modal');
		const root = this.contentEl;
		root.empty();
		root.addClass('fava-entry');

		new InterpreterPanel(this.plugin, root, {
			kind: () => this.kind,
			onParsed: (d) => this.applyParsed(d),
			component: this.owner,
		});

		const dateAmount = root.createDiv({ cls: 'fava-field-row' });
		const date = textField(dateAmount, 'Date', { type: 'date' });
		date.input.value = todayISO();
		const amount = textField(dateAmount, 'Amount', {
			placeholder: '0.00',
			inputmode: 'decimal',
			cls: 'fava-field--amount',
		});

		const payee = textField(root, 'Payee', { placeholder: 'Albertsons' });
		new PayeeSuggest(
			this.app,
			payee.input,
			() => this.ac?.payees ?? [],
			(v) => void this.onPayeePicked(v),
		);

		const narration = textField(root, 'Narration', { placeholder: 'Strawberries and bread' });

		const funding = textField(root, 'Paid with', { placeholder: 'Liabilities:Personal:AmEx:Blue' });
		new AccountSuggest(
			this.app,
			funding.input,
			() => this.fundingOptions(),
			() => {
				this.runDupCheck();
				this.sync();
			},
		);

		this.buildSplit(root);

		const category = textField(root, 'Category', { placeholder: 'Expense / income account' });
		new AccountSuggest(this.app, category.input, () => this.categoryOptions(), () => this.sync());

		this.fields = { date, amount, payee, narration, funding, category };

		const toggles = root.createDiv({ cls: 'fava-entry__toggles' });
		new Setting(toggles)
			.setName('Refund')
			.addToggle((t) => {
				this.refundToggle = t;
				t.setValue(this.refund).onChange((v) => {
					this.refund = v;
					this.sync();
				});
			});
		new Setting(toggles)
			.setName('Uncertain')
			.addToggle((t) => {
				this.uncertainToggle = t;
				t.setValue(this.uncertain).onChange((v) => {
					this.uncertain = v;
					this.sync();
				});
			});

		this.dupBox = root.createDiv({ cls: 'fava-alert' });
		this.dupBox.hidden = true;

		this.buildPreview(root);

		this.submitBtn = root.createEl('button', {
			cls: 'mod-cta fava-entry__submit',
			text: 'Add entry',
			attr: { type: 'button' },
		});
		this.owner.registerDomEvent(this.submitBtn, 'click', () => void this.submit());

		// Field wiring: any typing clears the confidence ring and re-syncs.
		for (const [name, f] of Object.entries(this.fields) as [FieldName, FieldHandle][]) {
			this.owner.registerDomEvent(f.input, 'input', () => {
				clearConfidence(f.wrapper);
				this.sync();
			});
			if (name === 'date' || name === 'amount' || name === 'funding') {
				this.owner.registerDomEvent(f.input, 'change', () => this.runDupCheck());
				this.owner.registerDomEvent(f.input, 'blur', () => this.runDupCheck());
			}
		}
		this.owner.registerDomEvent(this.fields.payee.input, 'change', () => {
			void this.onPayeePicked(this.fields.payee.input.value);
		});
		this.owner.registerDomEvent(this.splitFunding, 'input', () => this.sync());
		this.owner.registerDomEvent(this.splitAmount, 'input', () => this.sync());

		if (Platform.isMobile) {
			this.owner.registerDomEvent(root, 'focusin', (evt) => {
				const target = evt.target;
				if (!(target instanceof HTMLElement)) return;
				// Wait for the keyboard animation, then bring the field into view.
				window.setTimeout(() => target.scrollIntoView({ block: 'center' }), 300);
			});
		}

		this.applyPrefill();
		this.sync();
		void this.loadAutocomplete();
	}

	/** Fill whatever a deep link or card handed us, then focus the first gap. */
	private applyPrefill(): void {
		const p = this.initial;
		const f = this.fields;
		if (p.amount) f.amount.input.value = p.amount;
		if (p.payee) f.payee.input.value = p.payee;
		if (p.narration) f.narration.input.value = p.narration;
		if (p.date && /^\d{4}-\d{2}-\d{2}$/.test(p.date)) f.date.input.value = p.date;
		if (p.funding) f.funding.input.value = p.funding;
		if (p.category) f.category.input.value = p.category;
		if (p.refund !== undefined) {
			this.refund = p.refund;
			this.refundToggle?.setValue(p.refund);
		}
		if (p.uncertain !== undefined) {
			this.uncertain = p.uncertain;
			this.uncertainToggle?.setValue(p.uncertain);
		}
		if (p.funding || p.amount) this.runDupCheck();
		if (Object.keys(p).length > 0) this.focusFirstGap();
	}

	private focusFirstGap(): void {
		const order: FieldName[] = ['payee', 'amount', 'funding', 'category'];
		const target = order.find((n) => !this.fields[n].input.value.trim());
		window.setTimeout(() => (target ? this.fields[target].input : this.submitBtn).focus(), 0);
	}

	/** Deep-link `text`: run the heuristic interpreter, but explicit fields win. */
	private async applyPrefillText(payees: string[]): Promise<void> {
		const text = this.initial.text?.trim();
		if (!text) return;
		try {
			const draft = await interpretText(
				text,
				{ useAi: false, kind: this.kind },
				{ client: this.plugin.client, ollama: new OllamaClient(() => this.plugin.settings), payees, cfg: this.plugin.domainConfig },
			);
			const explicit = this.initial;
			if (explicit.payee) delete draft.payee;
			if (explicit.amount) delete draft.amount;
			if (explicit.date) delete draft.date;
			if (explicit.narration) delete draft.narration;
			if (explicit.funding) delete draft.fundingAccount;
			if (explicit.category) delete draft.categoryAccount;
			if (explicit.refund !== undefined) delete draft.refund;
			this.applyParsed(draft);
			this.focusFirstGap();
		} catch {
			/* best effort */
		}
	}

	onClose(): void {
		this.owner.unload();
		this.contentEl.empty();
	}

	// ── Layout pieces ──

	private buildSplit(root: HTMLElement): void {
		// One centred row between "Paid with" and "Category": split link + swap.
		const between = root.createDiv({ cls: 'fava-entry__between' });
		this.splitLink = between.createEl('button', {
			cls: 'fava-entry__split-link',
			attr: { type: 'button' },
		});
		const plus = this.splitLink.createSpan({ cls: 'fava-entry__split-icon' });
		setIcon(plus, 'plus');
		this.splitLink.createSpan({ text: 'Split' });
		this.owner.registerDomEvent(this.splitLink, 'click', () => this.setSplit(true));

		const swap = between.createEl('button', {
			cls: 'fava-entry__split-link fava-entry__swap',
			attr: { type: 'button', 'aria-label': 'Swap paid with and category' },
		});
		const swapIcon = swap.createSpan({ cls: 'fava-entry__split-icon' });
		setIcon(swapIcon, 'arrow-up-down');
		swap.createSpan({ text: 'Swap' });
		this.owner.registerDomEvent(swap, 'click', () => {
			const f = this.fields.funding.input;
			const c = this.fields.category.input;
			[f.value, c.value] = [c.value, f.value];
			clearConfidence(this.fields.funding.wrapper);
			clearConfidence(this.fields.category.wrapper);
			this.runDupCheck();
			this.sync();
		});

		this.splitRow = root.createDiv({ cls: 'fava-split-row' });
		this.splitRow.hidden = true;
		const acct = textField(this.splitRow, 'Split — also paid with', {
			placeholder: 'Second account',
		});
		this.splitFunding = acct.input;
		new AccountSuggest(this.app, acct.input, () => this.fundingOptions(), () => this.sync());
		const amt = textField(this.splitRow, 'Amount', {
			placeholder: '0.00',
			inputmode: 'decimal',
			cls: 'fava-field--amount',
		});
		this.splitAmount = amt.input;
		const remove = this.splitRow.createEl('button', {
			cls: 'fava-split-row__remove clickable-icon',
			attr: { type: 'button', 'aria-label': 'Remove split' },
		});
		setIcon(remove, 'x');
		this.owner.registerDomEvent(remove, 'click', () => this.setSplit(false));
	}

	private setSplit(on: boolean): void {
		this.showSplit = on;
		this.splitRow.hidden = !on;
		this.splitLink.hidden = on;
		if (!on) {
			this.splitFunding.value = '';
			this.splitAmount.value = '';
		} else {
			this.splitFunding.focus();
		}
		this.sync();
	}

	private buildPreview(root: HTMLElement): void {
		this.previewBox = root.createDiv({ cls: 'fava-preview-box' });
		const header = this.previewBox.createEl('button', {
			cls: 'fava-preview-box__header',
			attr: { type: 'button', 'aria-expanded': 'false' },
		});
		header.createSpan({ text: 'Entry preview' });
		this.kindNote = header.createSpan({ cls: 'fava-preview-box__kind' });
		const chev = header.createSpan({ cls: 'fava-preview-box__chevron' });
		setIcon(chev, 'chevrons-up-down');
		this.previewPre = this.previewBox.createEl('pre', { cls: 'fava-preview' });
		this.previewPre.hidden = true;
		this.owner.registerDomEvent(header, 'click', () => {
			this.previewOpen = !this.previewOpen;
			this.previewPre.hidden = !this.previewOpen;
			header.setAttribute('aria-expanded', String(this.previewOpen));
		});
	}

	// ── Data ──

	private async loadAutocomplete(): Promise<void> {
		try {
			const meta = await this.plugin.store.getLedgerMeta();
			this.ac = buildAutocomplete(meta, this.plugin.domainConfig);
			this.accounts = meta.accounts;
			this.sync();
			await this.applyPrefillText(meta.payees);
			if (this.initial.payee && !this.fields.category.input.value) void this.onPayeePicked(this.initial.payee);
		} catch (e) {
			new Notice(
				`Could not load ledger accounts: ${e instanceof Error ? e.message : String(e)}`,
			);
		}
	}

	/** Matching side listed first; the other side stays selectable below it. */
	private fundingOptions(): string[] {
		const ac = this.ac;
		if (!ac) return [];
		return this.kind === 'personal'
			? [...ac.fundingPersonal, ...ac.fundingBusiness]
			: [...ac.fundingBusiness, ...ac.fundingPersonal];
	}

	private categoryOptions(): string[] {
		const ac = this.ac;
		if (!ac) return [];
		return this.kind === 'personal'
			? [...ac.expensePersonal, ...ac.expenseBusiness]
			: [...ac.expenseBusiness, ...ac.expensePersonal];
	}

	private async onPayeePicked(payee: string): Promise<void> {
		clearConfidence(this.fields.payee.wrapper);
		this.sync();
		if (!payee.trim()) return;
		try {
			const p = await payeePrefill(this.plugin.client, payee, this.kind, this.plugin.domainConfig);
			if (p.categoryAccount && !this.fields.category.input.value) {
				this.fields.category.input.value = p.categoryAccount;
			}
			if (p.fundingAccount && !this.fields.funding.input.value) {
				this.fields.funding.input.value = p.fundingAccount;
				this.runDupCheck();
			}
			this.sync();
		} catch {
			/* suggestions are best-effort */
		}
	}

	private async checkDuplicates(): Promise<void> {
		const funding = this.fields.funding.input.value;
		const amount = this.fields.amount.input.value;
		const date = this.fields.date.input.value;
		if (!funding || !amount || !date) {
			this.dups = [];
			this.renderDups();
			return;
		}
		this.dups = await duplicateCheck(this.plugin.client, funding, amount, date);
		this.renderDups();
	}

	private renderDups(): void {
		this.dupBox.empty();
		if (this.dups.length === 0) {
			this.dupBox.hidden = true;
			return;
		}
		this.dupBox.hidden = false;
		const title = this.dupBox.createDiv({ cls: 'fava-alert__title' });
		const icon = title.createSpan({ cls: 'fava-alert__icon' });
		setIcon(icon, 'alert-triangle');
		title.createSpan({ text: 'Possible duplicate' });
		for (const d of this.dups.slice(0, 3)) {
			this.dupBox.createDiv({
				cls: 'fava-alert__line',
				text: `${d.date} — ${d.payee}${d.narration ? ` “${d.narration}”` : ''}`,
			});
		}
	}

	private applyParsed(d: ParsedDraft): void {
		const set = (name: FieldName, value: string | undefined, conf: Confidence | undefined) => {
			if (value === undefined) return;
			this.fields[name].input.value = value;
			setConfidence(this.fields[name].wrapper, conf ?? null);
		};
		set('payee', d.payee?.value, d.payee?.confidence);
		set('amount', d.amount?.value, d.amount?.confidence);
		set('date', d.date?.value, d.date?.confidence);
		set('narration', d.narration?.value, d.narration?.confidence);
		set('funding', d.fundingAccount?.value, d.fundingAccount?.confidence);
		set('category', d.categoryAccount?.value, d.categoryAccount?.confidence);
		if (d.refund) {
			this.refund = d.refund.value;
			this.refundToggle?.setValue(this.refund);
		}
		this.runDupCheck();
		this.sync();
	}

	// ── Draft / preview / submit ──

	private draft(): EntryDraft {
		const f = this.fields;
		const fundings = [];
		if (f.funding.input.value && f.amount.input.value) {
			fundings.push({ account: f.funding.input.value, amount: f.amount.input.value });
		}
		if (this.showSplit && this.splitFunding.value && this.splitAmount.value) {
			fundings.push({ account: this.splitFunding.value, amount: this.splitAmount.value });
		}
		return {
			kind: this.kind,
			date: f.date.input.value,
			flag: this.uncertain ? '!' : '*',
			payee: f.payee.input.value,
			narration: f.narration.input.value,
			refund: this.refund,
			fundings,
			category: f.category.input.value,
		};
	}

	private isComplete(d: EntryDraft): boolean {
		return d.fundings.length > 0 && !!(d.payee.trim() || d.narration.trim()) && !!d.category.trim() && !!d.date;
	}

	/**
	 * Personal vs business is decided by the account the money came from; a
	 * business card means the business ledger. Falls back to the category.
	 */
	private inferKind(): Side {
		const a = this.plugin.domainConfig.accounts;
		const bizToken = `:${a.businessExpense.split(':')[1] ?? 'PhotoPanda'}:`;
		const persToken = `:${a.personalExpense.split(':')[1] ?? 'Personal'}:`;
		const sideOf = (acct: string): Side | null =>
			acct.includes(bizToken) ? 'business' : acct.includes(persToken) ? 'personal' : null;
		return (
			sideOf(this.fields.funding.input.value) ??
			sideOf(this.showSplit ? this.splitFunding.value : '') ??
			sideOf(this.fields.category.input.value) ??
			'personal'
		);
	}

	private sync(): void {
		this.kind = this.inferKind();
		this.kindNote.setText(`${this.kind} ledger`);
		const d = this.draft();
		const complete = this.isComplete(d);
		let preview = '';
		if (complete) {
			try {
				preview = formatEntry(d, this.plugin.domainConfig.entryLineWidth[d.kind]);
			} catch {
				preview = '';
			}
		}
		this.previewBox.hidden = !preview;
		this.previewPre.setText(preview || '…');
		this.submitBtn.disabled = !complete || this.busy;
		this.submitBtn.toggleClass('is-busy', this.busy);
	}

	private async submit(): Promise<void> {
		const d = this.draft();
		if (!this.isComplete(d) || this.busy) return;
		const err = validateDraft(d, this.accounts);
		if (err) {
			new Notice(err);
			return;
		}
		this.busy = true;
		this.sync();
		try {
			await submitEntry(this.plugin.client, this.plugin.store, this.plugin.domainConfig, d);
			const total = d.fundings.reduce((s, f) => s + (parseFloat(f.amount) || 0), 0);
			new Notice(`Added $${total.toFixed(2)} — ${d.payee}`);
			this.close();
		} catch (e) {
			new Notice(e instanceof Error ? e.message : 'Failed to add entry');
		} finally {
			this.busy = false;
			if (this.contentEl.isConnected) this.sync();
		}
	}
}
