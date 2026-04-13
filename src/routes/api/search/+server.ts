import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export type SearchResult = {
	type: 'brand' | 'account' | 'order' | 'contact';
	id: string;
	title: string;
	subtitle: string;
	parentType?: 'account' | 'brand';
	parentName?: string;
	meta?: {
		seasonName?: string;
		orderYear?: number;
		status?: string;
	};
};

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.session || !locals.user || !locals.organization) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const { query } = await request.json();

	if (!query || typeof query !== 'string' || query.trim().length === 0) {
		return json({ results: [] });
	}

	const searchTerm = `%${query.trim()}%`;
	const orgId = locals.organization.id;
	const results: SearchResult[] = [];

	// Search contacts from accounts
	const { data: accountContacts } = await locals.supabase
		.from('accounts')
		.select('id, business_name, contact_first_name, contact_last_name, contact_email')
		.eq('organization_id', orgId)
		.or(`contact_first_name.not.is.null,contact_last_name.not.is.null`)
		.or(
			`contact_first_name.ilike.${searchTerm},contact_last_name.ilike.${searchTerm},contact_email.ilike.${searchTerm}`
		)
		.limit(3);

	if (accountContacts) {
		for (const a of accountContacts) {
			const contactName = [a.contact_first_name, a.contact_last_name].filter(Boolean).join(' ');
			if (contactName) {
				results.push({
					type: 'contact',
					id: a.id,
					title: contactName,
					subtitle: a.contact_email ?? '',
					parentType: 'account',
					parentName: a.business_name
				});
			}
		}
	}

	// Search contacts from brands
	const { data: brandContacts } = await locals.supabase
		.from('brands')
		.select('id, name, contact_first_name, contact_last_name, contact_email')
		.eq('organization_id', orgId)
		.or(`contact_first_name.not.is.null,contact_last_name.not.is.null`)
		.or(
			`contact_first_name.ilike.${searchTerm},contact_last_name.ilike.${searchTerm},contact_email.ilike.${searchTerm}`
		)
		.limit(3);

	if (brandContacts) {
		for (const b of brandContacts) {
			const contactName = [b.contact_first_name, b.contact_last_name].filter(Boolean).join(' ');
			if (contactName) {
				results.push({
					type: 'contact',
					id: b.id,
					title: contactName,
					subtitle: b.contact_email ?? '',
					parentType: 'brand',
					parentName: b.name
				});
			}
		}
	}

	// Search saved discovered contacts
	const { data: discoveredContacts } = await locals.supabase
		.from('discovered_contacts')
		.select('id, name, email, status')
		.eq('organization_id', orgId)
		.eq('status', 'saved')
		.or(`name.ilike.${searchTerm},email.ilike.${searchTerm}`)
		.limit(3);

	if (discoveredContacts) {
		for (const c of discoveredContacts) {
			results.push({
				type: 'contact',
				id: c.id,
				title: c.name || c.email,
				subtitle: c.name ? c.email : ''
			});
		}
	}

	// Search brands
	const { data: brands } = await locals.supabase
		.from('brands')
		.select('id, name, contact_first_name, contact_last_name, contact_email, website')
		.eq('organization_id', orgId)
		.or(
			`name.ilike.${searchTerm},contact_first_name.ilike.${searchTerm},contact_last_name.ilike.${searchTerm},contact_email.ilike.${searchTerm}`
		)
		.limit(5);

	if (brands) {
		for (const b of brands) {
			const contactName = [b.contact_first_name, b.contact_last_name].filter(Boolean).join(' ');
			results.push({
				type: 'brand',
				id: b.id,
				title: b.name,
				subtitle: [contactName, b.website].filter(Boolean).join(' · ') || ''
			});
		}
	}

	// Search accounts
	const { data: accounts } = await locals.supabase
		.from('accounts')
		.select('id, business_name, contact_first_name, contact_last_name, contact_email, city, state')
		.eq('organization_id', orgId)
		.or(
			`business_name.ilike.${searchTerm},contact_first_name.ilike.${searchTerm},contact_last_name.ilike.${searchTerm},contact_email.ilike.${searchTerm},city.ilike.${searchTerm}`
		)
		.limit(5);

	if (accounts) {
		for (const a of accounts) {
			results.push({
				type: 'account',
				id: a.id,
				title: a.business_name,
				subtitle: [a.city, a.state].filter(Boolean).join(', ') || ''
			});
		}
	}

	// Search orders
	const { data: orders } = await locals.supabase
		.from('orders')
		.select(
			'id, order_number, status, order_year, brands(name), accounts(business_name), seasons(name)'
		)
		.eq('organization_id', orgId)
		.or(`order_number.ilike.${searchTerm}`)
		.limit(5);

	if (orders) {
		for (const o of orders) {
			const brandData = o.brands as unknown as { name: string } | null;
			const accountData = o.accounts as unknown as { business_name: string } | null;
			const seasonData = o.seasons as unknown as { name: string } | null;
			const brandName = brandData?.name ?? '';
			const accountName = accountData?.business_name ?? '';

			results.push({
				type: 'order',
				id: o.id,
				title: o.order_number,
				subtitle: [accountName, brandName].filter(Boolean).join(' / '),
				meta: {
					seasonName: seasonData?.name ?? undefined,
					orderYear: o.order_year ?? undefined,
					status: o.status
				}
			});
		}
	}

	return json({ results: results.slice(0, 20) });
};
