import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * This helper is a security boundary, not a convenience. Every endpoint that
 * reads an invoice through `supabaseAdmin` bypasses RLS, so the three-reader
 * rule from docs/brd/permissions-implementation-map.md §A.3 only holds if this
 * reproduces it exactly. The branches below are the whole rule.
 */

const mockSingle = vi.fn();
const chain = {
	select: vi.fn(() => chain),
	eq: vi.fn(() => chain),
	single: mockSingle
};
const mockFrom = vi.fn(() => chain);

vi.mock('$lib/server/supabase', () => ({ supabaseAdmin: { from: mockFrom } }));

const { loadInvoiceForOrg, loadIssuingOrgInvoice } = await import('./authorize-invoice.js');

const BRAND_ORG = 'org-brand';
const REP_ORG = 'org-rep';
const OTHER_ORG = 'org-other';

const row = (overrides: Record<string, unknown> = {}) => ({
	id: 'inv-1',
	organization_id: BRAND_ORG,
	order_org_id: REP_ORG,
	account_id: 'acct-1',
	status: 'sent',
	...overrides
});

beforeEach(() => {
	vi.clearAllMocks();
});

describe('loadInvoiceForOrg', () => {
	it('gives the issuing brand org its own invoice', async () => {
		mockSingle.mockResolvedValue({ data: row(), error: null });
		expect(await loadInvoiceForOrg('inv-1', BRAND_ORG)).not.toBeNull();
	});

	it('gives the issuing brand org its own drafts', async () => {
		mockSingle.mockResolvedValue({ data: row({ status: 'draft' }), error: null });
		expect(await loadInvoiceForOrg('inv-1', BRAND_ORG)).not.toBeNull();
	});

	it("gives the order's org a sent invoice", async () => {
		mockSingle.mockResolvedValue({ data: row(), error: null });
		expect(await loadInvoiceForOrg('inv-1', REP_ORG)).not.toBeNull();
	});

	it("withholds a draft from the order's org", async () => {
		// The governing rule: a draft is the brand's working document.
		mockSingle.mockResolvedValue({ data: row({ status: 'draft' }), error: null });
		expect(await loadInvoiceForOrg('inv-1', REP_ORG)).toBeNull();
	});

	it('withholds everything from an unrelated org', async () => {
		mockSingle.mockResolvedValue({ data: row(), error: null });
		expect(await loadInvoiceForOrg('inv-1', OTHER_ORG)).toBeNull();
	});

	it('returns null identically for not-found and not-authorized', async () => {
		// Callers 404 either way, so invoice existence does not leak across
		// tenants. Same contract as loadOrderForOrg.
		mockSingle.mockResolvedValue({ data: null, error: { message: 'no rows' } });
		const missing = await loadInvoiceForOrg('inv-1', BRAND_ORG);

		mockSingle.mockResolvedValue({ data: row(), error: null });
		const forbidden = await loadInvoiceForOrg('inv-1', OTHER_ORG);

		expect(missing).toBeNull();
		expect(forbidden).toBeNull();
		expect(missing).toEqual(forbidden);
	});

	it('treats every non-draft status as readable by the order org', async () => {
		for (const status of ['sent', 'partial', 'paid', 'void']) {
			mockSingle.mockResolvedValue({ data: row({ status }), error: null });
			expect(await loadInvoiceForOrg('inv-1', REP_ORG), status).not.toBeNull();
		}
	});
});

describe('loadIssuingOrgInvoice', () => {
	it('scopes the query to the issuing org', async () => {
		mockSingle.mockResolvedValue({ data: row(), error: null });
		await loadIssuingOrgInvoice('inv-1', BRAND_ORG);

		// The org filter must be in the query, not applied after the fact: this
		// is what stops a rep org issuing or voiding an invoice it can read.
		expect(chain.eq).toHaveBeenCalledWith('organization_id', BRAND_ORG);
	});

	it('returns null when the row is not in the caller org', async () => {
		mockSingle.mockResolvedValue({ data: null, error: { message: 'no rows' } });
		expect(await loadIssuingOrgInvoice('inv-1', REP_ORG)).toBeNull();
	});
});
