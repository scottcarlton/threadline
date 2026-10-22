import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { executeToolCall } from './ai-tools.js';

// A client that fails the test if a handler reaches the database.
function untouchable() {
	const from = vi.fn(() => {
		throw new Error('handler ran');
	});
	return { client: { from } as unknown as SupabaseClient, from };
}

function ctx(supabase: SupabaseClient) {
	return {
		supabase,
		organizationId: 'org-1',
		userId: 'user-1',
		brandScope: null,
		orgType: 'rep' as const,
		origin: 'http://localhost',
		trust: 'interactive' as const
	};
}

describe('executeToolCall write validation', () => {
	it('refuses a write whose input fails its schema without running the handler', async () => {
		const { client, from } = untouchable();
		const r = await executeToolCall('update_order_line', { line_id: 'l1' }, ctx(client));
		expect(r.success).toBe(false);
		expect(r.error).toMatch(/^Invalid input for update_order_line\./);
		expect(r.error).toContain('qty');
		expect(from).not.toHaveBeenCalled();
	});

	it('validates calls that skip runStitchTurn too, like the messaging agent', async () => {
		const { client, from } = untouchable();
		const r = await executeToolCall(
			'create_order',
			{ account_name: 'Nordstrom', status: 'draft', lines: [{ qty: 2 }] },
			ctx(client)
		);
		expect(r.success).toBe(false);
		expect(r.error).toContain('start_ship_date');
		expect(from).not.toHaveBeenCalled();
	});

	it('runs the handler with parsed input when the call is valid', async () => {
		const { client, from } = untouchable();
		// The handler is reached (and hits the guard client) only after parsing passes.
		await expect(
			executeToolCall('delete_appointment', { appointment_id: 'a1' }, ctx(client))
		).rejects.toThrow('handler ran');
		expect(from).toHaveBeenCalledWith('appointments');
	});
});
