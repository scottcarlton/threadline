import type { OrderRowDraft } from '$lib/schemas/order-import.js';

export type OrderGroup = {
	account: string;
	lines: OrderRowDraft[];
};

export function groupOrderRows(rows: OrderRowDraft[]): OrderGroup[] {
	const map = new Map<string, OrderGroup>();
	for (const row of rows) {
		const key = row.account.toLowerCase();
		const existing = map.get(key);
		if (existing) {
			existing.lines.push(row);
		} else {
			map.set(key, { account: row.account, lines: [row] });
		}
	}
	return Array.from(map.values());
}
