import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	const { supabase } = locals;

	const { data: account, error: err } = await supabase
		.from('accounts')
		.select('*')
		.eq('id', params.id)
		.single();

	if (err || !account) {
		throw error(404, 'Account not found');
	}

	return { account };
};
