import { describe, it, expect, vi, beforeEach } from 'vitest';

// One chain object per table so a single test can stage both the `orders` read
// and the `federated_order_links` lookup independently.
const ordersSingle = vi.fn();
const linksMaybeSingle = vi.fn();

const ordersChain = {
	select: vi.fn(() => ordersChain),
	eq: vi.fn(() => ordersChain),
	single: ordersSingle
};

const linksChain = {
	select: vi.fn(() => linksChain),
	eq: vi.fn(() => linksChain),
	maybeSingle: linksMaybeSingle
};

const mockFrom = vi.fn((table: string) => (table === 'orders' ? ordersChain : linksChain));

vi.mock('$lib/server/supabase', () => ({ supabaseAdmin: { from: mockFrom } }));

const { loadOrderForOrg, loadOwnOrgOrder } = await import('./authorize-order');

const OWN_ORG = 'org-own';
const OTHER_ORG = 'org-other';

beforeEach(() => {
	vi.clearAllMocks();
	ordersSingle.mockResolvedValue({
		data: { id: 'order-1', organization_id: OTHER_ORG },
		error: null
	});
	linksMaybeSingle.mockResolvedValue({ data: null });
});

describe('loadOrderForOrg', () => {
	it('returns the order when it belongs to the caller org', async () => {
		ordersSingle.mockResolvedValue({
			data: { id: 'order-1', organization_id: OWN_ORG },
			error: null
		});

		const order = await loadOrderForOrg('order-1', OWN_ORG);

		expect(order).toEqual({ id: 'order-1', organization_id: OWN_ORG });
		// Own-org short-circuits: no federation lookup needed.
		expect(mockFrom).not.toHaveBeenCalledWith('federated_order_links');
	});

	it('returns null for another org with no federation link', async () => {
		expect(await loadOrderForOrg('order-1', OWN_ORG)).toBeNull();
	});

	it('returns the order for another org when an active link targets the caller', async () => {
		linksMaybeSingle.mockResolvedValue({ data: { id: 'link-1' } });

		const order = await loadOrderForOrg('order-1', OWN_ORG);

		expect(order).toEqual({ id: 'order-1', organization_id: OTHER_ORG });
	});

	it('scopes the federation lookup to the caller org and active status', async () => {
		linksMaybeSingle.mockResolvedValue({ data: { id: 'link-1' } });

		await loadOrderForOrg('order-1', OWN_ORG);

		expect(linksChain.eq).toHaveBeenCalledWith('target_org_id', OWN_ORG);
		expect(linksChain.eq).toHaveBeenCalledWith('status', 'active');
	});

	it('returns null when the order does not exist', async () => {
		ordersSingle.mockResolvedValue({ data: null, error: { message: 'no rows' } });

		expect(await loadOrderForOrg('missing', OWN_ORG)).toBeNull();
	});
});

describe('loadOwnOrgOrder', () => {
	it('filters by organization_id in the query and never consults federation links', async () => {
		ordersSingle.mockResolvedValue({
			data: { id: 'order-1', organization_id: OWN_ORG },
			error: null
		});

		const order = await loadOwnOrgOrder('order-1', OWN_ORG);

		expect(order).toEqual({ id: 'order-1', organization_id: OWN_ORG });
		expect(ordersChain.eq).toHaveBeenCalledWith('organization_id', OWN_ORG);
		// Clone writes into the source org, so federation must not widen this.
		expect(mockFrom).not.toHaveBeenCalledWith('federated_order_links');
	});

	it('returns null when the org filter excludes the row', async () => {
		ordersSingle.mockResolvedValue({ data: null, error: { message: 'no rows' } });

		expect(await loadOwnOrgOrder('order-1', OWN_ORG)).toBeNull();
	});
});
