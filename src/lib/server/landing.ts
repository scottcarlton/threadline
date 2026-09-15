import type { OrgType } from '$lib/types/database.js';

/**
 * Post-authentication landing path for an org member, keyed on org type.
 *
 * Retailer orgs are buyers — they land on the buyer portal (`/dashboard`).
 * Rep and brand orgs land on the main app (`/insight`). This is the single
 * source of truth shared by the `/login` redirect in hooks.server.ts and the
 * membership fork in auth/callback, so the two cannot drift.
 */
export function landingPathForOrgType(orgType: OrgType): '/dashboard' | '/insight' {
	return orgType === 'retailer' ? '/dashboard' : '/insight';
}
