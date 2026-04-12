import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.session || !locals.user || !locals.organization) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const { status, notes } = await request.json();

	if (!status || !['saved', 'dismissed'].includes(status)) {
		return json({ error: 'Invalid status' }, { status: 400 });
	}

	const updateData: Record<string, unknown> = {
		status,
		updated_at: new Date().toISOString()
	};
	if (notes !== undefined) updateData.notes = notes;

	const { error } = await locals.supabase
		.from('discovered_contacts')
		.update(updateData)
		.eq('id', params.id)
		.eq('organization_id', locals.organization.id);

	if (error) {
		return json({ error: error.message }, { status: 500 });
	}

	return json({ success: true });
};
