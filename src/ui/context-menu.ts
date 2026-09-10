// Right-click (desktop) or press-and-hold (touch) anywhere on Fava content
// opens a small menu: copy the value under the pointer, or refresh.

import { Menu, Notice, type Component } from 'obsidian';
import type FavaClientPlugin from '../main';

const LONG_PRESS_MS = 500;
const MOVE_TOLERANCE_PX = 10;

export function attachFavaMenu(el: HTMLElement, plugin: FavaClientPlugin, component: Component): void {
	const open = (x: number, y: number, target: EventTarget | null) => {
		const menu = new Menu();
		const text = copyTextFor(target);
		menu.addItem((i) =>
			i
				.setTitle(text ? `Copy ${text.length > 24 ? `${text.slice(0, 24)}…` : text}` : 'Copy')
				.setIcon('copy')
				.setDisabled(!text)
				.onClick(() => {
					if (!text) return;
					void navigator.clipboard.writeText(text).then(
						() => new Notice('Copied'),
						() => new Notice('Could not copy'),
					);
				}),
		);
		menu.addItem((i) =>
			i
				.setTitle(plugin.store.status === 'loading' ? 'Refreshing…' : 'Refresh')
				.setIcon('refresh-cw')
				.setDisabled(plugin.store.status === 'loading')
				.onClick(() => void plugin.store.refresh().catch(() => undefined)),
		);
		menu.showAtPosition({ x, y });
	};

	component.registerDomEvent(el, 'contextmenu', (evt) => {
		if (isInteractive(evt.target)) return;
		evt.preventDefault();
		open(evt.clientX, evt.clientY, evt.target);
	});

	// Press-and-hold for touch. Cancelled by movement (scrolling) or release.
	let timer: number | null = null;
	let start: { x: number; y: number } | null = null;
	const cancel = () => {
		if (timer !== null) window.clearTimeout(timer);
		timer = null;
		start = null;
	};
	component.registerDomEvent(el, 'touchstart', (evt) => {
		if (isInteractive(evt.target) || evt.touches.length !== 1) return;
		const t = evt.touches[0];
		if (!t) return;
		start = { x: t.clientX, y: t.clientY };
		const target = evt.target;
		timer = window.setTimeout(() => {
			timer = null;
			if (start) open(start.x, start.y, target);
			start = null;
		}, LONG_PRESS_MS);
	}, { passive: true });
	component.registerDomEvent(el, 'touchmove', (evt) => {
		const t = evt.touches[0];
		if (!start || !t) return;
		if (Math.abs(t.clientX - start.x) > MOVE_TOLERANCE_PX || Math.abs(t.clientY - start.y) > MOVE_TOLERANCE_PX) cancel();
	}, { passive: true });
	component.registerDomEvent(el, 'touchend', cancel, { passive: true });
	component.registerDomEvent(el, 'touchcancel', cancel, { passive: true });
}

/** The headline value of the card under the pointer, else the card's text. */
function copyTextFor(target: EventTarget | null): string | null {
	if (!(target instanceof HTMLElement)) return null;
	const inline = target.closest('.fava-inline');
	if (inline instanceof HTMLElement) return inline.textContent?.trim() || null;
	const card = target.closest('.fava-card');
	if (!(card instanceof HTMLElement)) return null;
	const value = card.querySelector('.fava-card__value');
	const text = (value?.textContent ?? card.textContent ?? '').replace(/\s+/g, ' ').trim();
	return text || null;
}

function isInteractive(target: EventTarget | null): boolean {
	return target instanceof HTMLElement && target.closest('input, textarea, select, a, button, [contenteditable]') !== null;
}
