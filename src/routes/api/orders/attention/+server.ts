import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase.js';

/**
 * Orders badge count — "unviewed + unconfirmed" semantics.
 *
 * Counts orders the current user hasn't opened yet OR orders in `submitted`
 * status awaiting their confirm action (brand side only). Self-created orders
 * are excluded. Viewed state tracked in `order_views`.
 */
export const GET: RequestHandler = async ({ locals }) => {
	const { supabase, organization, orgType, membership } = locals;
	if (!organization || !locals.user?.id) return json({ count: 0 });

	const userId = locals.user.id;
	const role = membership?.role;

	// Sales roles only see their own orders → everything is self-created → always 0.
	if (role === 'sales') return json({ count: 0 });

	// ── (a) Unviewed orders in user's visibility scope, excluding self-created ──
	// RLS already scopes `orders` to what the user can see (own-org + federated).
	const { data: visible } = await supabase
		.from('orders')
		.select('id')
		.neq('created_by', userId);

	const { data: views } = await supabase
		.from('order_views')
		.select('order_id')
		.eq('profile_id', userId);
	const seen = new Set(((views ?? []) as Array<{ order_id: string }>).map((v) => v.order_id));

	const attentionIds = new Set<string>();
	for (const o of (visible ?? []) as Array<{ id: string }>) {
		if (!seen.has(o.id)) attentionIds.add(o.id);
	}

	// ── (b) Unconfirmed federated orders (brand admin/member/owner only) ──
	if (orgType === 'brand' && role && ['admin', 'owner', 'member'].includes(role)) {
		const { data: links } = await supabaseAdmin
			.from('federated_order_links')
			.select('order_id, orders!inner(status)')
			.eq('target_org_id', organization.id)
			.eq('status', 'active')
			.eq('orders.status', 'submitted');
		for (const l of (links ?? []) as Array<{ order_id: string }>) attentionIds.add(l.order_id);
	}

	return json({ count: attentionIds.size });
};
