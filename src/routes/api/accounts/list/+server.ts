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

	// Visible org IDs — asymmetric federation for accounts:
	//   Rep orgs: own + all connected brand/rep orgs (implicit).
	//   Brand orgs: own + only rep accounts explicitly linked via federated_account_links.
	const isBrandOrg = locals.orgType === 'brand';
	const { data: connections } = await supabaseAdmin
		.from('org_connections')
		.select('rep_org_id, brand_org_id')
		.eq('status', 'active')
		.or(`rep_org_id.eq.${organization.id},brand_org_id.eq.${organization.id}`);

	const connectedOrgIds = new Set<string>([organization.id]);
	let federatedAccountIds: string[] = [];

	if (isBrandOrg) {
		for (const c of connections ?? []) {
			if (c.brand_org_id) connectedOrgIds.add(c.brand_org_id);
		}
		const { data: linkedAccounts } = await supabaseAdmin
			.from('federated_account_links')
			.select('account_id')
			.eq('target_org_id', organization.id);
		federatedAccountIds = (linkedAccounts ?? []).map((r) => r.account_id);
	} else {
		for (const c of connections ?? []) {
			if (c.rep_org_id) connectedOrgIds.add(c.rep_org_id);
			if (c.brand_org_id) connectedOrgIds.add(c.brand_org_id);
		}
	}
	const visibleOrgIds = Array.from(connectedOrgIds);

	let query = supabaseAdmin
		.from('accounts')
		.select('*, territories(name)', { count: 'exact' })
		.order('created_at', { ascending: false })
		.range(offset, offset + limit - 1);

	if (isBrandOrg && federatedAccountIds.length > 0) {
		const orgList = visibleOrgIds.join(',');
		const idList = federatedAccountIds.join(',');
		query = query.or(`organization_id.in.(${orgList}),id.in.(${idList})`);
	} else {
		query = query.in('organization_id', visibleOrgIds);
	}

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
