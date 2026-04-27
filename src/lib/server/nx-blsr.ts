import type { Organization, OrganizationMember } from '$lib/types/database';

type MembershipWithOrg = OrganizationMember & { organizations: Organization | null };

// A user added via "Add User" to multiple brand-orgs as `sales` is a Multi-Brand
// BLSR ("Nx-BLSR"). They have no rep-org membership and are not part of a
// federation; their unified portal is built by union over their brand-org IDs.
// See docs/brd/permissions-implementation-map.md and CLAUDE.md for federation
// boundaries — Nx-BLSR scoping never replaces federation, it sits beside it.
export function getNxBlsrBrandOrgIds(
	memberships: MembershipWithOrg[] | null | undefined
): string[] {
	return (memberships ?? [])
		.filter((m) => m?.organizations?.org_type === 'brand' && m?.role === 'sales')
		.map((m) => m.organization_id);
}

export function isNxBlsr(brandOrgIds: string[]): boolean {
	return brandOrgIds.length > 1;
}
