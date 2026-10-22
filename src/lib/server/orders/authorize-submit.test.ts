import { describe, it, expect, vi } from 'vitest';
import type { SubmitPayload } from '$lib/schemas/order-submit';
import type { OrderScope } from './order-scope';
import type { SubmitRefs } from './authorize-submit';

vi.mock('$lib/server/supabase.js', () => ({ supabaseAdmin: {} }));

const { checkSubmitReferences, collectReferencedIds } = await import('./authorize-submit');

// Real v4 UUIDs: Zod's uuid validator checks version/variant bits.
const OWN_ORG = '0a000000-0000-4000-8000-000000000001';
const BRAND_ORG = '0b000000-0000-4000-8000-000000000002';
const FOREIGN_ORG = '0f000000-0000-4000-8000-000000000003';
const USER = 'a5e00000-0000-4000-8000-000000000001';
const REP = 'a5e00000-0000-4000-8000-000000000002';
const BRAND = 'b0000000-0000-4000-8000-000000000001';
const FOREIGN_BRAND = 'b0000000-0000-4000-8000-000000000009';
const ACCOUNT = 'ac000000-0000-4000-8000-000000000001';
const LOC = '10c00000-0000-4000-8000-000000000001';
const OTHER_ACCOUNT_LOC = '10c00000-0000-4000-8000-000000000002';
const PRODUCT = 'b0d00000-0000-4000-8000-000000000001';
const SEASON = '5ea00000-0000-4000-8000-000000000001';
const DELIVERY = 'de100000-0000-4000-8000-000000000001';
const SHOW_DATE = '5d000000-0000-4000-8000-000000000001';
const SOURCE = '50c00000-0000-4000-8000-000000000001';
const TERMS = '7e000000-0000-4000-8000-000000000001';

const scope = (over: Partial<OrderScope> = {}): OrderScope => ({
	ownOrgIds: [OWN_ORG],
	visibleOrgIds: [OWN_ORG, BRAND_ORG],
	repVisibleOrgIds: [OWN_ORG, BRAND_ORG],
	connectedBrandOrgIds: new Set([BRAND_ORG]),
	connectedRepOrgIds: new Set(),
	isBuyer: false,
	buyerAccountIds: null,
	buyerBrandIds: null,
	isBrandOrg: false,
	...over
});

const refs = (over: Partial<SubmitRefs> = {}): SubmitRefs => ({
	brands: new Map([
		[BRAND, { organization_id: BRAND_ORG, is_active: true }],
		[FOREIGN_BRAND, { organization_id: FOREIGN_ORG, is_active: true }]
	]),
	accounts: new Map([[ACCOUNT, { organization_id: OWN_ORG, is_active: true, archived_at: null }]]),
	locations: new Map([
		[LOC, { account_id: ACCOUNT }],
		[OTHER_ACCOUNT_LOC, { account_id: 'ac000000-0000-4000-8000-000000000099' }]
	]),
	products: new Map([
		[
			PRODUCT,
			{ brand_id: BRAND, wholesale_price: 42, style_number: 'ST-1', name: 'Tee', archived_at: null }
		]
	]),
	seasons: new Map([[SEASON, { organization_id: BRAND_ORG }]]),
	deliveries: new Map([[DELIVERY, { season_id: SEASON }]]),
	showDates: new Map([[SHOW_DATE, { organization_id: OWN_ORG }]]),
	sourceTypes: new Map([[SOURCE, { organization_id: OWN_ORG }]]),
	terms: new Map([[TERMS, { brand_id: BRAND, is_current: true }]]),
	repMemberships: [],
	...over
});

const payload = (over: Partial<SubmitPayload> = {}): SubmitPayload => ({
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
			season_id: SEASON,
			color: 'Black',
			size: 'M',
			qty: 3,
			unit_price: 42
		}
	],
	groups: [
		{
			brand_id: BRAND,
			season_id: SEASON,
			delivery: { kind: 'delivery', delivery_id: DELIVERY },
			location_id: LOC
		}
	],
	finalize: null,
	...over
});

const finalize = (over: Record<string, unknown> = {}) =>
	({
		submit_mode: 'order',
		account_id: ACCOUNT,
		freeform_name: undefined,
		contact_location_id: null,
		rep_user_id: USER,
		source_type_id: null,
		show_date_id: null,
		orders: [
			{
				brand_id: BRAND,
				season_id: SEASON,
				ship_to_location_id: LOC,
				bill_to_location_id: null,
				payment_preference: null,
				payment_terms: null,
				shipping_method: null,
				po_number: undefined,
				internal_note: undefined
			}
		],
		brand_agreements: [{ brand_id: BRAND, terms_id: TERMS, agreed: true }],
		...over
	}) as SubmitPayload['finalize'];

