import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { refreshInsights } from '$lib/server/insights-engine.js';

export const POST: RequestHandler = async ({ locals }) => {
	if (!locals.session || !locals.user || !locals.organization) {
		throw error(401, 'Unauthorized');
	}

	const role = locals.membership?.role;
	if (!role || !['admin', 'owner', 'member', 'sales'].includes(role)) {
		throw error(403, 'Forbidden');
	}

	const result = await refreshInsights(locals.supabase, locals.organization.id);

	return json(result);
};
