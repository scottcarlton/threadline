import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.session || !locals.user || !locals.organization) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const { gmailMessageId, entityType, entityId } = await request.json();

	if (!gmailMessageId || typeof gmailMessageId !== 'string') {
		return json({ error: 'gmailMessageId is required' }, { status: 400 });
	}
	if (!['account', 'order'].includes(entityType)) {
		return json({ error: 'entityType must be "account" or "order"' }, { status: 400 });
	}
	if (!entityId || typeof entityId !== 'string') {
		return json({ error: 'entityId is required' }, { status: 400 });
	}

	const { error } = await locals.supabase.from('email_links').upsert(
		{
			organization_id: locals.organization.id,
			gmail_message_id: gmailMessageId,
			entity_type: entityType,
			entity_id: entityId,
			linked_by: locals.user.id
		},
		{ onConflict: 'organization_id,gmail_message_id' }
	);

	if (error) return json({ error: error.message }, { status: 500 });
	return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ request, locals }) => {
	if (!locals.session || !locals.user || !locals.organization) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const { gmailMessageId } = await request.json();
	if (!gmailMessageId) return json({ error: 'gmailMessageId is required' }, { status: 400 });

	await locals.supabase
		.from('email_links')
		.delete()
		.eq('organization_id', locals.organization.id)
		.eq('gmail_message_id', gmailMessageId);

	return json({ ok: true });
};
