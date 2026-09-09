// Copy the built plugin into a vault. Reads OBSIDIAN_VAULT from the
// environment or a git-ignored .env (KEY=VALUE lines). No dependencies.
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

function loadEnv() {
	if (process.env.OBSIDIAN_VAULT) return process.env.OBSIDIAN_VAULT;
	if (!existsSync('.env')) return undefined;
	for (const line of readFileSync('.env', 'utf8').split('\n')) {
		const m = /^\s*OBSIDIAN_VAULT\s*=\s*(.+?)\s*$/.exec(line);
		if (m) return m[1].replace(/^["']|["']$/g, '');
	}
	return undefined;
}

const vault = loadEnv();
if (!vault) {
	console.error('Set OBSIDIAN_VAULT (env or .env) to your vault path.');
	process.exit(1);
}
const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
const dest = join(resolve(vault), '.obsidian', 'plugins', manifest.id);
mkdirSync(dest, { recursive: true });
for (const f of ['main.js', 'manifest.json', 'styles.css']) {
	if (!existsSync(f)) {
		console.error(`${f} missing — run npm run build first.`);
		process.exit(1);
	}
	copyFileSync(f, join(dest, f));
}
console.log(`Copied to ${dest}`);
