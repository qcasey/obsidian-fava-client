import { Notice } from 'obsidian';
import type FavaClientPlugin from '../main';
import { CopyInlineModal, InsertCardModal } from '../ui/insert-card-modal';

export function registerCommands(plugin: FavaClientPlugin): void {
	plugin.addCommand({
		id: 'open-dashboard',
		name: 'Open dashboard',
		callback: () => void plugin.activateDashboard(),
	});
	plugin.addCommand({
		id: 'refresh-data',
		name: 'Refresh data',
		callback: () => {
			plugin.store
				.refresh()
				.then(() => new Notice('Fava data refreshed'))
				.catch((e: unknown) => new Notice(`Refresh failed: ${e instanceof Error ? e.message : String(e)}`));
		},
	});
	plugin.addCommand({
		id: 'quick-entry',
		name: 'Add entry',
		callback: () => plugin.openQuickEntry(),
	});
	plugin.addCommand({
		id: 'insert-card',
		name: 'Insert card',
		editorCallback: (editor) => new InsertCardModal(plugin.app, editor).open(),
	});
	plugin.addCommand({
		id: 'copy-inline-reference',
		name: 'Insert or copy inline value',
		callback: () => {
			const view = plugin.app.workspace.activeEditor;
			new CopyInlineModal(plugin.app, view?.editor ?? null).open();
		},
	});
}

export function registerRibbon(plugin: FavaClientPlugin): void {
	plugin.addRibbonIcon('piggy-bank', 'Open Fava dashboard', () => void plugin.activateDashboard());
	if (plugin.settings.quickEntryRibbon) {
		plugin.addRibbonIcon('circle-plus', 'Add Fava entry', () => plugin.openQuickEntry());
	}
}
