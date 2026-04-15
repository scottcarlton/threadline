import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	const { supabase } = locals;

	const { data: show, error: err } = await supabase
		.from('shows')
		.select('*, show_dates(*)')
		.eq('id', params.id)
		.single();

	if (err || !show) {
		throw error(404, 'Show not found');
	}

	// Load documents for all show dates
	const dateIds = (show.show_dates ?? []).map((d: { id: string }) => d.id);
	const documents: Record<string, any[]> = {};
	if (dateIds.length > 0) {
		const { data: docs } = await supabase
			.from('show_date_documents')
			.select('*')
			.in('show_date_id', dateIds)
			.order('created_at', { ascending: false });
		for (const doc of docs ?? []) {
			if (!documents[doc.show_date_id]) documents[doc.show_date_id] = [];
			documents[doc.show_date_id].push(doc);
		}
	}

	return { show, documents };
};
