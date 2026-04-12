import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const { organization } = locals;

	return {
		org: organization
			? { id: organization.id, name: organization.name, logo_url: organization.logo_url }
			: null
	};
};
