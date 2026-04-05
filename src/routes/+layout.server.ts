import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	return {
		session: locals.session,
		user: locals.user,
		membership: locals.membership,
		organization: locals.organization,
		brandScope: locals.brandScope
	};
};
