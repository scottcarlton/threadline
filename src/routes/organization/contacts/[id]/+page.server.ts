import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	const { supabase, organization } = locals;
	if (!organization) throw error(404, 'Organization not found');

	const id = params.id;

	// Check if it's a discovered contact (UUID)
	// Or a known contact with source prefix (account-UUID or brand-UUID)
	const accountPrefix = 'account-';
	const brandPrefix = 'brand-';

	if (id.startsWith(accountPrefix)) {
		const accountId = id.slice(accountPrefix.length);
		const { data: account } = await supabase
			.from('accounts')
			.select('id, business_name, contact_first_name, contact_last_name, contact_email, phone, city, state')
			.eq('id', accountId)
			.single();

		if (!account) throw error(404, 'Contact not found');

		// Get recent orders for this account
		const { data: orders } = await supabase
			.from('orders')
			.select('id, order_number, total_amount, status, order_year, brands(name)')
			.eq('account_id', accountId)
			.order('created_at', { ascending: false })
			.limit(10);

		return {
			contact: {
				name: [account.contact_first_name, account.contact_last_name].filter(Boolean).join(' ') || null,
				email: account.contact_email,
				phone: account.phone,
				source: 'account' as const,
				sourceId: account.id,
				sourceName: account.business_name,
				location: [account.city, account.state].filter(Boolean).join(', ') || null
			},
			orders: orders ?? []
		};
	}

	if (id.startsWith(brandPrefix)) {
		const brandId = id.slice(brandPrefix.length);
		const { data: brand } = await supabase
			.from('brands')
			.select('id, name, contact_first_name, contact_last_name, contact_email, contact_phone, website')
			.eq('id', brandId)
			.single();

		if (!brand) throw error(404, 'Contact not found');

		// Get recent orders for this brand
		const { data: orders } = await supabase
			.from('orders')
			.select('id, order_number, total_amount, status, order_year, accounts(business_name)')
			.eq('brand_id', brandId)
			.order('created_at', { ascending: false })
			.limit(10);

		return {
			contact: {
				name: [brand.contact_first_name, brand.contact_last_name].filter(Boolean).join(' ') || null,
				email: brand.contact_email,
				phone: brand.contact_phone,
				source: 'brand' as const,
				sourceId: brand.id,
				sourceName: brand.name,
				website: brand.website,
				location: null
			},
			orders: orders ?? []
		};
	}

	// Discovered contact (plain UUID)
	const { data: discovered } = await supabase
		.from('discovered_contacts')
		.select('*')
		.eq('id', id)
		.single();

	if (!discovered) throw error(404, 'Contact not found');

	return {
		contact: {
			name: discovered.name,
			email: discovered.email,
			phone: null,
			source: 'discovered' as const,
			sourceId: discovered.id,
			sourceName: null,
			location: null,
			status: discovered.status,
			messageCount: discovered.message_count,
			firstSeenAt: discovered.first_seen_at,
			lastSeenAt: discovered.last_seen_at
		},
		orders: []
	};
};
