/**
 * Federation test fixtures — seed data representing a BOA + MBISR + unrelated org.
 *
 * Usage in tests:
 *   import { FEDERATION } from '$lib/test-helpers/federation-fixtures.js';
 *   // FEDERATION.mbisr.orgId, FEDERATION.boa.orgId, etc.
 *
 * For RLS-level tests against a live Supabase, gate behind VITEST_RLS=1:
 *   import { seedFederationFixture } from '$lib/test-helpers/federation-fixtures.js';
 */

/** Static IDs for deterministic test data */
export const FEDERATION = {
	mbisr: {
		orgId: 'mbisr-org-001',
		orgName: 'Acme Rep Agency',
		orgType: 'rep' as const,
		adminUserId: 'mbisr-admin-001',
		salesUserId: 'mbisr-sales-001',
		ownBrandId: 'mbisr-brand-001',
		ownBrandName: 'Acme In-House',
		accountId: 'mbisr-acct-001',
		accountName: 'Downtown Boutique'
	},
	boa: {
		orgId: 'boa-org-001',
		orgName: 'Demo Brand Co',
		orgType: 'brand' as const,
		adminUserId: 'boa-admin-001',
		salesUserId: 'boa-sales-001',
		brandId: 'boa-brand-001',
		brandName: 'Demo Brand',
		productId: 'boa-product-001',
		accountId: 'boa-acct-001',
		accountName: 'Bloom Boutique'
	},
	unrelated: {
		orgId: 'unrelated-org-001',
		orgName: 'Other Corp',
		orgType: 'rep' as const,
		adminUserId: 'unrelated-admin-001',
		brandId: 'unrelated-brand-001'
	},
	connection: {
		id: 'conn-001',
		status: 'active' as const
	}
} as const;

/** Factory: org_connections row */
export function makeConnection(overrides: Record<string, unknown> = {}) {
	return {
		id: FEDERATION.connection.id,
		rep_org_id: FEDERATION.mbisr.orgId,
		brand_org_id: FEDERATION.boa.orgId,
		status: FEDERATION.connection.status,
		commission_rate: null,
		connected_at: '2026-04-17T00:00:00Z',
		disconnected_at: null,
		created_at: '2026-04-17T00:00:00Z',
		...overrides
	};
}

/** Factory: organization row */
export function makeOrg(
	overrides: Record<string, unknown> = {},
	which: 'mbisr' | 'boa' | 'unrelated' = 'mbisr'
) {
	const base = FEDERATION[which];
	return {
		id: base.orgId,
		name: base.orgName,
		org_type: base.orgType,
		slug: base.orgName.toLowerCase().replace(/\s+/g, '-'),
		...overrides
	};
}

/** Factory: brand row */
export function makeBrand(overrides: Record<string, unknown> = {}) {
	return {
		id: FEDERATION.boa.brandId,
		name: FEDERATION.boa.brandName,
		organization_id: FEDERATION.boa.orgId,
		is_active: true,
		is_self_brand: true,
		...overrides
	};
}

/** Factory: MBISR's own brand */
export function makeMbisrBrand(overrides: Record<string, unknown> = {}) {
	return {
		id: FEDERATION.mbisr.ownBrandId,
		name: FEDERATION.mbisr.ownBrandName,
		organization_id: FEDERATION.mbisr.orgId,
		is_active: true,
		is_self_brand: true,
		...overrides
	};
}

/** Factory: product row belonging to BOA */
export function makeProduct(overrides: Record<string, unknown> = {}) {
	return {
		id: FEDERATION.boa.productId,
		brand_id: FEDERATION.boa.brandId,
		organization_id: FEDERATION.boa.orgId,
		name: 'Test Product',
		style_number: 'STY-001',
		is_active: true,
		...overrides
	};
}

/** Factory: federated_order_links row */
export function makeFederatedOrderLink(overrides: Record<string, unknown> = {}) {
	return {
		id: 'fol-001',
		order_id: 'order-fed-001',
		connection_id: FEDERATION.connection.id,
		source_org_id: FEDERATION.mbisr.orgId,
		target_org_id: FEDERATION.boa.orgId,
		status: 'active',
		created_at: '2026-04-17T00:00:00Z',
		...overrides
	};
}

/** Factory: federated_account_links row */
export function makeFederatedAccountLink(overrides: Record<string, unknown> = {}) {
	return {
		id: 'fal-001',
		account_id: FEDERATION.mbisr.accountId,
		connection_id: FEDERATION.connection.id,
		source_org_id: FEDERATION.mbisr.orgId,
		target_org_id: FEDERATION.boa.orgId,
		created_at: '2026-04-17T00:00:00Z',
		...overrides
	};
}

/** Factory: organization_members row */
export function makeMember(
	overrides: Record<string, unknown> = {},
	opts: { org: 'mbisr' | 'boa' | 'unrelated'; role: string } = { org: 'mbisr', role: 'admin' }
) {
	const orgId = FEDERATION[opts.org].orgId;
	const userId =
		opts.role === 'admin'
			? FEDERATION[opts.org].adminUserId
			: opts.org === 'mbisr'
				? FEDERATION.mbisr.salesUserId
				: FEDERATION.boa.salesUserId;
	return {
		id: `member-${opts.org}-${opts.role}`,
		organization_id: orgId,
		profile_id: userId,
		role: opts.role,
		accepted_at: '2026-01-01T00:00:00Z',
		...overrides
	};
}

/** Factory: member_brand_access row */
export function makeBrandAccess(overrides: Record<string, unknown> = {}) {
	return {
		id: 'mba-001',
		member_id: `member-mbisr-sales`,
		brand_id: FEDERATION.mbisr.ownBrandId,
		granted_by: FEDERATION.mbisr.adminUserId,
		...overrides
	};
}
