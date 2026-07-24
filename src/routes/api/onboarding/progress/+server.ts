import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase.js';

// Persist the onboarding resume cursor. onboardingStep is the 1-based phase to
// resume at. Uses supabaseAdmin (client writes via @supabase/ssr are unreliable)
// but scopes strictly to the caller's own founding org — the org is resolved
// from the session's admin membership, never from client input.
export const POST: RequestHandler = async ({ request, locals }) => {
	const { session } = await locals.safeGetSession();
	if (!session) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const { onboardingStep } = await request.json();
	const step = Number(onboardingStep);
	if (!Number.isInteger(step) || step < 1) {
		return json({ error: 'Invalid step' }, { status: 400 });
	}

	const { data: membership } = await supabaseAdmin
		.from('organization_members')
		.select('organization_id')
		.eq('profile_id', session.user.id)
		.eq('role', 'admin')
		.limit(1)
		.maybeSingle();

	if (!membership) {
		return json({ error: 'No organization to update' }, { status: 404 });
	}

	const { error } = await supabaseAdmin
		.from('organizations')
		.update({ onboarding_step: step })
		.eq('id', membership.organization_id);

	if (error) {
		return json({ error: error.message }, { status: 500 });
	}

	return json({ ok: true });
};
