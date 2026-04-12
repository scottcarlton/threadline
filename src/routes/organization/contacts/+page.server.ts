import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const { supabase, organization } = locals;
	if (!organization) return { knownContacts: [], discoveredContacts: [] };

	const [accountsRes, brandsRes, discoveredRes] = await Promise.all([
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

	return {
		knownContacts,
		discoveredContacts: discoveredRes.data ?? []
	};
};
