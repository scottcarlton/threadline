import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.session || !locals.user || !locals.organization) {
		return json({ brands: [] });
	}

	// RLS handles federation visibility — no admin client needed
	const { data: brands } = await locals.supabase
		.from('brands')
		.select('id, name')
		.eq('is_active', true)
		.order('name');

	return json({ brands: brands ?? [] });
};
