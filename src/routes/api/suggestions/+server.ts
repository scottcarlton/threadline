import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase.js';
import { getNxBlsrBrandOrgIds, isNxBlsr } from '$lib/server/nx-blsr';

export const GET: RequestHandler = async ({ locals, url }) => {
	const { organization, allMemberships } = locals;
	if (!organization) throw error(401, 'No organization context');

	const q = (url.searchParams.get('q') ?? '').trim();
	if (q.length < 2) return json({ suggestions: [] });

	const type = url.searchParams.get('type') ?? 'accounts';
	const limit = Math.min(Number(url.searchParams.get('limit') ?? 6), 20);

	const brandOrgIds = getNxBlsrBrandOrgIds(allMemberships);
	const nxBlsr = isNxBlsr(brandOrgIds);
	const ownOrgIds = nxBlsr ? brandOrgIds : [organization.id];
	const ownOrgIdSet = new Set(ownOrgIds);

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

	const visibleOrgIds = Array.from(orgIds);

	if (type === 'accounts') {
		const { data } = await supabaseAdmin
			.from('accounts')
			.select('id, business_name')
			.in('organization_id', visibleOrgIds)
			.eq('is_active', true)
			.is('archived_at', null)
			.ilike('business_name', `%${q}%`)
			.order('business_name')
			.limit(limit);

		return json({
			suggestions: (data ?? []).map((a) => ({ id: a.id, name: a.business_name }))
		});
	}

	if (type === 'products') {
		const { data } = await locals.supabase
			.from('products')
			.select('id, name, style_number')
			.eq('is_active', true)
			.is('archived_at', null)
			.or(`style_number.ilike.%${q}%,name.ilike.%${q}%`)
			.order('style_number')
			.limit(limit);

		return json({
			suggestions: (data ?? []).map((p) => ({
				id: p.id,
				name: p.name
			}))
		});
	}

	return json({ suggestions: [] });
};
