import type { OutboxStore } from './db';
import type { OutboxItem } from './types';

/** In-memory OutboxStore for drain and runtime tests. */
export function memoryStore(initial: OutboxItem[] = []): OutboxStore & {
	rows: Map<string, OutboxItem>;
} {
	const rows = new Map(initial.map((i) => [i.id, structuredClone(i)]));
	return {
		rows,
		async list(userId) {
			return [...rows.values()].filter((i) => i.userId === userId).map((i) => structuredClone(i));
		},
		async get(id) {
			const row = rows.get(id);
			return row ? structuredClone(row) : undefined;
		},
		async put(item) {
			rows.set(item.id, structuredClone(item));
		},
		async remove(ids) {
			for (const id of ids) rows.delete(id);
		}
	};
}

export function item(over: Partial<OutboxItem> & { id: string }): OutboxItem {
	return {
		userId: 'user-1',
		kind: 'account.create',
		payload: {},
		dependsOn: [],
		status: 'pending',
		label: over.id,
		attempts: 0,
		lastError: null,
		nextAttemptAt: 0,
		createdAt: 0,
		updatedAt: 0,
		...over
	};
}
