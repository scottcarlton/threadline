import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getCalendlyAuthUrl } from '$lib/server/integrations/calendly';

export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.session || !locals.user) {
		return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
	}

	const state = locals.user.id;
	const authUrl = getCalendlyAuthUrl(url.origin, state);
	throw redirect(302, authUrl);
};
