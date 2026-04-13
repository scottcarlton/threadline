import { vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

type MockResponse = { data?: unknown; error?: { message: string } | null };

/**
 * Creates a mock Supabase client where each table name maps to a predefined response.
 * The chainable query builder pattern (.from().select().eq().single()) is fully mocked.
 *
 * Usage:
 *   const supabase = createMockSupabase({
 *     orders: { data: [{ id: '1', total_amount: 100 }] },
 *     accounts: { data: [{ id: 'a1', created_at: '2024-01-01' }] }
 *   });
 */
export function createMockSupabase(responses: Record<string, MockResponse> = {}): SupabaseClient {
	const chainable = (tableName: string) => {
		const response = responses[tableName] ?? { data: null, error: null };

		const chain: Record<string, unknown> = {};

		const chainMethods = [
			'select',
			'insert',
			'update',
			'delete',
			'upsert',
			'eq',
			'neq',
			'in',
			'not',
			'is',
			'lt',
			'gt',
			'gte',
			'lte',
			'order',
			'limit',
			'range',
			'filter',
			'match',
			'or',
			'contains',
			'textSearch',
			'maybeSingle'
		];

		for (const method of chainMethods) {
			chain[method] = vi.fn().mockReturnValue(chain);
		}

		// Terminal method
		chain.single = vi.fn().mockResolvedValue(response);

		// Make the chain itself thenable so `await supabase.from('x').select().eq(...)` resolves
		chain.then = (resolve: (value: MockResponse) => void) => resolve(response);

		return chain;
	};

	return {
		from: vi.fn((table: string) => chainable(table)),
		auth: {
			getSession: vi.fn(),
			getUser: vi.fn(),
			admin: { listUsers: vi.fn() }
		}
	} as unknown as SupabaseClient;
}
