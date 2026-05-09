import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getGmailClient, parseMessage } from '$lib/server/gmail';
import { supabaseAdmin } from '$lib/server/supabase';

const SYSTEM_EMAIL_PATTERNS = [
	'noreply@',
	'no-reply@',
	'mailer-daemon@',
	'notifications@',
	'updates@',
	'donotreply@',
	'do-not-reply@',
	'postmaster@',
	'bounce@',
	'unsubscribe@',
	'newsletter@',
	'news@',
	'support@',
	'info@',
	'help@',
	'feedback@'
];

function parseEmailAddress(raw: string): { name: string; email: string } | null {
	const match = raw.match(/^(.+?)\s*<(.+?)>$/);
	if (match) {
		return { name: match[1].replace(/^["']|["']$/g, '').trim(), email: match[2].toLowerCase() };
	}
	const emailOnly = raw.match(/^[\w.+-]+@[\w.-]+\.\w+$/);
	if (emailOnly) {
		return { name: '', email: raw.toLowerCase() };
	}
	return null;
}

function isSystemEmail(email: string): boolean {
	return SYSTEM_EMAIL_PATTERNS.some((p) => email.startsWith(p));
}

export const POST: RequestHandler = async ({ locals }) => {
	if (!locals.session || !locals.user || !locals.organization) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const orgId = locals.organization.id;
	const gmail = await getGmailClient(locals.user.id);
	if (!gmail) {
		return json({ error: 'No Gmail connection', discovered: [] }, { status: 400 });
	}

	// Get user's own email to exclude
	const { data: emailConn } = await supabaseAdmin
		.from('email_connections')
		.select('email_address')
		.eq('profile_id', locals.user.id)
		.eq('provider', 'gmail')
		.single();

	const ownEmail = emailConn?.email_address?.toLowerCase() ?? '';

	// Fetch recent inbox messages (metadata only)
	let messageIds: { id?: string | null }[];
	try {
		const listRes = await gmail.users.messages.list({
			userId: 'me',
			q: 'in:inbox',
			maxResults: 200
		});
		messageIds = listRes.data.messages ?? [];
	} catch (err) {
		console.error('Gmail list error:', err);
		return json({ error: 'Failed to fetch inbox', discovered: [] }, { status: 500 });
	}

	// Fetch message headers in batches of 50
	const contactMap = new Map<string, { name: string; email: string; count: number }>();

	for (let i = 0; i < messageIds.length; i += 50) {
		const batch = messageIds.slice(i, i + 50);
		const messages = await Promise.all(
			batch.map(async (m) => {
				try {
					const msg = await gmail.users.messages.get({
						userId: 'me',
						id: m.id!,
						format: 'metadata',
						metadataHeaders: ['From', 'To']
					});
					return parseMessage(msg.data);
				} catch {
					return null;
				}
			})
		);

		for (const msg of messages) {
			if (!msg) continue;
			for (const raw of [msg.from, msg.to]) {
				if (!raw) continue;
				// Handle multiple addresses in To field
				const addresses = raw.split(',').map((s) => s.trim());
				for (const addr of addresses) {
					const parsed = parseEmailAddress(addr);
					if (!parsed || !parsed.email) continue;
					if (parsed.email === ownEmail) continue;
					if (isSystemEmail(parsed.email)) continue;

					const existing = contactMap.get(parsed.email);
					if (existing) {
						existing.count++;
						if (!existing.name && parsed.name) existing.name = parsed.name;
					} else {
						contactMap.set(parsed.email, { name: parsed.name, email: parsed.email, count: 1 });
					}
				}
			}
		}
	}

	// Get known contact emails to exclude
	const [accountsRes, brandsRes] = await Promise.all([
		supabaseAdmin
			.from('accounts')
			.select('contact_email')
			.eq('organization_id', orgId)
			.not('contact_email', 'is', null),
		supabaseAdmin
			.from('brands')
			.select('contact_email')
			.eq('organization_id', orgId)
			.not('contact_email', 'is', null)
	]);

	const knownEmails = new Set<string>();
	for (const a of accountsRes.data ?? []) {
		if (a.contact_email) knownEmails.add(a.contact_email.toLowerCase());
	}
	for (const b of brandsRes.data ?? []) {
		if (b.contact_email) knownEmails.add(b.contact_email.toLowerCase());
	}

	// Filter to only unknown contacts
	const newContacts = Array.from(contactMap.values()).filter((c) => !knownEmails.has(c.email));

	// Upsert discovered contacts
	const userId = locals.user!.id;
	for (const contact of newContacts) {
		const { data: existing } = await supabaseAdmin
			.from('discovered_contacts')
			.select('id, message_count')
			.eq('organization_id', orgId)
			.eq('email', contact.email)
			.single();

		if (existing) {
			await supabaseAdmin
				.from('discovered_contacts')
				.update({
					message_count: existing.message_count + contact.count,
					last_seen_at: new Date().toISOString(),
					name: contact.name || undefined,
					updated_at: new Date().toISOString()
				})
				.eq('id', existing.id);
		} else {
			await supabaseAdmin.from('discovered_contacts').insert({
				organization_id: orgId,
				email: contact.email,
				name: contact.name || null,
				message_count: contact.count,
				discovered_by: userId
			});
		}
	}

	// Return fresh list
	const { data: discovered } = await supabaseAdmin
		.from('discovered_contacts')
		.select('*')
		.eq('organization_id', orgId)
		.in('status', ['new', 'saved'])
		.order('last_seen_at', { ascending: false });

	return json({ discovered: discovered ?? [] });
};
