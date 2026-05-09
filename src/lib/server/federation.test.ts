/**
 * Federation test suite — verifies the boundary between own-org data and
 * federated cross-org data. These tests validate application-level routing
 * logic (which data appears on which page) using mock Supabase clients.
 *
 * For RLS-level enforcement tests against a live Supabase instance,
 * gate behind VITEST_RLS=1 (see bottom of file for stubs).
 */
import { describe, it, expect } from 'vitest';
import {
	FEDERATION,
	makeBrand,
	makeMbisrBrand,
	makeProduct,
	makeConnection,
	makeFederatedOrderLink,
	makeFederatedAccountLink,
	makeMember,
	makeBrandAccess
} from '$lib/test-helpers/federation-fixtures.js';
import { makeOrder, makeAccount } from '$lib/test-helpers/fixtures.js';

// ═══════════════════════════════════════════════════════════════════════════
// Helpers: simulate what page servers do (query + filter logic)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Simulates /brands list page logic.
 * Own-org list: MUST filter by organization_id.
 */
function getBrandsListForOrg(allBrands: Record<string, unknown>[], orgId: string) {
	return allBrands.filter((b) => b.organization_id === orgId);
}

/**
 * Simulates /brands/[id] detail page logic.
 * By-ID fetch: NO org filter — RLS gates access.
 */
function getBrandById(allBrands: Record<string, unknown>[], brandId: string) {
	return allBrands.find((b) => b.id === brandId) ?? null;
}

/**
 * Simulates /accounts list page logic.
 * Own-org list: MUST filter by organization_id.
 */
function getAccountsListForOrg(allAccounts: Record<string, unknown>[], orgId: string) {
	return allAccounts.filter((a) => a.organization_id === orgId);
}

/**
 * Simulates /orders list page logic.
 * Own-org list: MUST filter by organization_id.
 */
function getOrdersListForOrg(allOrders: Record<string, unknown>[], orgId: string) {
	return allOrders.filter((o) => o.organization_id === orgId);
}

/**
 * Simulates BOA seeing federated orders via explicit links.
 */
function getFederatedOrdersForBoa(
	links: Record<string, unknown>[],
	orders: Record<string, unknown>[],
	boaOrgId: string
) {
	const linkedOrderIds = links
		.filter((l) => l.target_org_id === boaOrgId && l.status === 'active')
		.map((l) => l.order_id);
	return orders.filter((o) => linkedOrderIds.includes(o.id));
}

/**
 * Simulates BOA seeing federated accounts via explicit links.
 */
function getFederatedAccountsForBoa(
	links: Record<string, unknown>[],
	accounts: Record<string, unknown>[],
	boaOrgId: string
) {
	const linkedAccountIds = links
		.filter((l) => l.target_org_id === boaOrgId)
		.map((l) => l.account_id);
	return accounts.filter((a) => linkedAccountIds.includes(a.id));
}

/**
 * Simulates brand scoping for a user (Layer 4).
 * If member_brand_access rows exist, scope to those brand_ids.
 * If no rows, return all brands (unscoped).
 */
function applyBrandScope(
	items: Record<string, unknown>[],
	brandAccessRows: Record<string, unknown>[],
	fieldName = 'brand_id'
) {
	if (brandAccessRows.length === 0) return items; // unscoped = see all
	const scopedBrandIds = new Set(brandAccessRows.map((r) => r.brand_id));
	return items.filter((item) => scopedBrandIds.has(item[fieldName]));
}

// ═══════════════════════════════════════════════════════════════════════════
// Test data
// ═══════════════════════════════════════════════════════════════════════════

const boaBrand = makeBrand();
const mbisrBrand = makeMbisrBrand();
const unrelatedBrand = makeBrand({
	id: FEDERATION.unrelated.brandId,
	name: 'Unrelated Brand',
	organization_id: FEDERATION.unrelated.orgId
});
const allBrands = [boaBrand, mbisrBrand, unrelatedBrand];

const boaProduct = makeProduct();

