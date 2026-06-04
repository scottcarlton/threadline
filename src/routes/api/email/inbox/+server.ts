import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listInbox } from '$lib/server/email/service';
import { supabaseAdmin } from '$lib/server/supabase';

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.session || !locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const q = url.searchParams.get('q') ?? '';
	const filter = url.searchParams.get('filter') ?? 'all';
	const orgId = locals.organization?.id;

	// Resolve the contact set for filtered views. `null` means "no contact filter" (full inbox).
	let contactEmails: string[] | null = null;
	if (orgId && filter !== 'all') {
		contactEmails = [];

		if (filter === 'accounts') {
			const { data: accounts } = await supabaseAdmin
				.from('accounts')
				.select('contact_email')
				.eq('organization_id', orgId)
				.not('contact_email', 'is', null);
			if (accounts) contactEmails.push(...accounts.map((a) => a.contact_email!).filter(Boolean));
		}

		if (filter === 'brands') {
			const { data: brands } = await supabaseAdmin
				.from('brands')
				.select('contact_email')
				.eq('organization_id', orgId)
				.not('contact_email', 'is', null);
			if (brands) contactEmails.push(...brands.map((b) => b.contact_email!).filter(Boolean));
		}
	}

	try {
		const messages = await listInbox(locals.user.id, { q: q || undefined, contactEmails });
		return json({ messages });
	} catch (err) {
		console.error('Inbox fetch error:', err);
		return json({ messages: [], error: 'Failed to fetch inbox' });
	}
};
