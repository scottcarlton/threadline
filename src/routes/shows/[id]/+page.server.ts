import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	const { supabase, organization } = locals;

	const [showResult, seasonsResult] = await Promise.all([
		supabase
			.from('shows')
			.select('*, seasons(name)')
			.eq('id', params.id)
			.single(),
		supabase
			.from('seasons')
			.select('*')
			.eq('organization_id', organization!.id)
			.eq('is_active', true)
			.order('sort_order')
	]);

	if (showResult.error || !showResult.data) {
		throw error(404, 'Show not found');
	}

	return {
		show: showResult.data,
		seasons: seasonsResult.data ?? []
	};
};
