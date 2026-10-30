import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	generateShareToken,
	hashShareToken,
	isShareLive,
	isWellFormedToken,
	mayShareReports,
	parseSnapshot,
	resolveShareToken,
	shareExpiry
} from './share-links';
import { reportShareCreateSchema } from '$lib/schemas/report-share';

const NOW = new Date('2026-10-30T12:00:00Z');

describe('mayShareReports', () => {
	it.each(['admin', 'owner'])('lets %s share', (role) => {
		expect(mayShareReports(role)).toBe(true);
	});

	it.each(['member', 'sales', 'guest', '', null, undefined])('refuses %s', (role) => {
		expect(mayShareReports(role)).toBe(false);
	});
});

describe('shareExpiry', () => {
	it('adds the chosen lifetime', () => {
		expect(shareExpiry('24h', NOW).toISOString()).toBe('2026-10-31T12:00:00.000Z');
		expect(shareExpiry('7d', NOW).toISOString()).toBe('2026-11-06T12:00:00.000Z');
		expect(shareExpiry('30d', NOW).toISOString()).toBe('2026-11-29T12:00:00.000Z');
	});

	it('defaults the form to 7 days', () => {
		expect(reportShareCreateSchema.parse({}).ttl).toBe('7d');
	});
});

describe('tokens', () => {
	it('generates well-formed, distinct tokens', () => {
		const a = generateShareToken();
		const b = generateShareToken();
		expect(isWellFormedToken(a)).toBe(true);
		expect(a).not.toBe(b);
	});

	it('hashes to 64 hex characters, deterministically', () => {
		const t = generateShareToken();
		expect(hashShareToken(t)).toMatch(/^[0-9a-f]{64}$/);
		expect(hashShareToken(t)).toBe(hashShareToken(t));
	});

	it.each(['', 'short', 'x'.repeat(44), 'a'.repeat(42) + '/'])('rejects %j', (t) => {
		expect(isWellFormedToken(t)).toBe(false);
	});
});

describe('isShareLive', () => {
	it('is live before expiry and unrevoked', () => {
		expect(isShareLive({ expires_at: '2026-11-01T00:00:00Z', revoked_at: null }, NOW)).toBe(true);
	});

	it('is dead once expired', () => {
		expect(isShareLive({ expires_at: '2026-10-30T11:59:59Z', revoked_at: null }, NOW)).toBe(false);
	});

	it('is dead once revoked, even before expiry', () => {
		expect(
			isShareLive({ expires_at: '2026-11-01T00:00:00Z', revoked_at: '2026-10-30T00:00:00Z' }, NOW)
		).toBe(false);
	});
});

describe('parseSnapshot', () => {
	it('accepts the shape this code writes', () => {
		expect(parseSnapshot({ variant: 'brand', rows: [{ a: 1 }] })).toEqual({
			variant: 'brand',
			rows: [{ a: 1 }]
		});
	});

	it.each([null, 'x', {}, { rows: 'no' }, { rows: [], variant: 3 }])('rejects %j', (v) => {
		expect(parseSnapshot(v)).toBeNull();
	});
});

/** The one query resolveShareToken makes, returning `row`. */
function fakeAdmin(row: Record<string, unknown> | null) {
	const seen: { hash?: string } = {};
	const chain = {
		select: () => chain,
		eq: (_col: string, value: string) => {
			seen.hash = value;
			return chain;
		},
		maybeSingle: async () => ({ data: row, error: null })
	};
	return { client: { from: () => chain } as unknown as SupabaseClient, seen };
}

const liveRow = {
	id: 'link-1',
	organization_id: 'org-1',
	report: 'sales-by-brand',
	title: 'Sales by Brand',
	filter_label: 'Year 2026',
	snapshot: { rows: [{ name: 'A', revenue: 1 }] },
	created_at: '2026-10-29T00:00:00Z',
	expires_at: '2026-11-05T00:00:00Z',
	revoked_at: null,
	organizations: { name: 'Denise Org' }
};

describe('resolveShareToken', () => {
	it('looks the link up by hash and returns the snapshot', async () => {
		const token = generateShareToken();
		const { client, seen } = fakeAdmin(liveRow);
		const link = await resolveShareToken(client, token, NOW);
		expect(seen.hash).toBe(hashShareToken(token));
		expect(link?.orgName).toBe('Denise Org');
		expect(link?.snapshot.rows).toHaveLength(1);
	});

	it('never queries for a malformed token', async () => {
		const { client, seen } = fakeAdmin(liveRow);
		expect(await resolveShareToken(client, 'nope', NOW)).toBeNull();
		expect(seen.hash).toBeUndefined();
	});

	it('returns null for an unknown, expired or revoked link alike', async () => {
		const token = generateShareToken();
		expect(await resolveShareToken(fakeAdmin(null).client, token, NOW)).toBeNull();
		expect(
			await resolveShareToken(
				fakeAdmin({ ...liveRow, expires_at: '2026-10-01T00:00:00Z' }).client,
				token,
				NOW
			)
		).toBeNull();
		expect(
			await resolveShareToken(
				fakeAdmin({ ...liveRow, revoked_at: '2026-10-30T00:00:00Z' }).client,
				token,
				NOW
			)
		).toBeNull();
	});
});
