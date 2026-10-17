import { describe, it, expect, vi, beforeEach } from 'vitest';

const captureException = vi.fn();
const captureMessage = vi.fn();
vi.mock('@sentry/sveltekit', () => ({ captureException, captureMessage }));

const { reportAiError, reportAiValidation } = await import('./ai-errors.js');

beforeEach(() => {
	captureException.mockClear();
	captureMessage.mockClear();
	vi.spyOn(console, 'error').mockImplementation(() => {});
	vi.spyOn(console, 'warn').mockImplementation(() => {});
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

describe('reportAiValidation', () => {
	it('sends a grouped warning with counts and a capped issue sample', () => {
		reportAiValidation({
			endpoint: 'linesheet',
			purpose: 'parse_products',
			organizationId: 'org-1',
			failed: 2,
			total: 40,
			issues: Array.from({ length: 15 }, (_, i) => `products.${i}.wholesale_price: required`)
		});

		const [message, options] = captureMessage.mock.calls[0];
		expect(message).toBe('[ai] linesheet/parse_products output failed validation');
		expect(options.level).toBe('warning');
		expect(options.fingerprint).toEqual(['ai-validation', 'linesheet', 'parse_products']);
		expect(options.tags.organization_id).toBe('org-1');
		expect(options.extra.failed).toBe(2);
		expect(options.extra.total).toBe(40);
		expect(options.extra.issues).toHaveLength(10);
	});

	it('stays silent when nothing failed', () => {
		reportAiValidation({ endpoint: 'linesheet', failed: 0, total: 40, issues: [] });

		expect(captureMessage).not.toHaveBeenCalled();
	});
});
