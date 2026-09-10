import { Notice, PluginSettingTab, Setting, type App } from 'obsidian';
import { DEFAULT_DOMAIN_CONFIG, parseDomainOverride } from '../lib/config';
import { DEEPLINK_EXAMPLE, DEEPLINK_PARAMS } from '../lib/deeplink';
import type FavaClientPlugin from '../main';
import { MAX_HOURS, MIN_HOURS } from '../settings';

export class FavaSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private readonly plugin: FavaClientPlugin,
	) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		const s = this.plugin.settings;
		const save = (invalidate = false) => void this.plugin.saveSettings({ invalidate });

		new Setting(containerEl)
			.setName('Fava URL')
			.setDesc('Base URL including the ledger slug, e.g. http://192.168.1.8:5051/quinns-beans. The server root also works; the first ledger is detected. Fava has no auth: keep it on your LAN or VPN.')
			.addText((t) =>
				t
					.setPlaceholder('http://host:5000/ledger')
					.setValue(s.favaUrl)
					.onChange((v) => {
						s.favaUrl = v.trim();
						save(true);
					}),
			)
			.addButton((b) =>
				b.setButtonText('Test').onClick(async () => {
					b.setDisabled(true);
					try {
						const meta = await this.plugin.client.getLedgerData();
						new Notice(`Connected to ${this.plugin.client.resolvedUrl ?? s.favaUrl}: ${meta.accounts.length} accounts, ${meta.payees.length} payees`);
					} catch (e) {
						new Notice(`Connection failed: ${e instanceof Error ? e.message : String(e)}`, 8000);
					} finally {
						b.setDisabled(false);
					}
				}),
			);
		new Setting(containerEl)
			.setName('Public URL')
			.setDesc('Optional browser-facing URL for "Open in Fava" links. Defaults to the Fava URL.')
			.addText((t) =>
				t.setValue(s.publicUrl).onChange((v) => {
					s.publicUrl = v.trim();
					save();
				}),
			);
		new Setting(containerEl)
			.setName('Cache lifetime')
			.setDesc('Seconds before the dashboard fetches fresh numbers on its own. A full load is about 30 queries and takes Fava 10–20 seconds, so keep this generous and refresh manually after adding entries.')
			.addSlider((sl) =>
				sl
					.setLimits(60, 1800, 30)
					.setValue(s.cacheTtlSeconds)
					.setDynamicTooltip()
					.onChange((v) => {
						s.cacheTtlSeconds = v;
						save();
					}),
			);
		new Setting(containerEl)
			.setName('Hours worked per week')
			.setDesc('The one number the ledger cannot know. Drives the hours-to-buy card.')
			.addSlider((sl) =>
				sl
					.setLimits(MIN_HOURS, MAX_HOURS, 1)
					.setValue(s.hoursPerWeek)
					.setDynamicTooltip()
					.onChange((v) => {
						s.hoursPerWeek = v;
						save();
					}),
			);
		new Setting(containerEl)
			.setName('Quick entry ribbon icon')
			.setDesc('Show a second ribbon icon that opens the add-entry form. Takes effect after reload.')
			.addToggle((t) =>
				t.setValue(s.quickEntryRibbon).onChange((v) => {
					s.quickEntryRibbon = v;
					save();
				}),
			);

		new Setting(containerEl).setName('AI interpreter').setHeading();
		new Setting(containerEl)
			.setName('Ollama URL')
			.setDesc('Optional. Enables AI parse and screenshot import in the add-entry form. Pasted text and images are sent to this server only. Leave empty to disable.')
			.addText((t) =>
				t
					.setPlaceholder('http://host:11434')
					.setValue(s.ollamaUrl)
					.onChange((v) => {
						s.ollamaUrl = v.trim().replace(/\/+$/, '');
						save();
					}),
			);
		new Setting(containerEl).setName('Text model').addText((t) =>
			t.setValue(s.ollamaTextModel).onChange((v) => {
				s.ollamaTextModel = v.trim();
				save();
			}),
		);
		new Setting(containerEl).setName('Vision model').addText((t) =>
			t.setValue(s.ollamaVisionModel).onChange((v) => {
				s.ollamaVisionModel = v.trim();
				save();
			}),
		);

		new Setting(containerEl).setName('Deep links').setHeading();
		new Setting(containerEl)
			.setName('Prefill the add-entry form from a URL')
			.setDesc('Open obsidian://fava-entry with any of these query parameters (URL-encoded) to review and add an entry. Works from iOS Shortcuts.');
		const dl = containerEl.createDiv({ cls: 'fava-settings__deeplink' });
		const list = dl.createEl('ul');
		for (const p of DEEPLINK_PARAMS) {
			const li = list.createEl('li');
			li.createEl('code', { text: p.name });
			li.appendText(` — ${p.desc}`);
		}
		dl.createEl('pre', { text: DEEPLINK_EXAMPLE });

		new Setting(containerEl).setName('Advanced config').setHeading();
		const desc = new Setting(containerEl)
			.setName('Domain config override')
			.setDesc('JSON that overrides any part of the built-in account names, thresholds, envelopes and interpreter rules. Objects merge; arrays replace. Empty means defaults.');
		desc.addExtraButton((b) =>
			b
				.setIcon('rotate-ccw')
				.setTooltip('Fill with the full defaults')
				.onClick(() => {
					s.advancedConfigJson = JSON.stringify(DEFAULT_DOMAIN_CONFIG, null, 2);
					save(true);
					this.display();
				}),
		);
		const area = containerEl.createEl('textarea', {
			cls: 'fava-settings__json',
			attr: { rows: '14', spellcheck: 'false', 'aria-label': 'Domain config override JSON' },
		});
		area.value = s.advancedConfigJson;
		const status = containerEl.createDiv({ cls: 'fava-settings__status' });
		const showStatus = () => {
			const r = parseDomainOverride(area.value);
			status.setText(r.ok ? (area.value.trim() ? 'Valid override' : 'Using defaults') : r.error);
			status.toggleClass('is-error', !r.ok);
		};
		showStatus();
		area.addEventListener('input', () => {
			s.advancedConfigJson = area.value;
			showStatus();
		});
		area.addEventListener('blur', () => {
			if (parseDomainOverride(area.value).ok) save(true);
		});
	}
}
