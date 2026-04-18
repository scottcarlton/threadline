import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase.js';

// Account search with federation awareness. Returns accounts owned by the
// viewer's org OR by any org with an active connection to the viewer's org.
export const GET: RequestHandler = async ({ locals, url }) => {
	const { organization } = locals;
	if (!organization) throw error(401, 'No organization context');

	const q = (url.searchParams.get('q') ?? '').trim();
	const limit = Math.min(Number(url.searchParams.get('limit') ?? 30), 100);

	// Collect viewer's org + active-connection orgs (both directions).
	const { data: conns } = await supabaseAdmin
		.from('org_connections')
		.select('rep_org_id, brand_org_id')
		.eq('status', 'active')
		.or(`rep_org_id.eq.${organization.id},brand_org_id.eq.${organization.id}`);

	const orgIds = new Set<string>([organization.id]);
	for (const c of conns ?? []) {
		if (c.rep_org_id && c.rep_org_id !== organization.id) orgIds.add(c.rep_org_id);
		if (c.brand_org_id && c.brand_org_id !== organization.id) orgIds.add(c.brand_org_id);
	}

	let query = supabaseAdmin
		.from('accounts')
		.select('id, business_name, contact_email, address_line1, address_line2, city, state, zip')
		.in('organization_id', Array.from(orgIds))
		.eq('is_active', true)
		.is('archived_at', null)
		.order('business_name')
		.limit(limit);

	if (q) query = query.ilike('business_name', `%${q}%`);

	const { data, error: qErr } = await query;
	if (qErr) throw error(500, qErr.message);

	return json({ accounts: data ?? [] });
};
