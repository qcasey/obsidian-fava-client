// Minimal RFC-4180 CSV parser (fava query CSV: quoted fields, commas in
// payees, no embedded newlines expected but handled anyway).

export function parseCsv(text: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let field = '';
	let inQuotes = false;
	let i = 0;
	const push = () => {
		row.push(field);
		field = '';
	};
	const pushRow = () => {
		// Skip completely empty trailing rows
		if (row.length > 1 || row[0] !== '') rows.push(row);
		row = [];
	};
	while (i < text.length) {
		const c = text[i];
		if (inQuotes) {
			if (c === '"') {
				if (text[i + 1] === '"') {
					field += '"';
					i += 2;
					continue;
				}
				inQuotes = false;
				i++;
				continue;
			}
			field += c;
			i++;
			continue;
		}
		if (c === '"') {
			inQuotes = true;
			i++;
			continue;
		}
		if (c === ',') {
			push();
			i++;
			continue;
		}
		if (c === '\r') {
			i++;
			continue;
		}
		if (c === '\n') {
			push();
			pushRow();
			i++;
			continue;
		}
		field += c;
		i++;
	}
	if (field !== '' || row.length > 0) {
		push();
		pushRow();
	}
	return rows;
}

/** Safe positional cell access for CSV rows ('' when missing). */
export function cell(row: readonly string[] | undefined, i: number): string {
	return row?.[i] ?? '';
}
