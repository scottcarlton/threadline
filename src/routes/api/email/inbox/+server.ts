import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getGmailClient, parseMessage } from '$lib/server/gmail';
import { supabaseAdmin } from '$lib/server/supabase';

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.session || !locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const gmail = await getGmailClient(locals.user.id);
	if (!gmail) {
		return json({ messages: [], nextPageToken: undefined });
	}

	const q = url.searchParams.get('q') ?? '';
	const filter = url.searchParams.get('filter') ?? 'all';
	const pageToken = url.searchParams.get('pageToken') ?? undefined;
	const orgId = locals.organization?.id;

	let searchQuery = '';

	// For filtered views (accounts/brands), restrict to known contacts
	// For 'all', show full inbox without filtering by contacts
	if (orgId && filter !== 'all') {
		const emailAddresses: string[] = [];

		if (filter === 'accounts') {
			const { data: accounts } = await supabaseAdmin
				.from('accounts')
				.select('contact_email')
				.eq('organization_id', orgId)
				.not('contact_email', 'is', null);
			if (accounts) emailAddresses.push(...accounts.map((a) => a.contact_email!).filter(Boolean));
		}

		if (filter === 'brands') {
			const { data: brands } = await supabaseAdmin
				.from('brands')
				.select('contact_email')
				.eq('organization_id', orgId)
				.not('contact_email', 'is', null);
			if (brands) emailAddresses.push(...brands.map((b) => b.contact_email!).filter(Boolean));
		}

		if (emailAddresses.length > 0) {
			const fromClauses = emailAddresses.map((e) => `from:${e}`).join(' OR ');
			const toClauses = emailAddresses.map((e) => `to:${e}`).join(' OR ');
			searchQuery = `(${fromClauses} OR ${toClauses})`;
		} else {
			// No contacts found for this filter — return empty
			return json({ messages: [], nextPageToken: undefined });
		}
	}

	if (q) {
		searchQuery = searchQuery ? `${searchQuery} ${q}` : q;
	}

	try {
		const listRes = await gmail.users.messages.list({
			userId: 'me',
			q: searchQuery || 'in:inbox',
			maxResults: 30,
			pageToken
		});

		const messageIds = listRes.data.messages ?? [];

		const messages = await Promise.all(
			messageIds.map(async (m) => {
				const msg = await gmail.users.messages.get({
					userId: 'me',
					id: m.id!,
					format: 'metadata',
					metadataHeaders: ['From', 'To', 'Subject', 'Date']
				});
				return parseMessage(msg.data);
			})
		);

		return json({
			messages,
			nextPageToken: listRes.data.nextPageToken ?? undefined
		});
	} catch (err) {
		console.error('Gmail inbox error:', err);
		return json({ messages: [], error: 'Failed to fetch inbox' });
	}
};
