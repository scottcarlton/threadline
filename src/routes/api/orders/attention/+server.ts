import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	const { supabase, organization } = locals;
	if (!organization) return json({ count: 0 });

	const orgId = organization.id;
	const now = new Date();
	const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
	const todayStr = now.toISOString().split('T')[0];

	let staleDraftsQuery = supabase
		.from('orders')
		.select('id', { count: 'exact', head: true })
		.eq('organization_id', orgId)
		.eq('status', 'draft')
		.lte('created_at', sevenDaysAgo);

	let overdueQuery = supabase
		.from('orders')
		.select('id', { count: 'exact', head: true })
		.eq('organization_id', orgId)
		.in('status', ['submitted', 'confirmed'])
		.lt('expected_ship_date', todayStr);

	// Sales users only see their own orders
	if (locals.membership?.role === 'sales') {
		const userId = locals.user?.id;
		if (userId) {
			staleDraftsQuery = staleDraftsQuery.eq('created_by', userId);
			overdueQuery = overdueQuery.eq('created_by', userId);
		}
	}

	const [staleDraftsRes, overdueRes] = await Promise.all([staleDraftsQuery, overdueQuery]);

	return json({
		count: (staleDraftsRes.count ?? 0) + (overdueRes.count ?? 0)
	});
};
