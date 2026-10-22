import { describe, it, expect, vi, beforeEach } from 'vitest';

const captureException = vi.fn();
const captureMessage = vi.fn();
vi.mock('@sentry/sveltekit', () => ({ captureException, captureMessage }));

const { reportAiError, reportAiValidation, reportAiDegraded, reportAiRefused } =
	await import('./ai-errors.js');

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

describe('reportAiDegraded', () => {
	it('sends a warning grouped by kind and endpoint', () => {
		reportAiDegraded('iteration_cap', {
			endpoint: 'chat',
			purpose: 'tools',
			organizationId: 'org-1',
			extra: { turnId: 't-1' }
		});

		const [message, options] = captureMessage.mock.calls[0];
		expect(message).toBe('[ai] chat/tools degraded: iteration_cap');
		expect(options.level).toBe('warning');
		expect(options.fingerprint).toEqual(['ai-degraded', 'iteration_cap', 'chat']);
		expect(options.tags).toMatchObject({ ai_degraded: 'iteration_cap', organization_id: 'org-1' });
		expect(options.extra).toEqual({ turnId: 't-1' });
	});
});

describe('reportAiRefused', () => {
	it('sends a warning grouped by scope alone, tagged with endpoint and org', () => {
		reportAiRefused('org_budget', {
			endpoint: 'briefing',
			organizationId: 'org-1',
			extra: { userId: 'u-1' }
		});

		const [message, options] = captureMessage.mock.calls[0];
		expect(message).toBe('[ai] request refused: org_budget');
		expect(options.level).toBe('warning');
		expect(options.fingerprint).toEqual(['ai-refused', 'org_budget']);
		expect(options.tags).toEqual({
			subsystem: 'ai',
			ai_endpoint: 'briefing',
			ai_refused: 'org_budget',
			organization_id: 'org-1'
		});
		expect(options.extra).toEqual({ userId: 'u-1' });
	});

	// One issue per scope across endpoints, so the spike alert sees the total.
	it('groups the same scope from different endpoints together', () => {
		reportAiRefused('user_rate', { endpoint: 'chat' });
		reportAiRefused('user_rate', { endpoint: 'linesheet' });
		const prints = captureMessage.mock.calls.map((c) => c[1].fingerprint);
		expect(prints[0]).toEqual(prints[1]);
	});
});
