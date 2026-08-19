import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase.js';

// Save pre-organization onboarding answers onto the caller's own profile.
// The org row doesn't exist during the first phase, so there's nowhere else to
// put them; once it does, organizations.onboarding_state takes over.
//
// Scoped strictly to session.user.id — the profile is never taken from input.
export const POST: RequestHandler = async ({ request, locals }) => {
	const { session } = await locals.safeGetSession();
	if (!session) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const body = await request.json().catch(() => null);
	if (!body || typeof body !== 'object') {
		return json({ error: 'Invalid payload' }, { status: 400 });
	}

	const { name, orgType } = body as { name?: unknown; orgType?: unknown };

	const draft: Record<string, string> = {};
	if (typeof name === 'string' && name.trim()) draft.name = name.trim().slice(0, 200);
	if (orgType === 'brand' || orgType === 'rep' || orgType === 'retailer') draft.orgType = orgType;

	if (Object.keys(draft).length === 0) {
		return json({ error: 'Nothing to save' }, { status: 400 });
	}

	// Merge so saving the org type later doesn't drop the name.
	const { data: existing } = await supabaseAdmin
		.from('profiles')
		.select('onboarding_draft')
		.eq('id', session.user.id)
		.maybeSingle();

	const merged = { ...((existing?.onboarding_draft as Record<string, string>) ?? {}), ...draft };

	const patch: Record<string, unknown> = { onboarding_draft: merged };
	// Their name is useful app-wide, not just here.
	if (draft.name) patch.display_name = draft.name;

	const { error } = await supabaseAdmin.from('profiles').update(patch).eq('id', session.user.id);

	if (error) {
		return json({ error: error.message }, { status: 500 });
	}

	return json({ ok: true, draft: merged });
};