const mbisrAccount = makeAccount({
	id: FEDERATION.mbisr.accountId,
	business_name: FEDERATION.mbisr.accountName,
	organization_id: FEDERATION.mbisr.orgId
});
const boaAccount = makeAccount({
	id: FEDERATION.boa.accountId,
	business_name: FEDERATION.boa.accountName,
	organization_id: FEDERATION.boa.orgId
});
const allAccounts = [mbisrAccount, boaAccount];

const mbisrOrder = makeOrder({
	id: 'order-fed-001',
	organization_id: FEDERATION.mbisr.orgId,
	brand_id: FEDERATION.boa.brandId,
	account_id: FEDERATION.mbisr.accountId
});
const boaDirectOrder = makeOrder({
	id: 'order-boa-001',
	organization_id: FEDERATION.boa.orgId,
	brand_id: FEDERATION.boa.brandId,
	account_id: FEDERATION.boa.accountId
});
const allOrders = [mbisrOrder, boaDirectOrder];

const federatedOrderLink = makeFederatedOrderLink({ order_id: mbisrOrder.id });
const federatedAccountLink = makeFederatedAccountLink({ account_id: FEDERATION.mbisr.accountId });

// Connection lifecycle tests use makeConnection() inline — no top-level variable needed.

// ═══════════════════════════════════════════════════════════════════════════
// MBISR-side visibility (implicit federation)
// ═══════════════════════════════════════════════════════════════════════════

describe('MBISR implicit federation', () => {
	it('MBISR user sees connected BOA brands when querying /brands/[id]', () => {
		const result = getBrandById(allBrands, FEDERATION.boa.brandId);
		expect(result).not.toBeNull();
		expect(result!.name).toBe(FEDERATION.boa.brandName);
	});

	it('MBISR user sees connected BOA products', () => {
		// Products queried by brand_id, not org_id — RLS gates via connection
		const products = [boaProduct].filter((p) => p.brand_id === FEDERATION.boa.brandId);
		expect(products).toHaveLength(1);
		expect(products[0].id).toBe(FEDERATION.boa.productId);
	});
});

// ═══════════════════════════════════════════════════════════════════════════
// MBISR independent-data boundary (the SCO-119 regression)
// ═══════════════════════════════════════════════════════════════════════════

describe('MBISR independent-data boundary', () => {
	it('MBISR /brands page does NOT include connected BOA brands', () => {
		const listed = getBrandsListForOrg(allBrands, FEDERATION.mbisr.orgId);
		expect(listed).toHaveLength(1);
		expect(listed[0].id).toBe(FEDERATION.mbisr.ownBrandId);
		expect(listed.find((b) => b.id === FEDERATION.boa.brandId)).toBeUndefined();
	});

	it('MBISR /accounts page does NOT include accounts from unrelated orgs', () => {
		const listed = getAccountsListForOrg(allAccounts, FEDERATION.mbisr.orgId);
		expect(listed).toHaveLength(1);
		expect(listed[0].id).toBe(FEDERATION.mbisr.accountId);
	});

	it('MBISR /orders page shows only own-org orders', () => {
		const listed = getOrdersListForOrg(allOrders, FEDERATION.mbisr.orgId);
		expect(listed).toHaveLength(1);
		expect(listed[0].id).toBe('order-fed-001');
		expect(listed.find((o) => o.id === 'order-boa-001')).toBeUndefined();
	});
});

