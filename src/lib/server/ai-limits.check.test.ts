import { describe, it, expect, vi, beforeEach } from 'vitest';

type Result = { count?: number | null; data?: unknown; error: { message: string } | null };

// One queued result per read, in the order checkAiLimits issues them:
// user rate, org rate, org token usage.
let reads: Result[] = [];
const insert = vi.fn(async () => ({ error: null as { message: string } | null }));
const logSupabaseError = vi.fn();

function readChain() {
	const result = reads.shift();
	const chain = {
		select: () => chain,
		eq: () => chain,
		gte: () => Promise.resolve(result)
	};
	return chain;
}

vi.mock('./supabase.js', () => ({
	supabaseAdmin: {
		from: () => ({ ...readChain(), insert })
	}
}));
vi.mock('./log-supabase-error.js', () => ({ logSupabaseError }));

const { checkAiLimits } = await import('./ai-limits.js');

beforeEach(() => {
	reads = [];
	insert.mockClear();
	logSupabaseError.mockClear();
});

describe('checkAiLimits', () => {
	it('fails open on a count error but reports it', async () => {
		const failure = { message: 'connection reset' };
		reads = [
			{ count: null, error: failure },
			{ count: 0, error: null },
			{ data: [], error: null }
		];

		const verdict = await checkAiLimits('org-1', 'user-1', 'chat');

		expect(verdict.allowed).toBe(true);
		expect(logSupabaseError).toHaveBeenCalledWith('ai-limits user rate count', failure);
	});

	it('reports a failed request counter insert', async () => {
		reads = [
			{ count: 0, error: null },
			{ count: 0, error: null },
			{ data: [], error: null }
		];
		const failure = { message: 'insert denied' };
		insert.mockResolvedValueOnce({ error: failure });

		await checkAiLimits('org-1', 'user-1', 'chat');

		expect(logSupabaseError).toHaveBeenCalledWith('ai-limits request counter insert', failure);
	});
});
