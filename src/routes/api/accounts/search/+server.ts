import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase.js';
import { getNxBlsrBrandOrgIds, isNxBlsr } from '$lib/server/nx-blsr';

// Account search with federation awareness. Returns accounts owned by the
// viewer's org OR by any org with an active connection to the viewer's org.
// Nx-BLSR (sales-role member of 2+ brand-orgs): "own org" is the union of
// every brand-org they belong to so accounts from any of those brands
// surface here. Federation expands across that union too.
export const GET: RequestHandler = async ({ locals, url }) => {
	const { organization, allMemberships } = locals;
	if (!organization) throw error(401, 'No organization context');

	const q = (url.searchParams.get('q') ?? '').trim();
	const limit = Math.min(Number(url.searchParams.get('limit') ?? 30), 100);

	const brandOrgIds = getNxBlsrBrandOrgIds(allMemberships);
	const nxBlsr = isNxBlsr(brandOrgIds);
	const ownOrgIds = nxBlsr ? brandOrgIds : [organization.id];
	const ownOrgIdSet = new Set(ownOrgIds);

	// Collect viewer's org(s) + active-connection orgs (both directions).
	const orFilter = ownOrgIds
		.flatMap((id) => [`rep_org_id.eq.${id}`, `brand_org_id.eq.${id}`])
		.join(',');
	const { data: conns } = await supabaseAdmin
		.from('org_connections')
		.select('rep_org_id, brand_org_id')
		.eq('status', 'active')
		.or(orFilter);

	const orgIds = new Set<string>(ownOrgIds);
	for (const c of conns ?? []) {
		if (c.rep_org_id && !ownOrgIdSet.has(c.rep_org_id)) orgIds.add(c.rep_org_id);
		if (c.brand_org_id && !ownOrgIdSet.has(c.brand_org_id)) orgIds.add(c.brand_org_id);
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
