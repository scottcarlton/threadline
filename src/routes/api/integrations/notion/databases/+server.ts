import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listDatabases } from '$lib/server/integrations/notion';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.session || !locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	if (!locals.membership || !['admin', 'owner'].includes(locals.membership.role)) {
		return json({ error: 'Forbidden' }, { status: 403 });
	}

	const databases = await listDatabases(locals.organization!.id);
	return json({ databases });
};
