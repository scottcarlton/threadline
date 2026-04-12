import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.session || !locals.user || !locals.organization) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const { supabase } = locals;
	const orgId = locals.organization.id;

	// Fetch contacts from accounts, brands, and discovered_contacts in parallel
	const [accountsRes, brandsRes, discoveredRes] = await Promise.all([
		supabase
			.from('accounts')
			.select('contact_first_name, contact_last_name, contact_email')
			.eq('organization_id', orgId)
			.not('contact_email', 'is', null),
		supabase
			.from('brands')
			.select('contact_first_name, contact_last_name, contact_email')
			.eq('organization_id', orgId)
			.not('contact_email', 'is', null),
		supabase
			.from('discovered_contacts')
			.select('name, email')
			.eq('organization_id', orgId)
	]);

	// Deduplicate by email
	const contactMap = new Map<string, { email: string; name: string }>();

	for (const a of accountsRes.data ?? []) {
		if (a.contact_email) {
			const email = a.contact_email.toLowerCase();
			if (!contactMap.has(email)) {
				contactMap.set(email, { email, name: [a.contact_first_name, a.contact_last_name].filter(Boolean).join(' ') });
			}
		}
	}

	for (const b of brandsRes.data ?? []) {
		if (b.contact_email) {
			const email = b.contact_email.toLowerCase();
			if (!contactMap.has(email)) {
				contactMap.set(email, { email, name: [b.contact_first_name, b.contact_last_name].filter(Boolean).join(' ') });
			}
		}
	}

	for (const d of discoveredRes.data ?? []) {
		const email = d.email.toLowerCase();
		if (!contactMap.has(email)) {
			contactMap.set(email, { email, name: d.name ?? '' });
		}
	}

	const contacts = Array.from(contactMap.values()).sort((a, b) =>
		(a.name || a.email).localeCompare(b.name || b.email)
	);

	return json({ contacts });
};
