import type { PageServerLoad } from './$types';
import { getNxBlsrBrandOrgIds, isNxBlsr } from '$lib/server/nx-blsr';

export const load: PageServerLoad = async ({ locals }) => {
	const brandOrgIds = getNxBlsrBrandOrgIds(locals.allMemberships);
	const nxBlsr = isNxBlsr(brandOrgIds);
	// Nx-BLSR users see the brand-side report set (sales-by-rep across their
	// brand-orgs, pipeline, account penetration, etc.) — same shape a single
	// brand admin/sales would see, just unioned at the data layer.
	return { orgType: nxBlsr ? 'brand' : locals.orgType };
};
