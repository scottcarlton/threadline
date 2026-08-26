import { describe, it, expect } from 'vitest';
import { decideRateLimit, PER_SENDER_LIMIT_PER_HOUR, GLOBAL_LIMIT_PER_HOUR } from './rate-limit.js';

describe('decideRateLimit', () => {
	it('allows a quiet sender on a quiet platform', () => {
		expect(decideRateLimit(0, 0)).toEqual({ allowed: true });
	});

	it('allows a sender one message below the ceiling', () => {
		expect(decideRateLimit(PER_SENDER_LIMIT_PER_HOUR - 1, 0)).toEqual({ allowed: true });
	});

	it('blocks a sender at the ceiling', () => {
		expect(decideRateLimit(PER_SENDER_LIMIT_PER_HOUR, 0)).toEqual({
			allowed: false,
			scope: 'sender',
			count: PER_SENDER_LIMIT_PER_HOUR
		});
	});

	// The bug this module replaces: a busy platform used to block every sender,
	// because the count had no per-sender filter.
	it('does not block a quiet sender just because the platform is busy', () => {
		expect(decideRateLimit(1, GLOBAL_LIMIT_PER_HOUR - 1)).toEqual({ allowed: true });
	});

	it('blocks everyone once the global breaker trips', () => {
		expect(decideRateLimit(1, GLOBAL_LIMIT_PER_HOUR)).toEqual({
			allowed: false,
			scope: 'global',
			count: GLOBAL_LIMIT_PER_HOUR
		});
	});

	it('attributes to the sender when both are breached', () => {
		const verdict = decideRateLimit(PER_SENDER_LIMIT_PER_HOUR, GLOBAL_LIMIT_PER_HOUR);
		expect(verdict).toMatchObject({ allowed: false, scope: 'sender' });
	});

	it('keeps the global breaker well above the per-sender ceiling', () => {
		expect(GLOBAL_LIMIT_PER_HOUR).toBeGreaterThan(PER_SENDER_LIMIT_PER_HOUR * 4);
	});
});
