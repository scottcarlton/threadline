import type { OrderScope } from './order-scope.js';

export type ScopedMember = { profile_id: string; role: string; organization_id: string };

const REP_ROLES = new Set(['admin', 'owner', 'sales']);

/**
 * The Sales Rep picker's eligibility rule (see permissions map §A.4, `/orders/new`):
 * BLSR (`sales` in a brand org), MBISR (`admin`/`owner` in a rep org) and MBLSR
 * (`sales` in a rep org). A brand-org viewer's own org is `sales`-only, the same
 * as a connected brand.
 */
export function isEligibleRep(
	m: ScopedMember,
	scope: Pick<OrderScope, 'connectedBrandOrgIds' | 'connectedRepOrgIds' | 'isBrandOrg'>,
	orgId: string
): boolean {
	if (m.organization_id === orgId) {
		return scope.isBrandOrg ? m.role === 'sales' : REP_ROLES.has(m.role);
	}
	if (scope.connectedBrandOrgIds.has(m.organization_id)) return m.role === 'sales';
	if (scope.connectedRepOrgIds.has(m.organization_id)) return REP_ROLES.has(m.role);
	return false;
}
