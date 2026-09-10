// Right-click (desktop) or press-and-hold (touch) anywhere on Fava content
// opens a small menu: refresh, add entry, open in Fava.

import { Menu, type Component } from 'obsidian';
import type FavaClientPlugin from '../main';

const LONG_PRESS_MS = 500;
const MOVE_TOLERANCE_PX = 10;

export function attachFavaMenu(el: HTMLElement, plugin: FavaClientPlugin, component: Component): void {
	const open = (x: number, y: number) => {
		const menu = new Menu();
		menu.addItem((i) =>
			i
				.setTitle(plugin.store.status === 'loading' ? 'Refreshing…' : 'Refresh data')
				.setIcon('refresh-cw')
				.setDisabled(plugin.store.status === 'loading')
				.onClick(() => void plugin.store.refresh().catch(() => undefined)),
		);
		menu.addItem((i) => i.setTitle('Add entry').setIcon('plus').onClick(() => plugin.openQuickEntry()));
		if (plugin.links.enabled) {
			menu.addItem((i) =>
				i
					.setTitle('Open in Fava')
					.setIcon('external-link')
					.onClick(() => window.open(plugin.links.netWorth(), '_blank')),
			);
		}
		menu.showAtPosition({ x, y });
	};

	component.registerDomEvent(el, 'contextmenu', (evt) => {
		if (isInteractive(evt.target)) return;
		evt.preventDefault();
		open(evt.clientX, evt.clientY);
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
		timer = window.setTimeout(() => {
			timer = null;
			if (start) open(start.x, start.y);
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

function isInteractive(target: EventTarget | null): boolean {
	return target instanceof HTMLElement && target.closest('input, textarea, select, a, button, [contenteditable]') !== null;
}
