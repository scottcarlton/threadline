import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.session || !locals.user || !locals.organization) {
		return json({ brands: [] });
	}

	const { data: brands } = await locals.supabase
		.from('brands')
		.select('id, name')
		.eq('organization_id', locals.organization.id)
		.eq('is_active', true)
		.order('name');

	return json({ brands: brands ?? [] });
};
