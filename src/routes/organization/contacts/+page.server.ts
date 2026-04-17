import type { PageServerLoad } from './$types';
import { supabaseAdmin } from '$lib/server/supabase.js';
import { getConnectedBrandOrgIds } from '$lib/server/federation.js';

export const load: PageServerLoad = async ({ locals }) => {
	const { supabase, organization } = locals;
	if (!organization) return { knownContacts: [], discoveredContacts: [] };

	// Fetch connected brand org IDs for federation (rep orgs only)
	const connectedOrgIds =
		locals.orgType === 'rep' ? await getConnectedBrandOrgIds(supabaseAdmin, organization.id) : [];

	const [accountsRes, brandsRes, fedBrandsRes, discoveredRes] = await Promise.all([
		supabase
			.from('accounts')
			.select('id, business_name, contact_first_name, contact_last_name, contact_email, phone')
			.eq('organization_id', organization.id)
			.not('contact_email', 'is', null)
			.order('contact_first_name'),
		supabase
			.from('brands')
			.select('id, name, contact_first_name, contact_last_name, contact_email, contact_phone')
			.eq('organization_id', organization.id)
			.not('contact_email', 'is', null)
			.order('contact_first_name'),
		connectedOrgIds.length > 0
			? supabaseAdmin
					.from('brands')
					.select('id, name, contact_first_name, contact_last_name, contact_email, contact_phone')
					.in('organization_id', connectedOrgIds)
					.not('contact_email', 'is', null)
					.order('contact_first_name')
			: Promise.resolve({ data: [] }),
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

	// Own-org brands + federated brands
	const allBrands = [...(brandsRes.data ?? []), ...(fedBrandsRes.data ?? [])];
	for (const b of allBrands) {
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

	// Also check for discovered contacts that match known contact emails
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

	// Check for duplicate emails within discovered contacts
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
