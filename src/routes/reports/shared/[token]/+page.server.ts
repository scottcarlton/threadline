import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { supabaseAdmin } from '$lib/server/supabase.js';
import { resolveShareToken } from '$lib/server/reports/share-links.js';

/**
 * The public view of a shared report (SCO-151). No session required.
 *
 * Possession of the token is the whole authorization. `resolveShareToken`
 * looks the link up by the token's hash with the admin client and returns
 * only the frozen snapshot, never live org data. Malformed, unknown, revoked
 * and expired tokens all get the same 404, so a link's existence never leaks.
 */
export const load: PageServerLoad = async ({ params, setHeaders }) => {
	setHeaders({
		'Cache-Control': 'private, no-store',
		'X-Robots-Tag': 'noindex, nofollow',
		'Referrer-Policy': 'no-referrer'
	});

	const link = await resolveShareToken(supabaseAdmin, params.token);
	if (!link) throw error(404, 'This link is no longer available');

	return {
		report: link.report,
		title: link.title,
		filterLabel: link.filter_label,
		orgName: link.orgName,
		sharedAt: link.created_at,
		expiresAt: link.expires_at,
		variant: link.snapshot.variant,
		rows: link.snapshot.rows
	};
};
