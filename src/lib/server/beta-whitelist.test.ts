import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { env } from '$env/dynamic/private';

const mockMaybeSingle = vi.fn();
const chain = {
	select: vi.fn(() => chain),
	ilike: vi.fn(() => chain),
	limit: vi.fn(() => chain),
	maybeSingle: mockMaybeSingle
};
const mockFrom = vi.fn(() => chain);

vi.mock('./supabase.js', () => ({ supabaseAdmin: { from: mockFrom } }));

const { isEmailWhitelisted, isBetaWhitelistEnabled } = await import('./beta-whitelist.js');

beforeEach(() => {
	vi.clearAllMocks();
	env.BETA_WHITELIST_ENABLED = 'true';
	mockMaybeSingle.mockResolvedValue({ data: { id: 'wl-1' } });
});

afterEach(() => {
	vi.useRealTimers();
	env.BETA_WHITELIST_ENABLED = 'false';
});

describe('isBetaWhitelistEnabled', () => {
	it('reflects the env flag', () => {
		env.BETA_WHITELIST_ENABLED = 'true';
		expect(isBetaWhitelistEnabled()).toBe(true);
		env.BETA_WHITELIST_ENABLED = 'false';
		expect(isBetaWhitelistEnabled()).toBe(false);
	});
});

describe('isEmailWhitelisted', () => {
	it('allows everyone and skips the query when the gate is disabled', async () => {
		env.BETA_WHITELIST_ENABLED = 'false';
		expect(await isEmailWhitelisted('disabled@example.com')).toBe(true);
		expect(mockFrom).not.toHaveBeenCalled();
	});

	it('queries the table and returns true for a whitelisted email', async () => {
		expect(await isEmailWhitelisted('first-hit@example.com')).toBe(true);
		expect(mockFrom).toHaveBeenCalledWith('beta_whitelist');
		expect(mockMaybeSingle).toHaveBeenCalledTimes(1);
	});

	it('returns false (and does not cache) for a non-whitelisted email', async () => {
		mockMaybeSingle.mockResolvedValue({ data: null });
		expect(await isEmailWhitelisted('denied@example.com')).toBe(false);
		expect(await isEmailWhitelisted('denied@example.com')).toBe(false);
		// Negatives are never cached — newly added emails must take effect at once.
		expect(mockMaybeSingle).toHaveBeenCalledTimes(2);
	});

	it('caches a positive result, skipping the query within the TTL', async () => {
		await isEmailWhitelisted('cached@example.com');
		await isEmailWhitelisted('CACHED@example.com'); // case-insensitive key
		expect(mockMaybeSingle).toHaveBeenCalledTimes(1);
	});

	it('re-queries after the cache TTL expires', async () => {
		vi.useFakeTimers();
		await isEmailWhitelisted('ttl@example.com');
		expect(mockMaybeSingle).toHaveBeenCalledTimes(1);

		vi.advanceTimersByTime(61_000); // past the 60s TTL
		await isEmailWhitelisted('ttl@example.com');
		expect(mockMaybeSingle).toHaveBeenCalledTimes(2);
	});
});
