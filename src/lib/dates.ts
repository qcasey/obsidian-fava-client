// Date helpers matching healthcheck.py's semantics (day-precision windows).

export const DAYS_PER_MONTH = 30.44;

export function todayISO(): string {
	return toISO(new Date());
}

export function toISO(d: Date): string {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return `${y}-${m}-${day}`;
}

export function fromISO(iso: string): Date {
	const [y = 0, m = 1, d = 1] = iso.split('-').map(Number);
	return new Date(y, m - 1, d);
}

/** Port of LedgerData.months_ago: subtract n months, clamp day to month length. */
export function monthsAgo(n: number, from?: Date): string {
	const base = from ?? new Date();
	let month = base.getMonth() + 1 - n;
	let year = base.getFullYear();
	while (month <= 0) {
		month += 12;
		year -= 1;
	}
	const daysInMonth = new Date(year, month, 0).getDate();
	const day = Math.min(base.getDate(), daysInMonth);
	return toISO(new Date(year, month - 1, day));
}

export function daysBetween(sinceISO: string, untilISO: string): number {
	return Math.round(
		(fromISO(untilISO).getTime() - fromISO(sinceISO).getTime()) / 86400000,
	);
}

/** max(1, days/30.44) — the trailing-window month normalizer. */
export function monthsElapsed(sinceISO: string, untilISO?: string): number {
	return Math.max(1, daysBetween(sinceISO, untilISO ?? todayISO()) / DAYS_PER_MONTH);
}

/** Monday of the week containing the given date (ISO). */
export function weekStartISO(iso: string): string {
	const d = fromISO(iso);
	d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
	return toISO(d);
}

export function addDays(iso: string, days: number): string {
	const d = fromISO(iso);
	d.setDate(d.getDate() + days);
	return toISO(d);
}

/** Current month boundaries + progress (for month-to-date pacing). */
export function monthInfo(now?: Date) {
	const d = now ?? new Date();
	const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
	return {
		monthStart: toISO(new Date(d.getFullYear(), d.getMonth(), 1)),
		dayOfMonth: d.getDate(),
		daysInMonth,
		pctThrough: d.getDate() / daysInMonth,
	};
}

/** Current quarter boundaries + progress. */
export function quarterInfo(now?: Date) {
	const d = now ?? new Date();
	const qMonth = Math.floor(d.getMonth() / 3) * 3; // 0-indexed
	const qNum = Math.floor(d.getMonth() / 3) + 1;
	const qStart = new Date(d.getFullYear(), qMonth, 1);
	const qEnd =
		qNum === 4
			? new Date(d.getFullYear(), 11, 31)
			: new Date(d.getFullYear(), qMonth + 3, 0);
	const daysInQuarter = Math.round((qEnd.getTime() - qStart.getTime()) / 86400000) + 1;
	const dayOfQuarter = Math.round((d.getTime() - qStart.getTime()) / 86400000) + 1;
	return {
		qNum,
		qStart: toISO(qStart),
		daysInQuarter,
		dayOfQuarter,
		pctThrough: dayOfQuarter / daysInQuarter,
	};
}

/** "3 minutes ago"-style relative label for timestamps. */
export function fmtAgo(ms: number, now = Date.now()): string {
	const s = Math.max(0, Math.round((now - ms) / 1000));
	if (s < 45) return 'just now';
	const m = Math.round(s / 60);
	if (m < 60) return `${m}m ago`;
	const h = Math.round(m / 60);
	if (h < 24) return `${h}h ago`;
	return `${Math.round(h / 24)}d ago`;
}
