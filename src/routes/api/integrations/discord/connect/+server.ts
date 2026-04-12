import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAuthUrl } from '$lib/server/integrations/discord';

export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.session || !locals.user) {
		return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
	}

	if (!locals.membership || !['admin', 'owner'].includes(locals.membership.role)) {
		return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
	}

	const state = JSON.stringify({
		userId: locals.user.id,
		orgId: locals.organization!.id
	});

	const authUrl = getAuthUrl(url.origin, state);
	throw redirect(302, authUrl);
};
