import { describe, expect, it, vi, beforeEach } from 'vitest';

// SCO-171: the convert action runs through supabaseAdmin, so RLS never sees
// it. These tests pin the app-layer gate that stands in for the
// admin/owner-only federated status policy.

const REP_ORG = 'org-rep';
const BRAND_ORG = 'org-brand';

const ordersSingle = vi.fn();
const ordersUpdate = vi.fn();
const linksMaybeSingle = vi.fn();
const brandTermsMaybeSingle = vi.fn();

const chain = (terminal: Record<string, unknown>) => {
	const obj: Record<string, unknown> = {
		select: () => obj,
		eq: () => obj,
		...terminal
	};
	return obj;
};

vi.mock('$lib/server/supabase.js', () => ({
	supabaseAdmin: {
		from: (table: string) => {
			if (table === 'federated_order_links') return chain({ maybeSingle: linksMaybeSingle });
			if (table === 'brand_terms') return chain({ maybeSingle: brandTermsMaybeSingle });
			return {
				select: () => chain({ single: ordersSingle }),
				update: (payload: Record<string, unknown>) => {
					ordersUpdate(payload);
					return { eq: async () => ({ error: null }) };
				}
			};
		}
	}
}));

vi.mock('$lib/server/log-supabase-error.js', () => ({ logSupabaseError: vi.fn() }));

const { actions } = await import('./+page.server');

type ConvertResult = { status?: number; ok?: boolean };

const makeEvent = (role: string, orgId: string) => {
	const fd = new FormData();
	fd.set('start_ship_date', '2026-07-15');
	fd.set('expected_ship_date', '2026-08-30');
	fd.set('agreed_terms_id', 'generic');
	return {
		request: { formData: async () => fd },
		params: { id: '11111111-1111-4111-8111-111111111111' },
		locals: {
			session: { user: { id: 'user-1' } },
			organization: { id: orgId },
			membership: { role },
			user: { id: 'user-1' }
		}
	} as never;
};

beforeEach(() => {
	vi.clearAllMocks();
	ordersSingle.mockResolvedValue({
		data: {
			id: '11111111-1111-4111-8111-111111111111',
			organization_id: REP_ORG,
			order_type: 'note',
			brand_id: 'brand-1',
			account_id: 'account-1'
		},
		error: null
	});
	// Active federation link pointing at the brand org.
	linksMaybeSingle.mockResolvedValue({ data: { id: 'link-1' } });
	brandTermsMaybeSingle.mockResolvedValue({ data: null });
});

describe('convert action — federated note', () => {
	it('refuses a BLSR (sales in the brand org)', async () => {
		const result = (await actions.convert(makeEvent('sales', BRAND_ORG))) as ConvertResult;
		expect(result.status).toBe(403);
		expect(ordersUpdate).not.toHaveBeenCalled();
	});

	it('refuses a member in the brand org', async () => {
		const result = (await actions.convert(makeEvent('member', BRAND_ORG))) as ConvertResult;
		expect(result.status).toBe(403);
		expect(ordersUpdate).not.toHaveBeenCalled();
	});

	it('allows an admin of the brand org', async () => {
		const result = (await actions.convert(makeEvent('admin', BRAND_ORG))) as ConvertResult;
		expect(result).toEqual({ ok: true });
		expect(ordersUpdate).toHaveBeenCalledWith(
			expect.objectContaining({ order_type: 'order', status: 'submitted' })
		);
	});

	it('still refuses when there is no active link, whatever the role', async () => {
		linksMaybeSingle.mockResolvedValue({ data: null });
		const result = (await actions.convert(makeEvent('owner', BRAND_ORG))) as ConvertResult;
		expect(result.status).toBe(403);
		expect(ordersUpdate).not.toHaveBeenCalled();
	});
});

describe('convert action — own-org note', () => {
	it.each(['sales', 'member', 'admin', 'owner'])('allows %s', async (role) => {
		const result = (await actions.convert(makeEvent(role, REP_ORG))) as ConvertResult;
		expect(result).toEqual({ ok: true });
		expect(ordersUpdate).toHaveBeenCalledWith(
			expect.objectContaining({ order_type: 'order', status: 'submitted' })
		);
	});

	it('refuses a guest', async () => {
		const result = (await actions.convert(makeEvent('guest', REP_ORG))) as ConvertResult;
		expect(result.status).toBe(403);
		expect(ordersUpdate).not.toHaveBeenCalled();
	});
});
