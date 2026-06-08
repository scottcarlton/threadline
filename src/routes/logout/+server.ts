import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Server-side logout. The `active_org_id` cookie is httpOnly, so the client's
// supabase.auth.signOut() cannot clear it — it must be deleted here, otherwise
// the previous user's active org leaks into the next session on a shared browser.
export const POST: RequestHandler = async ({ locals, cookies }) => {
	await locals.supabase.auth.signOut();
	cookies.delete('active_org_id', { path: '/' });
	return json({ success: true });
};
