import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const { supabase, organization, orgType } = locals;

	if (!organization) throw redirect(303, '/insight');

	// Only brand orgs use the /reps page
	if (orgType !== 'brand') {
		throw redirect(303, '/insight');
	}

	const orgId = organization.id;

	// Get org members (internal reps — members with sales/member roles)
	const { data: members } = await supabase
		.from('organization_members')
		.select('*, profiles(id, display_name, avatar_url)')
		.eq('organization_id', orgId)
		.in('role', ['sales', 'member', 'admin', 'owner']);

	// Get order stats per member (created_by)
	const { data: orders } = await supabase
		.from('orders')
		.select('created_by, total_amount, status')
		.eq('organization_id', orgId)
		.not('status', 'eq', 'cancelled');

	// Aggregate stats per member
	const memberStats = new Map<string, { orderCount: number; revenue: number }>();
	for (const order of orders ?? []) {
		const existing = memberStats.get(order.created_by) ?? { orderCount: 0, revenue: 0 };
		existing.orderCount++;
		existing.revenue += Number(order.total_amount);
		memberStats.set(order.created_by, existing);
	}

	const reps = (members ?? []).map((m: any) => ({
		id: m.id,
		profileId: m.profile_id,
		name: m.profiles?.display_name ?? 'Unknown',
		avatarUrl: m.profiles?.avatar_url ?? null,
		role: m.role,
		orderCount: memberStats.get(m.profile_id)?.orderCount ?? 0,
		revenue: memberStats.get(m.profile_id)?.revenue ?? 0
	}));

	return { reps };
};
