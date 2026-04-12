import { json, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals, cookies }) => {
	const { session } = await locals.safeGetSession();
	if (!session) return json({ error: 'Unauthorized' }, { status: 401 });

	const { orgId } = await request.json();
	if (!orgId) return json({ error: 'Missing orgId' }, { status: 400 });

	// Verify user is a member of the target org
	const { data: membership } = await locals.supabase
		.from('organization_members')
		.select('id')
		.eq('organization_id', orgId)
		.eq('profile_id', session.user.id)
		.single();

	if (!membership) return json({ error: 'Not a member of this organization' }, { status: 403 });

	cookies.set('active_org_id', orgId, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: true,
		maxAge: 60 * 60 * 24 * 365 // 1 year
	});

	return json({ success: true });
};
