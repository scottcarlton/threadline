import { describe, expect, it } from 'vitest';
import {
	freeEntryOrderOrgId,
	initialReturnStatus,
	ownershipFromFreeEntry,
	ownershipFromOrder,
	refuseOrderReturn,
	RETURN_REFUSAL_MESSAGES,
	type SourceOrderForReturn
} from './create-return.js';

const BRAND_ORG = 'org-brand';
const REP_ORG = 'org-rep';
const BRAND = 'brand-1';
const ACCOUNT = 'account-1';

const order = (over: Partial<SourceOrderForReturn> = {}): SourceOrderForReturn => ({
	id: 'order-1',
	organization_id: REP_ORG,
	brand_id: BRAND,
	account_id: ACCOUNT,
	status: 'delivered',
	delivered_at: '2026-09-01T00:00:00Z',
	...over
});

describe('initialReturnStatus', () => {
	it('approves when the issuing org creates it', () => {
		// The brand is the approver, so asking it to approve its own record is
		// theatre.
		expect(initialReturnStatus(BRAND_ORG, BRAND_ORG)).toBe('approved');
	});

	it('requests when a different org creates it', () => {
		expect(initialReturnStatus(REP_ORG, BRAND_ORG)).toBe('requested');
	});

	it('requests when a buyer creates it, who has no org at all', () => {
		expect(initialReturnStatus(null, BRAND_ORG)).toBe('requested');
	});

	it('keys on org membership, not org type', () => {
		// A rep org owning a manual brand locally IS the issuer for that brand's
		// returns, with no second party to ask.
		expect(initialReturnStatus(REP_ORG, REP_ORG)).toBe('approved');
	});
});

describe('freeEntryOrderOrgId', () => {
	it('carries the requesting org so that rep can see their own request', () => {
		expect(freeEntryOrderOrgId(REP_ORG, BRAND_ORG)).toBe(REP_ORG);
	});

	it('is null when the issuer raises it, since no rep is involved', () => {
		expect(freeEntryOrderOrgId(BRAND_ORG, BRAND_ORG)).toBeNull();
	});

	it('is null for a buyer', () => {
		expect(freeEntryOrderOrgId(null, BRAND_ORG)).toBeNull();
	});

	it('never equals the issuing org', () => {
		// The rep SELECT arm requires order_org_id <> organization_id, so an equal
		// value matches nothing while implying a relationship that is not there.
		for (const actor of [BRAND_ORG, REP_ORG, null]) {
			expect(freeEntryOrderOrgId(actor, BRAND_ORG)).not.toBe(BRAND_ORG);
		}
	});
});

describe('ownershipFromOrder', () => {
	it('owns the row to the brand org, not the order org', () => {
		// The single most important rule in this module. Getting it backwards
		// writes a row the wrong tenant can see.
		const o = ownershipFromOrder(order(), BRAND_ORG, REP_ORG);
		expect(o.organizationId).toBe(BRAND_ORG);
		expect(o.orderOrgId).toBe(REP_ORG);
	});

	it('copies brand and account off the order rather than the client', () => {
		const o = ownershipFromOrder(order(), BRAND_ORG, REP_ORG);
		expect(o.brandId).toBe(BRAND);
		expect(o.accountId).toBe(ACCOUNT);
	});

	it('approves when the brand org creates it', () => {
		expect(ownershipFromOrder(order(), BRAND_ORG, BRAND_ORG).status).toBe('approved');
	});

	it('requests when the rep creates it', () => {
		expect(ownershipFromOrder(order(), BRAND_ORG, REP_ORG).status).toBe('requested');
	});

	it('requests when a buyer creates it', () => {
		expect(ownershipFromOrder(order(), BRAND_ORG, null).status).toBe('requested');
	});

	it('sets order_org_id equal to organization_id on a brand-internal order', () => {
		// Which is correct: the rep arm excludes equal values, so a brand-internal
		// return is governed solely by the brand-scoped policy.
		const o = ownershipFromOrder(order({ organization_id: BRAND_ORG }), BRAND_ORG, BRAND_ORG);
		expect(o.orderOrgId).toBe(BRAND_ORG);
		expect(o.organizationId).toBe(BRAND_ORG);
	});
});

describe('ownershipFromFreeEntry', () => {
	it('owns the row to the brand org', () => {
		const o = ownershipFromFreeEntry(BRAND, BRAND_ORG, ACCOUNT, REP_ORG);
		expect(o.organizationId).toBe(BRAND_ORG);
		expect(o.brandId).toBe(BRAND);
		expect(o.accountId).toBe(ACCOUNT);
	});

	it('carries the rep org when a rep raises it', () => {
		expect(ownershipFromFreeEntry(BRAND, BRAND_ORG, ACCOUNT, REP_ORG).orderOrgId).toBe(REP_ORG);
	});

	it('leaves order_org_id null when the brand raises it', () => {
		expect(ownershipFromFreeEntry(BRAND, BRAND_ORG, ACCOUNT, BRAND_ORG).orderOrgId).toBeNull();
	});
});

describe('refuseOrderReturn', () => {
	const ok = { windowOk: true, windowReason: null } as const;

	it('allows a delivered order inside the window', () => {
		expect(refuseOrderReturn({ order: order(), isIssuer: false, ...ok })).toBeNull();
	});

	it('refuses an order that is not delivered', () => {
		for (const status of ['draft', 'submitted', 'confirmed', 'preparing', 'shipped', 'cancelled']) {
			expect(refuseOrderReturn({ order: order({ status }), isIssuer: false, ...ok })).toBe(
				'not_delivered'
			);
		}
	});

	it('refuses a shipped order even for the issuer', () => {
		// Delivered-only is a data rule, not a policy the brand can waive: a
		// shipped order has no delivery date to measure anything from.
		expect(refuseOrderReturn({ order: order({ status: 'shipped' }), isIssuer: true, ...ok })).toBe(
			'not_delivered'
		);
	});

	it('refuses an order with no account, since a credit needs a recipient', () => {
		expect(refuseOrderReturn({ order: order({ account_id: null }), isIssuer: true, ...ok })).toBe(
			'no_account'
		);
	});

	it('refuses when returns are disabled', () => {
		expect(
			refuseOrderReturn({
				order: order(),
				isIssuer: false,
				windowOk: false,
				windowReason: 'returns_disabled'
			})
		).toBe('returns_disabled');
	});

	it('refuses when the window has expired', () => {
		expect(
			refuseOrderReturn({
				order: order(),
				isIssuer: false,
				windowOk: false,
				windowReason: 'window_expired'
			})
		).toBe('window_expired');
	});

	it('lets the issuing brand past its own expired window', () => {
		// Brands waive their own policy routinely. A product that cannot express
		// the waiver just moves the return into email.
		expect(
			refuseOrderReturn({
				order: order(),
				isIssuer: true,
				windowOk: false,
				windowReason: 'window_expired'
			})
		).toBeNull();
	});

	it('lets the issuing brand past a zero window', () => {
		expect(
			refuseOrderReturn({
				order: order(),
				isIssuer: true,
				windowOk: false,
				windowReason: 'returns_disabled'
			})
		).toBeNull();
	});

	it('falls back to window_expired when no reason is supplied', () => {
		expect(
			refuseOrderReturn({ order: order(), isIssuer: false, windowOk: false, windowReason: null })
		).toBe('window_expired');
	});

	it('has a message for every refusal', () => {
		const reasons = ['not_delivered', 'returns_disabled', 'window_expired', 'no_account'] as const;
		for (const r of reasons) expect(RETURN_REFUSAL_MESSAGES[r]).toBeTruthy();
	});
});
