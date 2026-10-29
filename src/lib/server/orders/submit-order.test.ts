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
const createNotification = vi.fn<(params: Record<string, unknown>) => Promise<void>>(
	async () => {}
);

vi.mock('$lib/server/supabase.js', () => ({ supabaseAdmin: { rpc } }));
vi.mock('$lib/server/order-emails.js', () => ({ sendOrderEmail }));
vi.mock('$lib/server/notifications.js', () => ({ notifyBrandAdmins, createNotification }));
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
		]),
		staleTermsBrandIds: []
	}))
}));
vi.mock('$lib/server/orders/resolve-order-settings.js', () => ({
	resolveOrderSettings: vi.fn(
		async () => new Map([[BRAND, { owner_org_id: BRAND_ORG, accepted_payment_methods: [] }]])
	)
}));

// Minimum lookups are covered in order-minimum.test.ts; here each test says
// what the lookup returns. The default is no violations.
type Violation = {
	index: number;
	canOverride: boolean;
	message: string;
	brand_name?: string;
	minimum?: number;
	shortfall?: number;
};
const findMinimumViolations = vi.fn<(...args: unknown[]) => Promise<Violation[]>>(async () => []);
vi.mock('$lib/server/orders/order-minimum.js', () => ({
	findMinimumViolations,
	blockingViolations: (v: Violation[]) => v.filter((x) => !x.canOverride)
}));

const { submitOrder, submitOrderPayload } = await import('./submit-order');
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
	findMinimumViolations.mockReset();
	findMinimumViolations.mockResolvedValue([]);
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

describe('submitOrderPayload (shared with POST /api/sync/orders)', () => {
	const payload = (over: Record<string, unknown> = {}) => ({
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
	});

	it('returns the written orders instead of redirecting', async () => {
		rpc.mockResolvedValue({
			data: [{ order_id: orderId, order_number: 'A-1', inserted: true }],
			error: null
		});
		expect(await submitOrderPayload(payload(), locals(), 'https://app.test')).toEqual({
			ok: true,
			orders: [{ id: orderId, order_number: 'A-1', inserted: true }]
		});
	});

	it('reports a validation failure as a 400 outcome', async () => {
		const out = await submitOrderPayload(payload({ lines: [] }), locals(), '');
		expect(out).toMatchObject({ ok: false, status: 400 });
		expect(rpc).not.toHaveBeenCalled();
	});

	it('maps an id collision to 409, not a server error', async () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		rpc.mockResolvedValue({ data: null, error: { code: '23505', message: 'dup' } });
		expect(await submitOrderPayload(payload(), locals(), '')).toMatchObject({
			ok: false,
			status: 409
		});
		spy.mockRestore();
	});

	it('marks a replay so the caller knows nothing new was written', async () => {
		rpc.mockResolvedValue({
			data: [{ order_id: orderId, order_number: 'A-1', inserted: false }],
			error: null
		});
		const out = await submitOrderPayload(payload(), locals(), '');
		expect(out).toMatchObject({ ok: true, orders: [{ inserted: false }] });
		expect(sendOrderEmail).not.toHaveBeenCalled();
	});
});

const { authorizeSubmitPayload } = await import('$lib/server/orders/authorize-submit.js');

describe('drift on captured orders (SCO-209)', () => {
	const captured = (unit_price: number, over: Record<string, unknown> = {}) => ({
		submission_id: SUBMISSION,
		type: 'order',
		account_id: ACCOUNT,
		freeform_name: null,
		order_year: 2026,
		submitStatus: 'submitted',
		payment_preference: null,
		lines: [
			{
				product_id: PRODUCT,
				brand_id: BRAND,
				season_id: null,
				color: 'Black',
				size: 'M',
				qty: 2,
				unit_price
			}
		],
		groups: [{ brand_id: BRAND, season_id: null, delivery: null, location_id: null }],
		...over
	});

	beforeEach(() => createNotification.mockClear());

	it('saves a captured order as a draft when a price moved, and tells the rep once', async () => {
		rpc.mockResolvedValue({
			data: [{ order_id: orderId, order_number: 'A-1', inserted: true }],
			error: null
		});
		const out = await submitOrderPayload(captured(8), locals(), '', { captured: true });
		expect(rpc.mock.calls[0][1].p_orders[0].status).toBe('draft');
		expect(out).toMatchObject({
			ok: true,
			drift: { reason: 'Saved as a draft: prices changed on 1 line since it was written.' }
		});
		expect(createNotification).toHaveBeenCalledTimes(1);
		expect(createNotification.mock.calls[0][0]).toMatchObject({
			userId: USER,
			type: 'order_needs_review',
			link: `/orders/${orderId}`
		});
		// A draft goes nowhere yet: no email, notification to the brand or event.
		expect(sendOrderEmail).not.toHaveBeenCalled();
		expect(notifyBrandAdmins).not.toHaveBeenCalled();
	});

	it('submits as written when nothing moved', async () => {
		rpc.mockResolvedValue({
			data: [{ order_id: orderId, order_number: 'A-1', inserted: true }],
			error: null
		});
		const out = await submitOrderPayload(captured(10), locals(), '', { captured: true });
		expect(rpc.mock.calls[0][1].p_orders[0].status).toBe('submitted');
		expect(out).not.toHaveProperty('drift');
		expect(createNotification).not.toHaveBeenCalled();
	});

	it('leaves the online path alone: server price, no draft', async () => {
		rpc.mockResolvedValue({
			data: [{ order_id: orderId, order_number: 'A-1', inserted: true }],
			error: null
		});
		await submitOrderPayload(captured(8), locals(), '');
		expect(rpc.mock.calls[0][1].p_orders[0].status).toBe('submitted');
		expect(vi.mocked(authorizeSubmitPayload).mock.calls.at(-1)?.[3]).toMatchObject({
			staleTerms: 'deny'
		});
	});

	it('collects replaced terms instead of refusing a captured order', async () => {
		vi.mocked(authorizeSubmitPayload).mockResolvedValueOnce({
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
			]),
			staleTermsBrandIds: [BRAND]
		});
		rpc.mockResolvedValue({
			data: [{ order_id: orderId, order_number: 'A-1', inserted: true }],
			error: null
		});
		const out = await submitOrderPayload(captured(10), locals(), '', { captured: true });
		expect(vi.mocked(authorizeSubmitPayload).mock.calls.at(-1)?.[3]).toMatchObject({
			staleTerms: 'collect'
		});
		expect(rpc.mock.calls[0][1].p_orders[0].status).toBe('draft');
		expect(out).toMatchObject({
			drift: { reason: 'Saved as a draft: a brand updated its terms.' }
		});
	});

	it('does not notify again on a replay', async () => {
		rpc.mockResolvedValue({
			data: [{ order_id: orderId, order_number: 'A-1', inserted: false }],
			error: null
		});
		await submitOrderPayload(captured(8), locals(), '', { captured: true });
		expect(createNotification).not.toHaveBeenCalled();
	});
});

