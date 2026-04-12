import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	const { session, organization } = locals;

	if (!session || !organization) {
		return json({ count: 0 });
	}

	const today = new Date().toISOString().slice(0, 10);
	const isSales = locals.membership?.role === 'sales';

	let query = locals.supabase
		.from('appointments')
		.select('*', { count: 'exact', head: true })
		.eq('organization_id', organization.id)
		.eq('status', 'scheduled')
		.gte('scheduled_date', today);

	if (isSales) {
		query = query.eq('created_by', locals.user?.id);
	}

	const { count } = await query;

	return json({ count: count ?? 0 });
};
