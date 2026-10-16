import { describe, it, expect, vi, beforeEach } from 'vitest';

const captureException = vi.fn();
vi.mock('@sentry/sveltekit', () => ({ captureException }));

const { reportAiError } = await import('./ai-errors.js');

beforeEach(() => {
	captureException.mockClear();
	vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('reportAiError', () => {
	it('tags the event with subsystem, endpoint, purpose and org', () => {
		const err = new Error('overloaded');
		reportAiError(err, {
			endpoint: 'briefing',
			purpose: 'briefing',
			organizationId: 'org-1',
			extra: { cacheKey: 'k' }
		});

		expect(captureException).toHaveBeenCalledWith(err, {
			tags: {
				subsystem: 'ai',
				ai_endpoint: 'briefing',
				ai_purpose: 'briefing',
				organization_id: 'org-1'
			},
			extra: { cacheKey: 'k' }
		});
	});

	it('omits optional tags rather than sending empty values', () => {
		reportAiError(new Error('x'), { endpoint: 'email-intake', organizationId: null });

		expect(captureException.mock.calls[0][1].tags).toEqual({
			subsystem: 'ai',
			ai_endpoint: 'email-intake'
		});
	});

	it('still logs to the console for local dev and Vercel logs', () => {
		const err = new Error('x');
		reportAiError(err, { endpoint: 'agent', purpose: 'schedule' });

		expect(console.error).toHaveBeenCalledWith('[ai] agent/schedule failed:', err);
	});
});
