import { describe, it, expect } from 'vitest';
import { onboardingStateSchema, MAX_STATS, MAX_SUB_STATES } from './onboarding-state';

const valid = {
	phase: 1,
	sub: 2,
	subStates: { '0.0': 'done', '1.0': 'skipped' },
	stats: [{ key: 'members', n: '10', label: 'Members Added' }]
};

describe('onboardingStateSchema', () => {
	it('accepts a realistic cursor', () => {
		const r = onboardingStateSchema.safeParse(valid);
		expect(r.success).toBe(true);
	});

	it('accepts a cursor with no optional sections', () => {
		expect(onboardingStateSchema.safeParse({ phase: 0, sub: 0 }).success).toBe(true);
	});

	it('keeps the skipped note', () => {
		const r = onboardingStateSchema.parse({
			phase: 1,
			sub: 0,
			stats: [{ key: 'orders', n: '0', label: 'Orders Added', note: 'Skipped for now' }]
		});
		expect(r.stats?.[0].note).toBe('Skipped for now');
	});

	it('rejects negative or non-integer positions', () => {
		expect(onboardingStateSchema.safeParse({ phase: -1, sub: 0 }).success).toBe(false);
		expect(onboardingStateSchema.safeParse({ phase: 1.5, sub: 0 }).success).toBe(false);
	});

	it('rejects an unknown sub-step status', () => {
		expect(
			onboardingStateSchema.safeParse({ phase: 0, sub: 0, subStates: { '0.0': 'maybe' } }).success
		).toBe(false);
	});

	it('rejects an oversized stats array', () => {
		const stats = Array.from({ length: MAX_STATS + 1 }, (_, i) => ({
			n: String(i),
			label: 'Members Added'
		}));
		expect(onboardingStateSchema.safeParse({ phase: 0, sub: 0, stats }).success).toBe(false);
	});

	it('rejects an oversized subStates map', () => {
		const subStates: Record<string, string> = {};
		for (let i = 0; i <= MAX_SUB_STATES; i++) subStates[`9.${i}`] = 'done';
		expect(onboardingStateSchema.safeParse({ phase: 0, sub: 0, subStates }).success).toBe(false);
	});

	it('rejects an overlong label', () => {
		expect(
			onboardingStateSchema.safeParse({
				phase: 0,
				sub: 0,
				stats: [{ n: '1', label: 'x'.repeat(65) }]
			}).success
		).toBe(false);
	});

	it('strips unknown keys rather than persisting them', () => {
		const r = onboardingStateSchema.parse({ ...valid, junk: 'x'.repeat(1000) });
		expect('junk' in r).toBe(false);
	});
});
