import { describe, it, expect } from 'vitest';

// Re-declare the local helper for the test; kept in sync with the
// private implementation in ai-tools.ts.
function formatToolResult(
	data: Record<string, unknown>,
	opts: { keep?: string[]; omit?: string[] }
): Record<string, unknown> {
	if (opts.keep) {
		const result: Record<string, unknown> = {};
		for (const key of opts.keep) {
			if (data[key] !== undefined && data[key] !== null) result[key] = data[key];
		}
		return result;
	}
	const result: Record<string, unknown> = { ...data };
	for (const key of opts.omit ?? []) delete result[key];
	return result;
}

describe('formatToolResult', () => {
	const row = {
		id: 'ord_1',
		order_number: 'ORD-042',
		organization_id: 'org_1',
		created_at: '2026-04-16',
		updated_at: '2026-04-16',
		status: 'draft',
		total_amount: 1250,
		notes: null
	};

	it('keep mode returns only the listed fields', () => {
		const trimmed = formatToolResult(row, { keep: ['id', 'order_number', 'status'] });
		expect(trimmed).toEqual({ id: 'ord_1', order_number: 'ORD-042', status: 'draft' });
	});

	it('keep mode drops undefined and null values', () => {
		const trimmed = formatToolResult(row, { keep: ['order_number', 'notes', 'missing'] });
		expect(trimmed).toEqual({ order_number: 'ORD-042' });
	});

	it('omit mode strips the listed fields and keeps everything else', () => {
		const trimmed = formatToolResult(row, { omit: ['organization_id', 'updated_at'] });
		expect(trimmed).not.toHaveProperty('organization_id');
		expect(trimmed).not.toHaveProperty('updated_at');
		expect(trimmed.id).toBe('ord_1');
		expect(trimmed.created_at).toBe('2026-04-16');
	});

	it('omit mode with no keys is a shallow copy', () => {
		const trimmed = formatToolResult(row, {});
		expect(trimmed).toEqual(row);
		expect(trimmed).not.toBe(row);
	});
});
