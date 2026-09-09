// Plugin entry point: lifecycle wiring only. Feature logic lives in modules.

import { Plugin, type WorkspaceLeaf } from 'obsidian';
import { registerCommands, registerRibbon } from './commands';
import { DataStore } from './data/store';
import { DEFAULT_DOMAIN_CONFIG, resolveDomainConfig, type DomainConfig } from './lib/config';
import { FavaClient } from './lib/fava-client';
import { makeFavaLinks, type FavaLinks } from './lib/fava-links';
import { DEFAULT_SETTINGS, MIN_CACHE_TTL_SECONDS, type FavaSettings } from './settings';
import { registerFavaCodeBlock } from './ui/code-block';
import { FavaDashboardView, VIEW_TYPE_FAVA_DASHBOARD } from './ui/dashboard-view';
import { registerFavaInline } from './ui/inline-processor';
import { QuickEntryModal } from './ui/quick-entry-modal';
import { FavaSettingTab } from './ui/settings-tab';

export default class FavaClientPlugin extends Plugin {
	settings: FavaSettings = { ...DEFAULT_SETTINGS };
	domainConfig: DomainConfig = DEFAULT_DOMAIN_CONFIG;
	client!: FavaClient;
	store!: DataStore;

	get links(): FavaLinks {
		return makeFavaLinks(this.settings.publicUrl || this.settings.favaUrl, this.domainConfig);
	}

	get aiEnabled(): boolean {
		return this.settings.ollamaUrl.trim() !== '';
	}

	async onload(): Promise<void> {
		await this.loadSettings();
		this.client = new FavaClient(() => this.settings.favaUrl);
		this.store = new DataStore(this.client, {
			cfg: () => this.domainConfig,
			ttlMs: () => this.settings.cacheTtlSeconds * 1000,
		});

		this.registerView(VIEW_TYPE_FAVA_DASHBOARD, (leaf) => new FavaDashboardView(leaf, this));
		registerFavaCodeBlock(this);
		registerFavaInline(this);
		registerCommands(this);
		registerRibbon(this);
		this.addSettingTab(new FavaSettingTab(this.app, this));
	}

	onunload(): void {
		// Views, processors and events are cleaned up by the register* helpers.
	}

	async loadSettings(): Promise<void> {
		const data = (await this.loadData()) as Partial<FavaSettings> | null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data ?? {});
		// A full load takes Fava 10–20 s; never let the TTL undercut that.
		this.settings.cacheTtlSeconds = Math.max(MIN_CACHE_TTL_SECONDS, this.settings.cacheTtlSeconds);
		this.domainConfig = resolveDomainConfig(this.settings.advancedConfigJson);
	}

	/**
	 * Persist settings. Pass `invalidate` when the change affects fetched data
	 * (URL, TTL, domain config); otherwise consumers just re-render.
	 */
	async saveSettings(opts: { invalidate?: boolean } = {}): Promise<void> {
		await this.saveData(this.settings);
		this.domainConfig = resolveDomainConfig(this.settings.advancedConfigJson);
		if (opts.invalidate) this.store.invalidate();
		else this.store.notify();
	}

	async activateDashboard(): Promise<void> {
		const { workspace } = this.app;
		let leaf: WorkspaceLeaf | null = workspace.getLeavesOfType(VIEW_TYPE_FAVA_DASHBOARD)[0] ?? null;
		if (!leaf) {
			leaf = workspace.getLeaf(false);
			await leaf.setViewState({ type: VIEW_TYPE_FAVA_DASHBOARD, active: true });
		}
		await workspace.revealLeaf(leaf);
	}

	openQuickEntry(): void {
		new QuickEntryModal(this).open();
	}
}
