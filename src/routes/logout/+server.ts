import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isSystemAdminEmail } from '$lib/server/system-admin.js';

// Server-side logout. The `active_org_id` cookie is httpOnly, so the client's
// supabase.auth.signOut() cannot clear it — it must be deleted here, otherwise
// the previous user's active org leaks into the next session on a shared browser.
export const POST: RequestHandler = async ({ locals, cookies }) => {
	// Resolved before signOut, or there is no identity left to attribute this
	// to. /logout is in PUBLIC_ROUTES, so the auth hook never ran
	// applyUserContext and never set an actor on the recorder either.
	const {
		data: { user }
	} = await locals.supabase.auth.getUser();
	if (user) {
		locals.audit.setActor({
			id: user.id,
			email: user.email ?? null,
			label: null,
			kind: isSystemAdminEmail(user.email) ? 'system_admin' : 'user'
		});
		locals.audit.record('auth.signed_out', { subjectId: user.id });
	}

	await locals.supabase.auth.signOut();
	cookies.delete('active_org_id', { path: '/' });
	return json({ success: true });
};
