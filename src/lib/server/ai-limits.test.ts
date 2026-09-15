import { describe, it, expect } from 'vitest';
import {
	decideAiLimit,
	secondsUntilDailyReset,
	DEFAULT_AI_LIMITS,
	type AiLimitCounts
} from './ai-limits.js';

const quiet: AiLimitCounts = { userLastMinute: 0, orgLastMinute: 0, orgTokensToday: 0 };

describe('secondsUntilDailyReset', () => {
	it('counts to the next UTC midnight', () => {
		expect(secondsUntilDailyReset(new Date('2026-08-26T23:59:00Z'))).toBe(60);
		expect(secondsUntilDailyReset(new Date('2026-08-26T00:00:00Z'))).toBe(86400);
	});

	it('never returns zero, so Retry-After is always meaningful', () => {
		expect(secondsUntilDailyReset(new Date('2026-08-26T23:59:59.999Z'))).toBeGreaterThan(0);
	});
});

describe('decideAiLimit', () => {
	it('allows a quiet caller', () => {
		expect(decideAiLimit(quiet)).toEqual({ allowed: true });
	});

	it('allows a caller one request below every ceiling', () => {
		const verdict = decideAiLimit({
			userLastMinute: DEFAULT_AI_LIMITS.userPerMinute - 1,
			orgLastMinute: DEFAULT_AI_LIMITS.orgPerMinute - 1,
			orgTokensToday: DEFAULT_AI_LIMITS.orgDailyTokens - 1
		});
		expect(verdict).toEqual({ allowed: true });
	});

	it('blocks one user hammering the endpoint', () => {
		const verdict = decideAiLimit({ ...quiet, userLastMinute: DEFAULT_AI_LIMITS.userPerMinute });
		expect(verdict).toMatchObject({ allowed: false, scope: 'user_rate', retryAfter: 60 });
	});

	it('blocks an org burst even when no single user is over', () => {
		const verdict = decideAiLimit({
			userLastMinute: 1,
			orgLastMinute: DEFAULT_AI_LIMITS.orgPerMinute,
			orgTokensToday: 0
		});
		expect(verdict).toMatchObject({ allowed: false, scope: 'org_rate' });
	});

	it('refuses once the day-s token budget is spent', () => {
		const verdict = decideAiLimit(
			{ ...quiet, orgTokensToday: DEFAULT_AI_LIMITS.orgDailyTokens },
			DEFAULT_AI_LIMITS,
			new Date('2026-08-26T23:00:00Z')
		);
		expect(verdict).toMatchObject({ allowed: false, scope: 'org_budget' });
		if (verdict.allowed) return;
		expect(verdict.retryAfter).toBe(3600);
	});

	// Being over the rate ceiling is recoverable in a minute; being out of budget
	// is not. Report the one the caller can act on.
	it('reports the rate ceiling first when both are breached', () => {
		const verdict = decideAiLimit({
			userLastMinute: DEFAULT_AI_LIMITS.userPerMinute,
			orgLastMinute: DEFAULT_AI_LIMITS.orgPerMinute,
			orgTokensToday: DEFAULT_AI_LIMITS.orgDailyTokens
		});
		expect(verdict).toMatchObject({ allowed: false, scope: 'user_rate' });
	});

	it('honours a caller-supplied config', () => {
		const tight = { userPerMinute: 1, orgPerMinute: 100, orgDailyTokens: 100 };
		expect(decideAiLimit({ ...quiet, userLastMinute: 1 }, tight)).toMatchObject({
			allowed: false,
			scope: 'user_rate'
		});
	});

	it('gives every refusal a message safe to show the caller', () => {
		const scopes = [
			{ ...quiet, userLastMinute: DEFAULT_AI_LIMITS.userPerMinute },
			{ ...quiet, orgLastMinute: DEFAULT_AI_LIMITS.orgPerMinute },
			{ ...quiet, orgTokensToday: DEFAULT_AI_LIMITS.orgDailyTokens }
		];
		for (const counts of scopes) {
			const verdict = decideAiLimit(counts);
			expect(verdict.allowed).toBe(false);
			if (verdict.allowed) continue;
			expect(verdict.message.length).toBeGreaterThan(10);
			expect(verdict.retryAfter).toBeGreaterThan(0);
		}
	});

	it('keeps the org ceiling above the per-user one', () => {
		expect(DEFAULT_AI_LIMITS.orgPerMinute).toBeGreaterThan(DEFAULT_AI_LIMITS.userPerMinute);
	});
});
