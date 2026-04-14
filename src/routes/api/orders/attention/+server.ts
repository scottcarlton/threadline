import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	const { supabase, organization } = locals;
	if (!organization) return json({ count: 0 });

	const orgId = organization.id;
	const now = new Date();
	const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
	const todayStr = now.toISOString().split('T')[0];

	// Attention badge shows work that needs attention from SOMEONE ELSE.
	// Orders the current user created themselves are excluded — they already
	// know about them.
	const currentUserId = locals.user?.id;

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

	if (currentUserId) {
		staleDraftsQuery = staleDraftsQuery.neq('created_by', currentUserId);
		overdueQuery = overdueQuery.neq('created_by', currentUserId);
	}

	// Sales role: since we already exclude self-created orders, and sales can
	// only see their own anyway, this always comes back as 0 for sales. Keep
	// the role check in case that scope ever changes.
	if (locals.membership?.role === 'sales' && currentUserId) {
		staleDraftsQuery = staleDraftsQuery.eq('created_by', currentUserId);
		overdueQuery = overdueQuery.eq('created_by', currentUserId);
	}

	const [staleDraftsRes, overdueRes] = await Promise.all([staleDraftsQuery, overdueQuery]);

	return json({
		count: (staleDraftsRes.count ?? 0) + (overdueRes.count ?? 0)
	});
};
