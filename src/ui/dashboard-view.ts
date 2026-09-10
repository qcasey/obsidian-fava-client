// The dashboard: one scrollable page of collapsible sections.

import { ItemView, setIcon, type WorkspaceLeaf } from 'obsidian';
import { coerceParams, getCard, renderCard } from '../cards/registry';
import { SetCardUi, type CardContext } from '../cards/types';
import { fmtAgo } from '../lib/dates';
import { FavaError } from '../lib/fava-client';
import type FavaClientPlugin from '../main';
import type { Snapshot } from '../types';
import { attachFavaMenu } from './context-menu';
import { SECTIONS, type SectionDef } from './dashboard-sections';
import { applyMasonry, iconButton, preserveInputs, skeletonCard } from './dom';

export const VIEW_TYPE_FAVA_DASHBOARD = 'fava-dashboard';

export class FavaDashboardView extends ItemView {
	private readonly ui = new SetCardUi();
	private root!: HTMLElement;
	private tick: number | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		private readonly plugin: FavaClientPlugin,
	) {
		super(leaf);
		this.navigation = false;
	}

	getViewType(): string {
		return VIEW_TYPE_FAVA_DASHBOARD;
	}

	getDisplayText(): string {
		return 'Fava dashboard';
	}

	getIcon(): string {
		return 'piggy-bank';
	}

	onOpen(): Promise<void> {
		this.contentEl.addClass('fava-dashboard');
		this.root = this.contentEl.createDiv({ cls: 'fava-root' });
		this.registerEvent(this.plugin.store.onChange(() => this.render()));
		attachFavaMenu(this.contentEl, this.plugin, this);
		this.tick = this.registerInterval(window.setInterval(() => this.renderUpdated(), 30_000));
		this.render();
		void this.plugin.store.ensure().catch(() => undefined);
		return Promise.resolve();
	}

	onClose(): Promise<void> {
		if (this.tick !== null) window.clearInterval(this.tick);
		return Promise.resolve();
	}

	private render(): void {
		preserveInputs(this.root, () => this.renderInner());
	}

	private renderInner(): void {
		const scroll = this.root.scrollTop;
		this.root.empty();
		const store = this.plugin.store;
		this.renderHeader(store.snapshot);

		if (!store.snapshot) {
			if (store.status === 'loading' || store.status === 'idle') {
				const { done, total } = store.progress;
				this.root.createDiv({
					cls: 'fava-note fava-loading',
					text: done > 0 ? `Loading… ${done} of ${total} queries (Fava answers them one at a time)` : 'Loading…',
				});
				const grid = this.root.createDiv({ cls: 'fava-grid' });
				for (let i = 0; i < 6; i++) skeletonCard(grid);
			} else {
				this.renderError(store.error);
			}
			return;
		}
		if (store.error) {
			const banner = this.root.createDiv({ cls: 'fava-banner is-red' });
			banner.createSpan({ text: `Refresh failed: ${store.error.message}` });
			const retry = banner.createEl('button', { text: 'Retry', cls: 'fava-linkbtn' });
			retry.addEventListener('click', () => void store.refresh().catch(() => undefined));
		}
		this.renderSections(store.snapshot);
		this.root.scrollTop = scroll;
	}

	private renderHeader(snapshot: Snapshot | null): void {
		const store = this.plugin.store;
		const header = this.root.createDiv({ cls: 'fava-header' });
		const left = header.createDiv({ cls: 'fava-header__left' });
		left.createEl('h2', { text: 'Fava', cls: 'fava-header__title' });
		if (snapshot) {
			const days = snapshot.metrics.stalenessDays;
			left.createSpan({
				cls: `fava-badge${days > 3 ? ' is-warn' : ''}`,
				text: days === 0 ? 'Up to date' : `Last entry ${days}d ago`,
			});
			left.createSpan({ cls: 'fava-header__updated', text: `Updated ${fmtAgo(snapshot.loadedAt)}` });
		}
		const right = header.createDiv({ cls: 'fava-header__right' });
		const refresh = iconButton(right, 'refresh-cw', 'Refresh data', () => void store.refresh().catch(() => undefined));
		refresh.toggleClass('is-spinning', store.status === 'loading');
		iconButton(right, 'plus', 'Add entry', () => this.plugin.openQuickEntry());
		if (this.plugin.links.enabled) {
			const a = right.createEl('a', {
				cls: 'fava-iconbtn clickable-icon',
				href: this.plugin.links.netWorth(),
				attr: { target: '_blank', rel: 'noopener', 'aria-label': 'Open Fava' },
			});
			setIcon(a, 'external-link');
		}
	}

	private renderUpdated(): void {
		const el = this.root.querySelector('.fava-header__updated');
		const s = this.plugin.store.snapshot;
		if (el instanceof HTMLElement && s) el.setText(`Updated ${fmtAgo(s.loadedAt)}`);
	}

	private renderError(err: Error | null): void {
		const card = this.root.createDiv({ cls: 'fava-card fava-error' });
		const unreachable = err instanceof FavaError && err.isUnreachable;
		card.createDiv({ cls: 'fava-card__label', text: unreachable ? 'Cannot reach Fava' : 'Something went wrong' });
		card.createDiv({ cls: 'fava-error__msg', text: err?.message ?? 'Unknown error' });
		const row = card.createDiv({ cls: 'fava-error__actions' });
		const retry = row.createEl('button', { text: 'Retry', cls: 'mod-cta' });
		retry.addEventListener('click', () => void this.plugin.store.refresh().catch(() => undefined));
		if (unreachable) {
			const open = row.createEl('button', { text: 'Open settings' });
			open.addEventListener('click', () => {
				const setting = (this.app as unknown as { setting?: { open(): void; openTabById(id: string): void } }).setting;
				setting?.open();
				setting?.openTabById(this.plugin.manifest.id);
			});
		}
	}

	private renderSections(snapshot: Snapshot): void {
		const ctx: CardContext = {
			snapshot,
			cfg: this.plugin.domainConfig,
			settings: this.plugin.settings,
			links: this.plugin.links,
			ui: this.ui,
			component: this,
			keyPrefix: 'dash',
			inDashboard: true,
			updating: this.plugin.store.updating,
			openQuickEntry: (opts) => this.plugin.openQuickEntry(opts),
			setHoursPerWeek: (v) => {
				this.plugin.settings.hoursPerWeek = v;
				void this.plugin.saveSettings();
			},
		};
		for (const section of SECTIONS) {
			if (section.headerless) {
				const sec = this.root.createDiv({ cls: 'fava-section fava-section--overview' });
				const grid = sec.createDiv({ cls: 'fava-grid' });
				this.renderSectionCards(section, grid, ctx);
				continue;
			}
			const collapsed = this.plugin.settings.collapsedSections[section.id] === true;
			const sec = this.root.createDiv({ cls: `fava-section${collapsed ? ' is-collapsed' : ''}` });
			const head = sec.createEl('button', {
				cls: 'fava-section__header',
				attr: { type: 'button', 'aria-expanded': String(!collapsed) },
			});
			const chevron = head.createSpan({ cls: 'fava-section__chevron' });
			setIcon(chevron, 'chevron-down');
			head.createSpan({ cls: 'fava-section__title', text: section.title });
			if (section.summary) head.createSpan({ cls: 'fava-section__summary', text: section.summary(snapshot) });
			const grid = sec.createDiv({ cls: 'fava-grid' });
			grid.hidden = collapsed;
			head.addEventListener('click', () => {
				const now = !sec.hasClass('is-collapsed');
				sec.toggleClass('is-collapsed', now);
				grid.hidden = now;
				head.setAttr('aria-expanded', String(!now));
				this.plugin.settings.collapsedSections[section.id] = now;
				void this.plugin.saveData(this.plugin.settings);
			});
			this.renderSectionCards(section, grid, ctx);
		}
	}

	private renderSectionCards(section: SectionDef, grid: HTMLElement, ctx: CardContext): void {
		section.cards.forEach((c, i) => {
			const def = getCard(c.id);
			if (!def) return;
			const params = coerceParams(def, c.params ?? {});
			if (!params.ok) return;
			renderCard(grid, def, { ...ctx, keyPrefix: `dash:${section.id}:${i}` }, params.params);
		});
		applyMasonry(grid, this);
	}
}
