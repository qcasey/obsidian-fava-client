// Deep links into fava (browser-facing) — port of healthcheck.py's FAVA_URLS.

import type { DomainConfig } from './config';

export interface FavaLinks {
	enabled: boolean;
	personal: () => string;
	personalTrailing: () => string;
	spendAccount: () => string;
	efund: () => string;
	business: () => string;
	bizCash: () => string;
	bizOpex: () => string;
	outstanding: () => string;
	hardLiab: () => string;
	netWorth: () => string;
	account: (name: string) => string;
}

const F_PERSONAL = `any(account:"(Income|Expenses):Personal.*")`;
const F_BUSINESS = `any(account:"(Income|Expenses):PhotoPanda.*")`;
const F_NOT_BIZ = `-any(account:"(Income|Expenses):PhotoPanda.*")`;
const F_NOT_PERS = `-any(account:"(Income|Expenses):Personal.*")`;

export function makeFavaLinks(publicUrl: string, cfg: DomainConfig): FavaLinks {
	const base = publicUrl.trim().replace(/\/+$/, '');
	const url = (path: string, params: Record<string, string> = {}): string => {
		const qs = new URLSearchParams(params).toString();
		return `${base}/${path}${qs ? `?${qs}` : ''}`;
	};
	const a = cfg.accounts;
	return {
		enabled: base !== '',
		personal: () =>
			url('income_statement/', { filter: `${F_PERSONAL} ${F_NOT_BIZ}`, time: 'quarter' }),
		personalTrailing: () =>
			url('income_statement/', {
				filter: `${F_PERSONAL} ${F_NOT_BIZ}`,
				time: 'month-6 - month',
			}),
		spendAccount: () => url('account/Expenses:Personal/', { time: 'month-6 - month' }),
		efund: () => url(`account/${a.emergencyFund}/`),
		business: () =>
			url('income_statement/', { filter: `${F_BUSINESS} ${F_NOT_PERS}`, time: 'quarter' }),
		bizCash: () => url(`account/${a.bizChecking}/`),
		bizOpex: () =>
			url('income_statement/', {
				filter: `any(account:"${a.businessExpense.replace(/:$/, '')}.*") ${F_NOT_PERS}`,
				time: 'month-6 - month',
			}),
		outstanding: () => url(`account/${a.outstandingLiab}/`),
		hardLiab: () =>
			url(`account/${a.businessLiability.replace(/:$/, '')}`, { time: 'month-3 - month' }),
		netWorth: () => url('balance_sheet/'),
		account: (name: string) => url(`account/${name}/`),
	};
}