describe('brand minimum (SCO-137)', () => {
	const UNDER =
		"This order is $480.00 under Acme's $500.00 minimum. Save it as a draft and Acme can approve it.";
	const payload = (over: Record<string, unknown> = {}) => ({
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
	});
	const written = {
		data: [{ order_id: orderId, order_number: 'A-1', inserted: true }],
		error: null
	};

	beforeEach(() => createNotification.mockClear());

	it('rejects an online submit under the minimum and writes nothing', async () => {
		findMinimumViolations.mockResolvedValue([
			{
				index: 0,
				canOverride: false,
				message: UNDER,
				brand_name: 'Acme',
				minimum: 500,
				shortfall: 480
			}
		]);
		const out = await submitOrderPayload(payload(), locals(), '');
		expect(out).toEqual({
			ok: false,
			status: 400,
			message: `${UNDER} Save it as a draft for Acme to review.`
		});
		expect(rpc).not.toHaveBeenCalled();
	});

	it('saves a captured order under the minimum as a draft and tells the rep', async () => {
		findMinimumViolations.mockResolvedValue([
			{
				index: 0,
				canOverride: false,
				message: UNDER,
				brand_name: 'Acme',
				minimum: 500,
				shortfall: 480
			}
		]);
		rpc.mockResolvedValue(written);
		const out = await submitOrderPayload(payload(), locals(), '', { captured: true });
		expect(rpc.mock.calls[0][1].p_orders[0]).toMatchObject({ status: 'draft', submitted_at: null });
		expect(out).toMatchObject({
			ok: true,
			drift: { reason: `${UNDER} Save it as a draft for Acme to review.` }
		});
		expect(createNotification).toHaveBeenCalledTimes(1);
		expect(sendOrderEmail).not.toHaveBeenCalled();
	});

	it("lets the brand's own org submit under its minimum", async () => {
		findMinimumViolations.mockResolvedValue([{ index: 0, canOverride: true, message: 'note' }]);
		rpc.mockResolvedValue(written);
		const out = await submitOrderPayload(payload(), locals(), '');
		expect(out).toMatchObject({ ok: true });
		expect(rpc.mock.calls[0][1].p_orders[0].status).toBe('submitted');
	});

	it('does not check drafts or notes', async () => {
		rpc.mockResolvedValue(written);
		await submitOrderPayload(payload({ submitStatus: 'draft' }), locals(), '');
		await submitOrderPayload(payload({ type: 'note' }), locals(), '');
		for (const call of findMinimumViolations.mock.calls) expect(call[1]).toEqual([]);
	});

	it('tells a buyer what to add instead of offering a draft', async () => {
		findMinimumViolations.mockResolvedValue([
			{
				index: 0,
				canOverride: false,
				message: UNDER,
				brand_name: 'Acme',
				minimum: 500,
				shortfall: 480
			}
		]);
		const buyer = { ...locals(), isBuyer: true, membership: null } as unknown as App.Locals;
		const out = await submitOrderPayload(payload(), buyer, '');
		expect(out).toEqual({
			ok: false,
			status: 400,
			message: "Add $480.00 to reach Acme's $500.00 minimum."
		});
	});

	it('checks a buyer with no override, even inside the brand org', async () => {
		rpc.mockResolvedValue(written);
		const buyer = { ...locals(), isBuyer: true, membership: null } as unknown as App.Locals;
		await submitOrderPayload(payload(), buyer, '');
		expect(findMinimumViolations.mock.calls[0][2]).toBeNull();
	});

	it('checks submitted orders as the acting org', async () => {
		rpc.mockResolvedValue(written);
		await submitOrderPayload(payload(), locals(), '');
		const [, orders, actorOrgId] = findMinimumViolations.mock.calls[0];
		expect(orders).toEqual([{ brand_id: BRAND, account_id: ACCOUNT, total_amount: 20 }]);
		expect(actorOrgId).toBe(ORG);
	});
});
