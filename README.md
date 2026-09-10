# Fava client for Obsidian

A dashboard, embeddable cards and quick entry for a [Fava](https://beancount.github.io/fava/) (Beancount) ledger server, inside Obsidian. Works on desktop, tablet and phone.

It is a port of a personal Next.js dashboard: the same metrics (net worth, survival runway, burn, breakeven, recurring charges, savings envelopes…) rendered as native Obsidian views with no React, no chart library and no runtime dependencies.

## What you get

- **Dashboard** (ribbon icon or `Open dashboard`): one scrollable page of collapsible sections — Health, Personal, Business, Net worth & runway, Fixed commitments. Cards show one number plus a line of context; tap a card to expand the detail. The grid goes 1 → 2 → 3 columns with the pane width.
- **Cards in notes**: a fenced `fava` code block renders any dashboard card inside a note.
- **Inline values**: `` `fava:net-worth` `` in running text renders the live number.
- **Quick entry** (`Add entry`): payee/account autocomplete, split tender, refund and uncertain flags, duplicate warning, exact-alignment preview, appended to the current year's ledger file through Fava's source API.
- **Interpreter**: paste an alert email or receipt to prefill the form heuristically. With an optional local Ollama server you also get AI parse and screenshot import.

## Requirements

- A running Fava instance reachable from the device. **Fava has no authentication** — keep it on your LAN or behind a VPN. The plugin talks only to the Fava URL (and, if configured, the Ollama URL) you enter in settings. Nothing else leaves the device.
- Obsidian 1.7.2 or newer.

## Settings

| Setting | Meaning |
|---|---|
| Fava URL | Base URL including the ledger slug, e.g. `http://192.168.1.8:5051/quinns-beans` |
| Public URL | Optional browser-facing URL for "Open in Fava" links |
| Cache lifetime | Seconds before the dashboard refetches on its own (manual refresh any time) |
| Hours worked per week | Drives the hours-to-buy card |
| Ollama URL / models | Optional; enables AI parse and screenshot import |
| Domain config override | JSON overriding account names, thresholds, envelopes, survival-mode rules and interpreter mappings. Objects merge, arrays replace. Use the reset button to see the full default shape. |

## Cards

````markdown
```fava
card: envelope
label: Home Downpayment
```
````

| Card | Options |
|---|---|
| `metric` | `key` (dotted path, e.g. `personal.liquid`), `label`, `format`, `status`, `detail` |
| `net-worth` | `sparkline` (true), `months` (24) |
| `runway`, `surplus`, `business-cash`, `business-net`, `verdict`, `envelopes`, `composition`, `liabilities-band`, `survival-opex` | — |
| `breakeven` | `organic` (true) |
| `trend` | `side` personal \| business |
| `burn` | `mode` all-in \| lifestyle \| both, `categories` (true) |
| `envelope` | `label` or `account` |
| `recurring` | `side` personal \| business \| both, `kind` expense \| income \| all, `limit`, `collapsed` |
| `upcoming` | `side`, `forecast` (true) |
| `spend-ring` | `view` general \| specific, `toggle` (true) |
| `category-bars` | `lifestyle`, `perDay` (true), `limit` |
| `category-pace` | `limit` (8) |
| `monthly-bars` | `side`, `months` (12) |
| `qtd` | `side` personal \| business \| both |
| `hours-to-buy` | `price`, `mode` money \| time |

The `Insert card` command pastes a block with the options commented.

## Inline values

`` `fava:<alias>` `` or `` `fava:<alias>|<format>` ``. Aliases: `net-worth`, `net-worth.3mo`, `net-worth.6mo`, `runway`, `runway.biz`, `runway.personal`, `personal-runway`, `surplus`, `savings-rate`, `income`, `spend`, `burn`, `burn.lifestyle`, `liquid`, `efund`, `biz-cash`, `days-of-cash`, `breakeven`, `revenue`, `opex`, `biz-net`, `hard-liabilities`, `outstanding`, `organic-floor`, `fixed.personal`, `fixed.business`, `upcoming.net30`, `forecast.30d`, `last-entry-days`, `envelope.<label-slug>[.balance|.target|.pct|.delta]` (e.g. `envelope.home-downpayment.pct`), `status.<key>`, or any dotted metrics path such as `personal.monthlySpend`. Formats: `money`, `signed`, `compact`, `pct`, `months`, `days`, `ratio`, `int`, `perMonth`, `perDay`.

The `Insert or copy inline value` command lists them.

## Deep links

`obsidian://fava-entry?…` opens the add-entry form prefilled for review. Parameters (URL-encoded): `amount`, `payee`, `narration`, `date` (YYYY-MM-DD), `funding` (paid-with account), `category`, `refund=1`, `uncertain=1`, and `text` (raw email or receipt text run through the interpreter; explicit fields win). Example:

```
obsidian://fava-entry?amount=12.50&payee=Albertsons&narration=Strawberries%20and%20bread&funding=Liabilities:Personal:AmEx:Blue
```

From an iOS Shortcut: build the URL with "URL Encode" on each value, then "Open URLs".

## Development

```bash
npm install
npm run dev          # watch build → main.js
npm run build        # typecheck + minified build
npm run lint
```

Load into a vault by symlinking the repo into `<vault>/.obsidian/plugins/fava-client`, or set `OBSIDIAN_VAULT=/path/to/vault` (env or `.env`) and run `npm run copy-to-vault` after each build. Enable the plugin under **Settings → Community plugins**.

Domain constants live in `src/lib/config.ts` and mirror the ledger repo's `healthcheck.py`; keep them in sync.
