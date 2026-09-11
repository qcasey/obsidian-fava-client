// Plugin settings: persisted with loadData/saveData. No UI here.

export interface FavaSettings {
	/** Fava base URL including the ledger slug, e.g. http://192.168.1.8:5051/quinns-beans */
	favaUrl: string;
	/** Browser-facing URL for deep links; falls back to favaUrl */
	publicUrl: string;
	/** How long a loaded snapshot stays fresh */
	cacheTtlSeconds: number;
	/** Hours worked per week — the one number the ledger can't know */
	hoursPerWeek: number;
	/** Empty string disables every AI feature */
	ollamaUrl: string;
	ollamaTextModel: string;
	ollamaVisionModel: string;
	/** JSON overriding any part of DEFAULT_DOMAIN_CONFIG; empty = defaults */
	advancedConfigJson: string;
	collapsedSections: Record<string, boolean>;
	/** Remembered card switch positions, e.g. the 3/6/12 month window */
	cardChoices: Record<string, string>;
	quickEntryRibbon: boolean;
}

export const DEFAULT_SETTINGS: FavaSettings = {
	favaUrl: '',
	publicUrl: '',
	cacheTtlSeconds: 300,
	hoursPerWeek: 40,
	ollamaUrl: '',
	ollamaTextModel: 'gpt-oss:20b',
	ollamaVisionModel: 'qwen3-vl',
	advancedConfigJson: '',
	collapsedSections: {},
	cardChoices: {},
	quickEntryRibbon: true,
};

export const MIN_CACHE_TTL_SECONDS = 60;
export const MIN_HOURS = 10;
export const MAX_HOURS = 80;
export const WEEKS_PER_MONTH = 52 / 12;
