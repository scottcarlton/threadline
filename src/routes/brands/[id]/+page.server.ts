import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	const { supabase } = locals;

	const { data: brand, error: err } = await supabase
		.from('brands')
		.select('*')
		.eq('id', params.id)
		.single();

	if (err || !brand) {
		throw error(404, 'Brand not found');
	}

	return { brand };
};
