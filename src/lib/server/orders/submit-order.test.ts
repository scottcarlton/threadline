import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isRedirect } from '@sveltejs/kit';

// Real v4 UUIDs: Zod's uuid validator checks version/variant bits.
const ORG = '0a000000-0000-4000-8000-000000000001';
const BRAND_ORG = '0b000000-0000-4000-8000-000000000002';
const USER = 'a5e00000-0000-4000-8000-000000000001';
const BRAND = 'b0000000-0000-4000-8000-000000000001';
const ACCOUNT = 'ac000000-0000-4000-8000-000000000001';
const PRODUCT = 'b0d00000-0000-4000-8000-000000000001';
const SUBMISSION = '5b000000-0000-4000-8000-000000000001';

const rpc = vi.fn();
const sendOrderEmail = vi.fn();
const notifyBrandAdmins = vi.fn();
const emitOrderEvent = vi.fn();

vi.mock('$lib/server/supabase.js', () => ({ supabaseAdmin: { rpc } }));
vi.mock('$lib/server/order-emails.js', () => ({ sendOrderEmail }));
vi.mock('$lib/server/notifications.js', () => ({ notifyBrandAdmins }));
vi.mock('$lib/server/integrations/events.js', () => ({ emitOrderEvent }));
vi.mock('$lib/server/orders/order-scope.js', () => ({
	resolveOrderScope: vi.fn(async () => ({}))
}));
vi.mock('$lib/server/orders/authorize-submit.js', () => ({
	authorizeSubmitPayload: vi.fn(async () => ({
		ok: true,
		products: new Map([
			[
				PRODUCT,
				{
					brand_id: BRAND,
					wholesale_price: 10,
					style_number: 'ST-1',
					name: 'Tee',
					archived_at: null
				}
			]
		])
	}))
}));
vi.mock('$lib/server/orders/resolve-order-settings.js', () => ({
	resolveOrderSettings: vi.fn(
		async () => new Map([[BRAND, { owner_org_id: BRAND_ORG, accepted_payment_methods: [] }]])
	)
}));

const { submitOrder } = await import('./submit-order');
const { uuidV5 } = await import('./order-ids');

const orderId = uuidV5(`${SUBMISSION}:order:${BRAND}:`);

function request(over: Record<string, unknown> = {}) {
	const body = new FormData();
	body.set(
		'payload',
		JSON.stringify({
			submission_id: SUBMISSION,
			type: 'order',
			account_id: ACCOUNT,
			freeform_name: null,
			order_year: 2026,
			submitStatus: 'submitted',
			payment_preference: null,
			lines: [
				{ product_id: PRODUCT, brand_id: BRAND, season_id: null, color: 'Black', size: 'M', qty: 2 }
			],
			groups: [{ brand_id: BRAND, season_id: null, delivery: null, location_id: null }],
			...over
		})
	);
	return new Request('http://localhost/orders/new', { method: 'POST', body });
}

function locals() {
	return {
		organization: { id: ORG, org_type: 'rep', accepted_payment_methods: [] },
		user: { id: USER },
		membership: { role: 'admin' },
		isBuyer: false,
		audit: { record: vi.fn() }
	} as unknown as App.Locals;
}

async function run(req: Request, l: App.Locals) {
	try {
		return await submitOrder(req, l);
	} catch (e) {
		if (isRedirect(e)) return { redirect: e.location };
		throw e;
	}
}

beforeEach(() => {
	rpc.mockReset();
	sendOrderEmail.mockReset();
	notifyBrandAdmins.mockReset();
	emitOrderEvent.mockReset();
});

describe('submitOrder write path (SCO-204)', () => {
	it('writes the whole submission in one call with ids derived from the submission', async () => {
		rpc.mockResolvedValue({
			data: [{ order_id: orderId, order_number: 'A-1', inserted: true }],
			error: null
		});
		const res = await run(request(), locals());

		expect(rpc).toHaveBeenCalledTimes(1);
		const [fn, args] = rpc.mock.calls[0];
		expect(fn).toBe('create_order_submission');
		expect(args.p_actor).toBe(USER);
		expect(args.p_account).toBeNull();
		expect(args.p_orders).toHaveLength(1);
		expect(args.p_orders[0]).toMatchObject({
			id: orderId,
			organization_id: ORG,
			status: 'submitted',
			lines: [{ product_id: PRODUCT, unit_price: 10, qty: 2, sort_order: 0 }]
		});
		expect(res).toEqual({ redirect: '/orders/confirmation?ids=A-1' });
	});

	it('runs side effects for a first insert', async () => {
		rpc.mockResolvedValue({
			data: [{ order_id: orderId, order_number: 'A-1', inserted: true }],
			error: null
		});
		const l = locals();
		await run(request(), l);
		expect(sendOrderEmail).toHaveBeenCalledTimes(1);
		expect(notifyBrandAdmins).toHaveBeenCalledTimes(1);
		expect(emitOrderEvent).toHaveBeenCalledTimes(1);
		expect(vi.mocked(l.audit.record).mock.calls.map((c) => c[0])).toEqual([
			'order.created',
			'order.submitted'
		]);
	});

	it('skips every side effect on a replay but still confirms the stored order', async () => {
		rpc.mockResolvedValue({
			data: [{ order_id: orderId, order_number: 'A-1', inserted: false }],
			error: null
		});
		const l = locals();
		const res = await run(request(), l);
		expect(sendOrderEmail).not.toHaveBeenCalled();
		expect(notifyBrandAdmins).not.toHaveBeenCalled();
		expect(emitOrderEvent).not.toHaveBeenCalled();
		expect(l.audit.record).not.toHaveBeenCalled();
		expect(res).toEqual({ redirect: '/orders/confirmation?ids=A-1' });
	});

	it('sends the inline account with a derived id and points the order at it', async () => {
		rpc.mockResolvedValue({ data: [], error: null });
		await run(
			request({
				account_id: null,
				submitStatus: 'draft',
				freeformDetails: { business_name: 'New Store' }
			}),
			locals()
		);
		const args = rpc.mock.calls[0][1];
		const accountId = uuidV5(`${SUBMISSION}:account`);
		expect(args.p_account).toMatchObject({
			id: accountId,
			organization_id: ORG,
			business_name: 'New Store'
		});
		expect(args.p_orders[0]).toMatchObject({ account_id: accountId, freeform_name: null });
	});

	it('returns a 500 and fires nothing when the write fails', async () => {
		rpc.mockResolvedValue({ data: null, error: { code: '23502', message: 'boom' } });
		const res = await run(request(), locals());
		expect(res).toMatchObject({ status: 500 });
		expect(sendOrderEmail).not.toHaveBeenCalled();
	});
});
