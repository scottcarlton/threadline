import { describe, it, expect } from 'vitest';
import { isManageableProvider, latestSyncByConnection } from './integration-sync';

describe('latestSyncByConnection', () => {
	it('keeps the newest row per connection regardless of input order', () => {
		const result = latestSyncByConnection([
			{ connection_id: 'a', status: 'success', created_at: '2026-10-01T10:00:00Z' },
			{ connection_id: 'a', status: 'error', created_at: '2026-10-03T10:00:00Z' },
			{ connection_id: 'a', status: 'success', created_at: '2026-10-02T10:00:00Z' },
			{ connection_id: 'b', status: 'pending', created_at: '2026-10-01T09:00:00Z' }
		]);
		expect(result).toEqual({
			a: { status: 'error', created_at: '2026-10-03T10:00:00Z' },
			b: { status: 'pending', created_at: '2026-10-01T09:00:00Z' }
		});
	});

	it('returns an empty map for no logs', () => {
		expect(latestSyncByConnection([])).toEqual({});
	});
});

describe('isManageableProvider', () => {
	it.each(['google_sheets', 'slack', 'notion', 'microsoft'] as const)('links %s', (p) => {
		expect(isManageableProvider(p)).toBe(true);
	});

	it.each(['shopify', 'discord'] as const)('does not link %s, which has no page', (p) => {
		expect(isManageableProvider(p)).toBe(false);
	});
});
