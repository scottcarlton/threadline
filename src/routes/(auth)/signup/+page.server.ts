import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const params = url.searchParams.toString();
	throw redirect(301, params ? `/login?${params}` : '/login');
};
