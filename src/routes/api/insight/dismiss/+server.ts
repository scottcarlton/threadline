import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.session || !locals.user || !locals.organization) {
		throw error(401, 'Unauthorized');
	}

	const { id } = await request.json();
	if (!id) {
		throw error(400, 'Missing insight action id');
	}

	const { error: dbError } = await locals.supabase
		.from('insight_actions')
		.update({
			status: 'dismissed',
			dismissed_at: new Date().toISOString()
		})
		.eq('id', id)
		.eq('organization_id', locals.organization.id);

	if (dbError) {
		throw error(500, dbError.message);
	}

	return json({ success: true });
};
