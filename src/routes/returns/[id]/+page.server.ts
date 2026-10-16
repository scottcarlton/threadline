import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getReturn, viewerIsIssuer } from '$lib/server/queries/returns.js';

/**
 * One return.
 *
 * `getReturn` reads through `locals.supabase`, so a return the caller cannot
 * see comes back null and this answers 404 — the same answer a bad id gets,
 * which is what keeps a return's existence from leaking across tenants. There
 * is no partial render: the page either has the whole record or does not exist.
 */
export const load: PageServerLoad = async ({ locals, params, depends }) => {
	depends('data:returns');

	const ra = await getReturn(locals.supabase, params.id);
	if (!ra) throw error(404, 'Return not found');

	const scope = await locals.getQueryScope();

	return {
		returnAuthorization: ra,
		isIssuer: viewerIsIssuer(scope, ra)
	};
};
