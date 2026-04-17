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

export type SearchResponse = {
	results: SearchResult[];
	orderTotalCount?: number;
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
	const results: SearchResult[] = [];

	// Search contacts from accounts — RLS handles org scoping
	const { data: accountContacts } = await locals.supabase
		.from('accounts')
		.select('id, business_name, contact_first_name, contact_last_name, contact_email')
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

	// Search contacts from brands — RLS handles org scoping
	const { data: brandContacts } = await locals.supabase
		.from('brands')
		.select('id, name, contact_first_name, contact_last_name, contact_email')
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

	// Search saved discovered contacts — RLS handles org scoping
	const { data: discoveredContacts } = await locals.supabase
		.from('discovered_contacts')
		.select('id, name, email, status')
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

	// Search brands — RLS handles org scoping
	const { data: brands } = await locals.supabase
		.from('brands')
		.select('id, name, contact_first_name, contact_last_name, contact_email, website')
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

	// Search accounts — RLS handles org scoping
	const { data: accounts } = await locals.supabase
		.from('accounts')
		.select('id, business_name, contact_first_name, contact_last_name, contact_email, city, state')
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

	// Search orders — match on order number, account name, or account contact
	// First find account IDs that match the search term — RLS handles org scoping
	const { data: matchingAccounts } = await locals.supabase
		.from('accounts')
		.select('id')
		.or(
			`business_name.ilike.${searchTerm},contact_first_name.ilike.${searchTerm},contact_last_name.ilike.${searchTerm},contact_email.ilike.${searchTerm}`
		)
		.limit(50);

	const matchingAccountIds = (matchingAccounts ?? []).map((a) => a.id);

	// Build order query — match on order_number OR account_id in matching accounts
	// RLS handles org scoping
	let orderQuery = locals.supabase
		.from('orders')
		.select(
			'id, order_number, status, order_year, created_at, brands(name), accounts(business_name, contact_first_name, contact_last_name, contact_email), seasons(name)'
		)
		.order('created_at', { ascending: false });

	if (matchingAccountIds.length > 0) {
		orderQuery = orderQuery.or(
			`order_number.ilike.${searchTerm},account_id.in.(${matchingAccountIds.join(',')})`
		);
	} else {
		orderQuery = orderQuery.or(`order_number.ilike.${searchTerm}`);
	}

	const { data: orders } = await orderQuery.limit(20);

	const orderResults: SearchResult[] = [];
	if (orders) {
		for (const o of orders) {
			const brandData = o.brands as unknown as { name: string } | null;
			const accountData = o.accounts as unknown as {
				business_name: string;
				contact_first_name?: string;
				contact_last_name?: string;
				contact_email?: string;
			} | null;
			const seasonData = o.seasons as unknown as { name: string } | null;
			const brandName = brandData?.name ?? '';
			const accountName = accountData?.business_name ?? '';

			orderResults.push({
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

	// Add only first 2 order results to the main results array
	results.push(...orderResults.slice(0, 2));

	return json({
		results: results.slice(0, 20),
		orderTotalCount: orderResults.length
	} satisfies SearchResponse);
};
