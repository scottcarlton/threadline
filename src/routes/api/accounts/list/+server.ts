import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase.js';

const PAGE_SIZE = 50;

export const GET: RequestHandler = async ({ url, locals }) => {
	const { organization } = locals;
	if (!locals.session || !organization) return json({ accounts: [], hasMore: false });

	const offset = parseInt(url.searchParams.get('offset') ?? '0');
	const limit = parseInt(url.searchParams.get('limit') ?? String(PAGE_SIZE));
	const search = url.searchParams.get('search')?.trim() ?? '';
	const showArchived = url.searchParams.get('archived') === 'true';

	// Visible org IDs (own + connected)
	const { data: connections } = await supabaseAdmin
		.from('org_connections')
		.select('rep_org_id, brand_org_id')
		.eq('status', 'active')
		.or(`rep_org_id.eq.${organization.id},brand_org_id.eq.${organization.id}`);

	const connectedOrgIds = new Set<string>([organization.id]);
	for (const c of connections ?? []) {
		if (c.rep_org_id && c.rep_org_id !== organization.id) connectedOrgIds.add(c.rep_org_id);
		if (c.brand_org_id && c.brand_org_id !== organization.id) connectedOrgIds.add(c.brand_org_id);
	}
	const visibleOrgIds = Array.from(connectedOrgIds);

	let query = supabaseAdmin
		.from('accounts')
		.select('*, territories(name)', { count: 'exact' })
		.in('organization_id', visibleOrgIds)
		.order('business_name')
		.range(offset, offset + limit - 1);

	if (!showArchived) {
		query = query.is('archived_at', null);
	}

	if (search) {
		const pattern = `%${search}%`;
		query = query.or(
			`business_name.ilike.${pattern},contact_first_name.ilike.${pattern},contact_last_name.ilike.${pattern},city.ilike.${pattern},state.ilike.${pattern}`
		);
	}

	const { data, count } = await query;
	const accounts = data ?? [];
	const totalCount = count ?? accounts.length;

	return json({ accounts, hasMore: offset + limit < totalCount });
};
