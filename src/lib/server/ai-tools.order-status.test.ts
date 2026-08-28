import { describe, it, expect } from 'vitest';
import { maySetOrderStatus, ADVANCING_STATUSES } from './ai-tools.js';

describe('maySetOrderStatus', () => {
	it('lets an interactive human set any status', () => {
		for (const status of [...ADVANCING_STATUSES, 'draft', 'submitted']) {
			expect(maySetOrderStatus('interactive', status)).toEqual({ allowed: true });
		}
	});

	it('lets an automated run submit an order', () => {
		expect(maySetOrderStatus('automated', 'submitted')).toEqual({ allowed: true });
		expect(maySetOrderStatus('automated', 'draft')).toEqual({ allowed: true });
	});

	// The rule: an order arriving through AI is submitted, never confirmed.
	// Confirming is the human's answer to a submission, and a model acting on
	// text it was handed must not give that answer on their behalf.
	it('stops an automated run from confirming, shipping, or cancelling', () => {
		for (const status of ['confirmed', 'shipped', 'delivered', 'cancelled']) {
			const result = maySetOrderStatus('automated', status);
			expect(result.allowed).toBe(false);
		}
	});

	it('defaults to the cautious treatment when trust is unset', () => {
		expect(maySetOrderStatus(undefined, 'confirmed').allowed).toBe(false);
		expect(maySetOrderStatus(undefined, 'submitted').allowed).toBe(true);
	});

	it('explains the refusal in terms the model can act on', () => {
		const result = maySetOrderStatus('automated', 'confirmed');
		expect(result.allowed).toBe(false);
		if (result.allowed) return;
		expect(result.error).toContain('confirmed');
		expect(result.error.length).toBeGreaterThan(40);
	});
});
