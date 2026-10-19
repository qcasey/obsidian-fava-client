// Number/date formatting shared by cards and inline values.

export function fmtMoney(n: number): string {
	const abs = Math.abs(n);
	const s =
		abs >= 1000
			? `$${Math.round(abs).toLocaleString('en-US')}`
			: `$${abs.toFixed(abs >= 100 ? 0 : 2)}`;
	return n < 0 ? `-${s}` : s;
}

export function fmtSigned(n: number): string {
	return `${n >= 0 ? '+' : '-'}$${Math.abs(Math.round(n)).toLocaleString('en-US')}`;
}

export function fmtCompact(n: number): string {
	const abs = Math.abs(n);
	const sign = n < 0 ? '-' : '';
	if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(abs >= 10000 ? 0 : 1)}k`;
	return `${sign}$${Math.round(abs)}`;
}

export function fmtPct(n: number, digits = 0): string {
	return `${n.toFixed(digits)}%`;
}

export function fmtSignedPct(n: number, digits = 0): string {
	const r = Number(n.toFixed(digits));
	if (r === 0) return `${(0).toFixed(digits)}%`;
	return `${r > 0 ? '+' : ''}${r.toFixed(digits)}%`;
}

const MONTHS = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ');

/** "2026-03" → "Mar" (or "Mar 26" when crossing years) */
export function fmtMonth(key: string, withYear = false): string {
	const [y = '', m = ''] = key.split('-');
	const name = MONTHS[parseInt(m, 10) - 1] ?? key;
	return withYear ? `${name} ${y.slice(2)}` : name;
}

/** "2026-03-07" → "Mar 7" */
export function fmtDay(iso: string): string {
	const [, m = '', d = ''] = iso.split('-');
	return `${MONTHS[parseInt(m, 10) - 1] ?? m} ${parseInt(d, 10)}`;
}

export function fmtDuration(hoursTotal: number): string {
	if (hoursTotal < 1) return `${Math.round(hoursTotal * 60)} min`;
	if (hoursTotal < 10) return `${hoursTotal.toFixed(1)} h`;
	return `${Math.round(hoursTotal)} h`;
}

const WORKDAYS_PER_WEEK = 5;
const WEEKS_PER_MONTH = 52 / 12;

export function fmtWorkTime(hoursTotal: number, hoursPerWeek: number): string | null {
	const hoursPerDay = hoursPerWeek / WORKDAYS_PER_WEEK;
	if (hoursTotal < hoursPerDay) return null;
	const weeks = hoursTotal / hoursPerWeek;
	if (weeks >= 8) {
		const months = hoursTotal / (hoursPerWeek * WEEKS_PER_MONTH);
		return `≈ ${months.toFixed(1)} months of work`;
	}
	if (weeks >= 1) return `≈ ${weeks.toFixed(1)} weeks of work`;
	const days = hoursTotal / hoursPerDay;
	return `≈ ${days.toFixed(1)} workdays`;
}

export type NumberFormat =
	| 'money'
	| 'signed'
	| 'compact'
	| 'pct'
	| 'signedPct'
	| 'months'
	| 'days'
	| 'ratio'
	| 'int'
	| 'perMonth'
	| 'perDay';

export function fmtBy(format: NumberFormat, n: number): string {
	switch (format) {
		case 'money':
			return fmtMoney(n);
		case 'signed':
			return fmtSigned(n);
		case 'compact':
			return fmtCompact(n);
		case 'pct':
			return fmtPct(n);
		case 'signedPct':
			return fmtSignedPct(n);
		case 'months':
			return `${n.toFixed(1)} mo`;
		case 'days':
			return `${Math.round(n)} days`;
		case 'ratio':
			return `${n.toFixed(1)}x`;
		case 'int':
			return String(Math.round(n));
		case 'perMonth':
			return `${fmtMoney(n)}/mo`;
		case 'perDay':
			return `$${n.toFixed(0)}/day`;
	}
}

/**
 * Money rounded to the precision you would use out loud: "$12k", "$3.4k",
 * "$850". For prose, where an exact figure invites arithmetic.
 */
export function fmtApproxMoney(n: number): string {
	const abs = Math.abs(n);
	const sign = n < 0 ? '-' : '';
	if (abs >= 10000) return `${sign}$${Math.round(abs / 1000)}k`;
	if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(1)}k`;
	if (abs >= 200) return `${sign}$${Math.round(abs / 50) * 50}`;
	return `${sign}$${Math.round(abs / 10) * 10}`;
}

const YEAR_WORDS = ['', 'a year', 'two years', 'three years', 'four years', 'five years'];

/** A span of months as a phrase: "about 7 months", "about two years". */
export function fmtApproxDuration(months: number): string {
	if (!Number.isFinite(months) || months >= 66) return 'well over five years';
	if (months < 1.5) return 'about a month';
	if (months < 18) return `about ${Math.round(months)} months`;
	const years = months / 12;
	const whole = Math.round(years);
	const word = YEAR_WORDS[whole];
	// Only reach for the word when the rounding is not a lie.
	if (word && Math.abs(years - whole) < 0.2) return `about ${word}`;
	return `about ${years.toFixed(1)} years`;
}
