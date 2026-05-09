import type { PageServerLoad } from './$types';
import { supabaseAdmin } from '$lib/server/supabase.js';

export const load: PageServerLoad = async ({ locals }) => {
	const { supabase, organization, orgType } = locals;
	if (!organization) return { knownContacts: [], discoveredContacts: [] };

	// Brand orgs' own `brands` rows represent themselves — surfacing them as
	// contacts is self-referential noise. Only include brand contacts for rep
	// orgs, whose `brands` table holds the partners they represent.
	const includeBrandContacts = orgType === 'rep';

	// Federation is asymmetric for accounts (and their contacts):
	//   Rep orgs see contacts from own + connected brand orgs (implicit).
	//   Brand orgs see contacts from own accounts + only rep accounts explicitly
	//   linked via federated_account_links.
	const isBrandOrg = orgType === 'brand';
	const { data: conns } = await supabaseAdmin
		.from('org_connections')
		.select('rep_org_id, brand_org_id')
		.eq('status', 'active')
		.or(`rep_org_id.eq.${organization.id},brand_org_id.eq.${organization.id}`);
	const visibleOrgIdSet = new Set<string>([organization.id]);
	let federatedAccountIds: string[] = [];

	if (isBrandOrg) {
		for (const c of conns ?? []) {
			if (c.brand_org_id) visibleOrgIdSet.add(c.brand_org_id);
		}
		const { data: linkedAccounts } = await supabaseAdmin
			.from('federated_account_links')
			.select('account_id')
			.eq('target_org_id', organization.id);
		federatedAccountIds = (linkedAccounts ?? []).map((r) => r.account_id);
	} else {
		for (const c of conns ?? []) {
			if (c.rep_org_id) visibleOrgIdSet.add(c.rep_org_id);
			if (c.brand_org_id) visibleOrgIdSet.add(c.brand_org_id);
		}
	}
	const visibleOrgIds = Array.from(visibleOrgIdSet);

	let accountsQuery = supabaseAdmin
		.from('accounts')
		.select('id, business_name, contact_first_name, contact_last_name, contact_email, phone')
		.is('archived_at', null)
		.not('contact_email', 'is', null)
		.order('contact_first_name');

	if (isBrandOrg && federatedAccountIds.length > 0) {
		const orgList = visibleOrgIds.join(',');
		const idList = federatedAccountIds.join(',');
		accountsQuery = accountsQuery.or(`organization_id.in.(${orgList}),id.in.(${idList})`);
	} else {
		accountsQuery = accountsQuery.in('organization_id', visibleOrgIds);
	}

	const [accountsRes, brandsRes, discoveredRes] = await Promise.all([
		accountsQuery,
		includeBrandContacts
			? supabase
					.from('brands')
					.select('id, name, contact_first_name, contact_last_name, contact_email, contact_phone')
					.eq('organization_id', organization.id)
					.not('contact_email', 'is', null)
					.order('contact_first_name')
			: Promise.resolve({ data: [] as never[] }),
		supabase
			.from('discovered_contacts')
			.select('*')
			.eq('organization_id', organization.id)
			.in('status', ['new', 'saved'])
			.order('last_seen_at', { ascending: false })
	]);

	type KnownContact = {
		id: string;
		name: string | null;
		email: string;
		phone: string | null;
		source: 'account' | 'brand';
		sourceId: string;
		sourceName: string;
	};

	const knownContacts: KnownContact[] = [];
	const seenEmails = new Set<string>();

	for (const a of accountsRes.data ?? []) {
		if (a.contact_email) {
			const key = a.contact_email.toLowerCase();
			if (!seenEmails.has(key)) {
				seenEmails.add(key);
				knownContacts.push({
					id: a.id,
					name: [a.contact_first_name, a.contact_last_name].filter(Boolean).join(' ') || null,
					email: a.contact_email,
					phone: a.phone,
					source: 'account',
					sourceId: a.id,
					sourceName: a.business_name
				});
			}
		}
	}

	for (const b of brandsRes.data ?? []) {
		if (b.contact_email) {
			const key = b.contact_email.toLowerCase();
			if (!seenEmails.has(key)) {
				seenEmails.add(key);
				knownContacts.push({
					id: b.id,
					name: [b.contact_first_name, b.contact_last_name].filter(Boolean).join(' ') || null,
					email: b.contact_email,
					phone: b.contact_phone,
					source: 'brand',
					sourceId: b.id,
					sourceName: b.name
				});
			}
		}
	}

	// Detect potential duplicates among discovered contacts
	const discovered = discoveredRes.data ?? [];
	const emailMap = new Map<string, string[]>();
	for (const d of discovered) {
		const key = d.email.toLowerCase();
		if (!emailMap.has(key)) emailMap.set(key, []);
		emailMap.get(key)!.push(d.id);
	}

	type DuplicateGroup = {
		email: string;
		contacts: { id: string; name: string | null; source: string }[];
	};
	const duplicates: DuplicateGroup[] = [];

	for (const d of discovered) {
		const key = d.email.toLowerCase();
		if (seenEmails.has(key)) {
			const known = knownContacts.find((k) => k.email.toLowerCase() === key);
			if (known) {
				duplicates.push({
					email: key,
					contacts: [
						{ id: d.id, name: d.name, source: 'discovered' },
						{ id: `${known.source}-${known.sourceId}`, name: known.name, source: known.source }
					]
				});
			}
		}
	}

	for (const [email, ids] of emailMap) {
		if (ids.length > 1) {
			duplicates.push({
				email,
				contacts: ids.map((id) => {
					const c = discovered.find((d) => d.id === id)!;
					return { id, name: c.name, source: 'discovered' };
				})
			});
		}
	}

	return {
		knownContacts,
		discoveredContacts: discovered,
		duplicates
	};
};