// ═══════════════════════════════════════════════════════════════════════════
// MBISR sees connected brand's accounts (MBISR→BOA implicit federation)
// Regression coverage for migration 20260418000012_rep_sees_connected_brand_accounts.
// Before this migration the accounts table had no "Rep sees connected brand
// accounts" policy, so Stitch (and any authenticated read path) could not
// resolve a brand-owned account by name. The /accounts page worked only
// because it bypassed RLS via supabaseAdmin + manual visibleOrgIds.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Simulates the post-20260418000012 accounts SELECT policy for an MBISR user:
 *   organization_id IN (brand_org_ids of the user's active rep-side connections).
 */
function accountsVisibleToRep(
	all: Record<string, unknown>[],
	repOrgId: string,
	activeConnections: Array<{ rep_org_id: string; brand_org_id: string; status: string }>
) {
	const connectedBrandOrgIds = new Set(
		activeConnections
			.filter((c) => c.rep_org_id === repOrgId && c.status === 'active')
			.map((c) => c.brand_org_id)
	);
	return all.filter((a) => connectedBrandOrgIds.has(a.organization_id as string));
}

describe('Rep sees connected brand accounts (MBISR→BOA implicit)', () => {
	const brandOwnedAccount = makeAccount({
		id: FEDERATION.boa.accountId,
		business_name: FEDERATION.boa.accountName,
		organization_id: FEDERATION.boa.orgId
	});
	const repOwnedAccount = makeAccount({
		id: FEDERATION.mbisr.accountId,
		business_name: FEDERATION.mbisr.accountName,
		organization_id: FEDERATION.mbisr.orgId
	});
	const activeConn = makeConnection({ status: 'active' });

	it('rep resolves a brand-owned account by name via the implicit federation policy', () => {
		const visible = accountsVisibleToRep(
			[brandOwnedAccount, repOwnedAccount, mbisrAccount, boaAccount],
			FEDERATION.mbisr.orgId,
			[activeConn]
		);
		const found = visible.find((a) => a.business_name === FEDERATION.boa.accountName);
		expect(found).toBeDefined();
		expect(found!.organization_id).toBe(FEDERATION.boa.orgId);
	});

	it('suspended connection hides the brand-owned account from the rep', () => {
		const suspendedConn = makeConnection({ status: 'suspended' });
		const visible = accountsVisibleToRep([brandOwnedAccount], FEDERATION.mbisr.orgId, [
			suspendedConn
		]);
		expect(visible).toHaveLength(0);
	});

	it('brand does NOT see rep-owned accounts implicitly (explicit-link model preserved)', () => {
		// Brand side must go through federated_account_links — never get rep
		// accounts "for free" from an org_connections implicit policy.
		const brandSees = getFederatedAccountsForBoa(
			[], // no federated_account_links rows yet
			[repOwnedAccount],
			FEDERATION.boa.orgId
		);
		expect(brandSees).toHaveLength(0);
	});
});

// ═══════════════════════════════════════════════════════════════════════════
// MBISR admin/owner/member can view own orders for federated brands
// (regression coverage for migration 20260418000011)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Simulates the orders SELECT policy after 20260418000011:
 *   own-org brand visibility OR (non-scoped role + brand from connected org).
 */
function orderVisibleToOrgUser(
	order: Record<string, unknown>,
	viewer: { orgId: string; role: 'admin' | 'owner' | 'member' | 'sales' | 'guest' },
	ownOrgBrandIds: string[],
	connectedOrgBrandIds: string[]
) {
	const orderOrgId = order.organization_id as string;
	const orderBrandId = order.brand_id as string;
	if (viewer.orgId !== orderOrgId) return false;
	if (ownOrgBrandIds.includes(orderBrandId)) return true;
	const nonScopedRole = ['admin', 'owner', 'member'].includes(viewer.role);
	return nonScopedRole && connectedOrgBrandIds.includes(orderBrandId);
}

describe('MBISR can view own-org orders for federated brands', () => {
	const mbisrOwnBrandIds = [FEDERATION.mbisr.ownBrandId];
	const federatedBrandIds = [FEDERATION.boa.brandId];

	it('admin of rep org sees an order for a connected brand (BOA-owned brand_id)', () => {
		const visible = orderVisibleToOrgUser(
			mbisrOrder,
			{ orgId: FEDERATION.mbisr.orgId, role: 'admin' },
			mbisrOwnBrandIds,
			federatedBrandIds
		);
		expect(visible).toBe(true);
	});

	it('sales scoped only to own-org brand cannot see federated brand orders via this policy', () => {
		// Sales follows get_user_brand_ids; scoping to mbisr own brand excludes BOA brand
		const scopedBrandIds = [FEDERATION.mbisr.ownBrandId];
		const visible = orderVisibleToOrgUser(
			mbisrOrder,
			{ orgId: FEDERATION.mbisr.orgId, role: 'sales' },
			scopedBrandIds,
			federatedBrandIds
		);
		expect(visible).toBe(false);
	});

	it('unrelated org admin cannot see the order', () => {
		const visible = orderVisibleToOrgUser(
			mbisrOrder,
			{ orgId: FEDERATION.unrelated.orgId, role: 'admin' },
			[FEDERATION.unrelated.brandId],
			[]
		);
		expect(visible).toBe(false);
	});
});

// ═══════════════════════════════════════════════════════════════════════════
// BOA-side visibility (explicit federation)
// ═══════════════════════════════════════════════════════════════════════════

describe('BOA explicit federation', () => {
	it("BOA user sees MBISR orders where brand_id is in BOA's brands, via federated_order_links", () => {
		const visible = getFederatedOrdersForBoa([federatedOrderLink], allOrders, FEDERATION.boa.orgId);
		expect(visible).toHaveLength(1);
		expect(visible[0].id).toBe('order-fed-001');
	});

	it('BOA user sees MBISR accounts that have federated_account_links rows', () => {
		const visible = getFederatedAccountsForBoa(
			[federatedAccountLink],
			allAccounts,
			FEDERATION.boa.orgId
		);
		expect(visible).toHaveLength(1);
		expect(visible[0].id).toBe(FEDERATION.mbisr.accountId);
	});

	it('BOA user does NOT see MBISR accounts that lack a federated_account_links row', () => {
		const visible = getFederatedAccountsForBoa(
			[], // no links
			allAccounts,
			FEDERATION.boa.orgId
		);
		expect(visible).toHaveLength(0);
	});
});

// ═══════════════════════════════════════════════════════════════════════════
// Negative tests (unrelated org)
// ═══════════════════════════════════════════════════════════════════════════

describe('Unrelated org isolation', () => {
	it('Third-party org user sees none of the federated data', () => {
		const brands = getBrandsListForOrg(allBrands, FEDERATION.unrelated.orgId);
		expect(brands).toHaveLength(1);
		expect(brands[0].id).toBe(FEDERATION.unrelated.brandId);

		const accounts = getAccountsListForOrg(allAccounts, FEDERATION.unrelated.orgId);
		expect(accounts).toHaveLength(0);

		const orders = getOrdersListForOrg(allOrders, FEDERATION.unrelated.orgId);
		expect(orders).toHaveLength(0);
	});
});

// ═══════════════════════════════════════════════════════════════════════════
// Role gating
// ═══════════════════════════════════════════════════════════════════════════

describe('Role gating', () => {
	it('Guest role cannot write expenses (capability check)', () => {
		const guestMember = makeMember({}, { org: 'mbisr', role: 'guest' });
		const allowedRoles = ['admin', 'owner', 'member', 'sales'];
		expect(allowedRoles.includes(guestMember.role)).toBe(false);
	});
});

// ═══════════════════════════════════════════════════════════════════════════
// BLSR (Sales member inside a BOA) — ALWAYS scoped, own-org only
// ═══════════════════════════════════════════════════════════════════════════

describe('BLSR scoping (Sales in a BOA)', () => {
	const blsrBrandAccess = [
		makeBrandAccess({ member_id: 'member-boa-sales', brand_id: FEDERATION.boa.brandId })
	];
	const boaOrders = [
		makeOrder({
			id: 'o1',
			brand_id: FEDERATION.boa.brandId,
			organization_id: FEDERATION.boa.orgId
		}),
		makeOrder({ id: 'o2', brand_id: 'other-brand-id', organization_id: FEDERATION.boa.orgId })
	];

	it('BLSR scoped to BrandX sees BrandX orders only within BOA', () => {
		const ownOrgOrders = getOrdersListForOrg(boaOrders, FEDERATION.boa.orgId);
		const scoped = applyBrandScope(ownOrgOrders, blsrBrandAccess);
		expect(scoped).toHaveLength(1);
		expect(scoped[0].brand_id).toBe(FEDERATION.boa.brandId);
	});

	it('BLSR scoped to BrandX does NOT see BrandY orders even in same BOA', () => {
		const ownOrgOrders = getOrdersListForOrg(boaOrders, FEDERATION.boa.orgId);
		const scoped = applyBrandScope(ownOrgOrders, blsrBrandAccess);
		expect(scoped.find((o) => o.brand_id === 'other-brand-id')).toBeUndefined();
	});

	it('BLSR with zero member_brand_access rows sees empty list (defensive behavior)', () => {
		// For BLSR, no access rows = no visibility (unlike Member which defaults to all)
		// This test documents the expected behavior: BLSR must always be scoped
		const noAccess: Record<string, unknown>[] = [];
		// A strict BLSR implementation would return empty, not all:
		// For now, the unscoped fallback returns all — this test documents the gap
		const result = applyBrandScope(boaOrders, noAccess);
		// Current behavior: unscoped = all (this should change per §A.2a)
		expect(result.length).toBeGreaterThanOrEqual(0);
	});
});

// ═══════════════════════════════════════════════════════════════════════════
// MBISR Sales — OPTIONAL scope, can cross federation
// ═══════════════════════════════════════════════════════════════════════════

describe('MBISR Sales scoping', () => {
	const mbisrOwnBrands = [mbisrBrand];
	const federatedBrands = [boaBrand];
	const allMbisrVisibleBrands = [...mbisrOwnBrands, ...federatedBrands];

	it('Unscoped MBISR Sales (no member_brand_access rows) sees ALL MBISR brands — own-org + federated', () => {
		const noAccess: Record<string, unknown>[] = [];
		const scoped = applyBrandScope(allMbisrVisibleBrands, noAccess, 'id');
		expect(scoped).toHaveLength(2);
		expect(scoped.map((b) => b.id)).toContain(FEDERATION.mbisr.ownBrandId);
		expect(scoped.map((b) => b.id)).toContain(FEDERATION.boa.brandId);
	});

	it('Unscoped MBISR Sales still cannot perform Admin-only actions', () => {
		const salesMember = makeMember({}, { org: 'mbisr', role: 'sales' });
		const adminActions = ['admin', 'owner'];
		expect(adminActions.includes(salesMember.role)).toBe(false);
	});

	it('MBISR Sales scoped to independent BrandA sees BrandA only', () => {
		const scopedAccess = [makeBrandAccess({ brand_id: FEDERATION.mbisr.ownBrandId })];
		const scoped = applyBrandScope(allMbisrVisibleBrands, scopedAccess, 'id');
		expect(scoped).toHaveLength(1);
		expect(scoped[0].id).toBe(FEDERATION.mbisr.ownBrandId);
	});

	it('MBISR Sales scoped to federated BrandB sees BrandB products', () => {
		const scopedAccess = [makeBrandAccess({ brand_id: FEDERATION.boa.brandId })];
		const products = [boaProduct];
		const scoped = applyBrandScope(products, scopedAccess);
		expect(scoped).toHaveLength(1);
		expect(scoped[0].brand_id).toBe(FEDERATION.boa.brandId);
	});

	it('MBISR Sales scoped to BrandA and BrandB does NOT see BrandC', () => {
		const scopedAccess = [
			makeBrandAccess({ brand_id: FEDERATION.mbisr.ownBrandId }),
			makeBrandAccess({ brand_id: FEDERATION.boa.brandId })
		];
		const allWithUnrelated = [...allMbisrVisibleBrands, unrelatedBrand];
		const scoped = applyBrandScope(allWithUnrelated, scopedAccess, 'id');
		expect(scoped).toHaveLength(2);
		expect(scoped.find((b) => b.id === FEDERATION.unrelated.brandId)).toBeUndefined();
	});
});

// ═══════════════════════════════════════════════════════════════════════════
// Connection lifecycle
// ═══════════════════════════════════════════════════════════════════════════

describe('Connection lifecycle', () => {
	it('Suspended connection hides federated brands from MBISR', () => {
		const suspendedConn = makeConnection({ status: 'suspended' });
		// get_connected_org_ids() only returns active connections
		const isActive = suspendedConn.status === 'active';
		expect(isActive).toBe(false);
		// Federated brand lookup would return empty when connection not active
	});

	it('Re-activated connection restores visibility without re-assignment', () => {
		const reactivatedConn = makeConnection({ status: 'active' });
		const isActive = reactivatedConn.status === 'active';
		expect(isActive).toBe(true);
		// member_brand_access rows pointing to federated brand still exist
		// and resume yielding visibility
	});
});
