import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const orgType = locals.organization?.org_type ?? null;
	return { orgType };
};
