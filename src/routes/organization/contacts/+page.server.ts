import type { PageServerLoad } from './$types';
import { supabaseAdmin } from '$lib/server/supabase.js';

export const load: PageServerLoad = async ({ locals }) => {
	const { supabase, organization, orgType } = locals;
	if (!organization) return { knownContacts: [], discoveredContacts: [] };

	// Brand orgs' own `brands` rows represent themselves — surfacing them as
	// contacts is self-referential noise. Only include brand contacts for rep
	// orgs, whose `brands` table holds the partners they represent.
	const includeBrandContacts = orgType === 'rep';

	// Federation view: accounts are contacts-of-record on both sides of an
	// active org_connection (MBISR ↔ Brand). A rep connected to a brand should
	// see contacts for that brand's accounts, and vice versa — the accounts are
	// shared context between the two orgs. Scope by active connections; rely on
	// supabaseAdmin for cross-org reads (authenticated SSR client can't reliably
	// attach session to RLS in this version of @supabase/ssr).
	const { data: conns } = await supabaseAdmin
		.from('org_connections')
		.select('rep_org_id, brand_org_id')
		.eq('status', 'active')
		.or(`rep_org_id.eq.${organization.id},brand_org_id.eq.${organization.id}`);
	const visibleOrgIdSet = new Set<string>([organization.id]);
	for (const c of conns ?? []) {
		if (c.rep_org_id && c.rep_org_id !== organization.id) visibleOrgIdSet.add(c.rep_org_id);
		if (c.brand_org_id && c.brand_org_id !== organization.id) visibleOrgIdSet.add(c.brand_org_id);
	}
	const visibleOrgIds = Array.from(visibleOrgIdSet);

	const [accountsRes, brandsRes, discoveredRes] = await Promise.all([
		supabaseAdmin
			.from('accounts')
			.select('id, business_name, contact_first_name, contact_last_name, contact_email, phone')
			.in('organization_id', visibleOrgIds)
			.is('archived_at', null)
			.not('contact_email', 'is', null)
			.order('contact_first_name'),
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