const ctx = { userId: USER, orgId: OWN_ORG };
const check = (p = payload(), r = refs(), s = scope()) => checkSubmitReferences(p, r, s, ctx);

describe('checkSubmitReferences', () => {
	it('accepts an in-scope payload and returns product rows for pricing', () => {
		const res = check(payload({ finalize: finalize() }));
		expect(res.ok).toBe(true);
		if (res.ok) expect(res.products.get(PRODUCT)?.wholesale_price).toBe(42);
	});

	it('rejects an account outside the visible orgs', () => {
		const r = refs({
			accounts: new Map([
				[ACCOUNT, { organization_id: FOREIGN_ORG, is_active: true, archived_at: null }]
			])
		});
		expect(check(payload(), r)).toMatchObject({ ok: false, status: 403 });
	});

	it('rejects an archived or inactive account', () => {
		const archived = refs({
			accounts: new Map([
				[ACCOUNT, { organization_id: OWN_ORG, is_active: true, archived_at: '2026-01-01' }]
			])
		});
		const inactive = refs({
			accounts: new Map([
				[ACCOUNT, { organization_id: OWN_ORG, is_active: false, archived_at: null }]
			])
		});
		expect(check(payload(), archived)).toMatchObject({ ok: false, status: 403 });
		expect(check(payload(), inactive)).toMatchObject({ ok: false, status: 403 });
	});

	it('rejects an account id that does not exist', () => {
		expect(check(payload(), refs({ accounts: new Map() }))).toMatchObject({
			ok: false,
			status: 403
		});
	});

	it('rejects a brand from an unconnected org', () => {
		const p = payload({
			lines: [{ ...payload().lines[0], brand_id: FOREIGN_BRAND }],
			groups: [{ ...payload().groups[0], brand_id: FOREIGN_BRAND }]
		});
		expect(check(p)).toMatchObject({ ok: false, status: 403 });
	});

	it('rejects a product that belongs to a different brand than its line', () => {
		const r = refs({
			products: new Map([
				[
					PRODUCT,
					{
						brand_id: FOREIGN_BRAND,
						wholesale_price: 1,
						style_number: null,
						name: null,
						archived_at: null
					}
				]
			])
		});
		expect(check(payload(), r)).toMatchObject({ ok: false, status: 403 });
	});

	it('rejects an archived product with 409 and names it', () => {
		const r = refs({
			products: new Map([
				[
					PRODUCT,
					{
						brand_id: BRAND,
						wholesale_price: 42,
						style_number: 'ST-1',
						name: 'Tee',
						archived_at: '2026-01-01'
					}
				]
			])
		});
		const res = check(payload(), r);
		expect(res).toMatchObject({ ok: false, status: 409 });
		if (!res.ok) expect(res.message).toContain('Tee');
	});

	it('rejects a season owned by a different org than the brand', () => {
		const r = refs({ seasons: new Map([[SEASON, { organization_id: OWN_ORG }]]) });
		expect(check(payload(), r)).toMatchObject({ ok: false, status: 403 });
	});

	it('rejects a delivery window from another season', () => {
		const r = refs({
			deliveries: new Map([[DELIVERY, { season_id: '5ea00000-0000-4000-8000-000000000002' }]])
		});
		expect(check(payload(), r)).toMatchObject({ ok: false, status: 400 });
	});

	it('rejects a ship-to location from another account', () => {
		const p = payload({ groups: [{ ...payload().groups[0], location_id: OTHER_ACCOUNT_LOC }] });
		expect(check(p)).toMatchObject({ ok: false, status: 403 });
	});

	it('checks finalize bill-to and contact locations too', () => {
		const f = finalize({ contact_location_id: OTHER_ACCOUNT_LOC });
		expect(check(payload({ finalize: f }))).toMatchObject({ ok: false, status: 403 });
	});

	it('rejects any location on an order without an account', () => {
		const p = payload({ account_id: null, freeform_name: 'Walk-in' });
		expect(check(p)).toMatchObject({ ok: false, status: 400 });
	});

	it('rejects a finalize account that differs from the order account', () => {
		const f = finalize({ account_id: 'ac000000-0000-4000-8000-000000000002' });
		expect(check(payload({ finalize: f }))).toMatchObject({ ok: false, status: 400 });
	});

	it('allows the writer to assign themselves as rep without a membership lookup', () => {
		expect(check(payload({ finalize: finalize({ rep_user_id: USER }) })).ok).toBe(true);
	});

	it('allows an eligible rep from a connected brand org (BLSR)', () => {
		const r = refs({
			repMemberships: [{ profile_id: REP, role: 'sales', organization_id: BRAND_ORG }]
		});
		expect(check(payload({ finalize: finalize({ rep_user_id: REP }) }), r).ok).toBe(true);
	});

	it('rejects a brand-org admin as rep, matching the picker', () => {
		const r = refs({
			repMemberships: [{ profile_id: REP, role: 'admin', organization_id: BRAND_ORG }]
		});
		expect(check(payload({ finalize: finalize({ rep_user_id: REP }) }), r)).toMatchObject({
			ok: false,
			status: 403
		});
	});

	it('rejects a rep with no membership in a visible org', () => {
		expect(check(payload({ finalize: finalize({ rep_user_id: REP }) }))).toMatchObject({
			ok: false,
			status: 403
		});
	});

	it('rejects a show date or source type from another org', () => {
		const r = refs({
			showDates: new Map([[SHOW_DATE, { organization_id: BRAND_ORG }]]),
			sourceTypes: new Map([[SOURCE, { organization_id: BRAND_ORG }]])
		});
		expect(check(payload({ finalize: finalize({ show_date_id: SHOW_DATE }) }), r)).toMatchObject({
			ok: false,
			status: 403
		});
		expect(check(payload({ finalize: finalize({ source_type_id: SOURCE }) }), r)).toMatchObject({
			ok: false,
			status: 403
		});
	});

	it('accepts own-org show date and source type', () => {
		expect(check(payload({ finalize: finalize({ show_date_id: SHOW_DATE }) })).ok).toBe(true);
		expect(check(payload({ finalize: finalize({ source_type_id: SOURCE }) })).ok).toBe(true);
	});

	it('rejects terms that belong to another brand', () => {
		const r = refs({ terms: new Map([[TERMS, { brand_id: FOREIGN_BRAND, is_current: true }]]) });
		expect(check(payload({ finalize: finalize() }), r)).toMatchObject({ ok: false, status: 400 });
	});

	it('rejects superseded terms with 409 so the writer re-reads them', () => {
		const r = refs({ terms: new Map([[TERMS, { brand_id: BRAND, is_current: false }]]) });
		expect(check(payload({ finalize: finalize() }), r)).toMatchObject({ ok: false, status: 409 });
	});

	it('reports superseded terms instead of refusing, for an order captured offline', () => {
		const r = refs({ terms: new Map([[TERMS, { brand_id: BRAND, is_current: false }]]) });
		expect(
			checkSubmitReferences(payload({ finalize: finalize() }), r, scope(), {
				...ctx,
				staleTerms: 'collect'
			})
		).toMatchObject({ ok: true, staleTermsBrandIds: [BRAND] });
	});

	describe('buyers', () => {
		const buyer = scope({
			isBuyer: true,
			visibleOrgIds: [OWN_ORG],
			buyerAccountIds: [ACCOUNT],
			buyerBrandIds: [BRAND]
		});

		it('accepts their own account and permitted brand', () => {
			expect(check(payload({ finalize: finalize() }), refs(), buyer).ok).toBe(true);
		});

		it('rejects an account they are not linked to', () => {
			expect(check(payload(), refs(), scope({ ...buyer, buyerAccountIds: [] }))).toMatchObject({
				ok: false,
				status: 403
			});
		});

		it('rejects a brand without account_brand_access', () => {
			expect(check(payload(), refs(), scope({ ...buyer, buyerBrandIds: [] }))).toMatchObject({
				ok: false,
				status: 403
			});
		});

		it('rejects creating a freeform account', () => {
			const p = payload({
				account_id: null,
				freeformDetails: {
					business_name: 'New Store',
					contact_first_name: '',
					contact_last_name: '',
					contact_email: '',
					phone: '',
					address_line1: '',
					city: '',
					state: '',
					zip: ''
				}
			});
			expect(check(p, refs(), buyer)).toMatchObject({ ok: false, status: 403 });
		});

		it('rejects assigning anyone but themselves as rep', () => {
			const r = refs({
				repMemberships: [{ profile_id: REP, role: 'sales', organization_id: BRAND_ORG }]
			});
			expect(check(payload({ finalize: finalize({ rep_user_id: REP }) }), r, buyer)).toMatchObject({
				ok: false,
				status: 403
			});
		});

		it('rejects a show or source', () => {
			expect(
				check(payload({ finalize: finalize({ source_type_id: SOURCE }) }), refs(), buyer)
			).toMatchObject({
				ok: false,
				status: 403
			});
		});
	});
});

describe('collectReferencedIds', () => {
	it('gathers every location from groups and finalize, deduplicated', () => {
		const ids = collectReferencedIds(payload({ finalize: finalize({ contact_location_id: LOC }) }));
		expect(ids.locationIds).toEqual([LOC]);
		expect(ids.deliveryIds).toEqual([DELIVERY]);
		expect(ids.termsIds).toEqual([TERMS]);
		expect(ids.repUserId).toBe(USER);
	});
});
