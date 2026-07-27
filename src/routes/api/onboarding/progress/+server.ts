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

	const { onboardingStep, onboardingState, complete } = await request.json();
	const finishing = complete === true;
	const step = Number(onboardingStep);
	if (!finishing && (!Number.isInteger(step) || step < 1)) {
		return json({ error: 'Invalid step' }, { status: 400 });
	}

	const { data: membership } = await supabaseAdmin
		.from('organization_members')
		.select('organization_id, organizations(org_type)')
		.eq('profile_id', session.user.id)
		.eq('role', 'admin')
		.limit(1)
		.maybeSingle();

	if (!membership) {
		return json({ error: 'No organization to update' }, { status: 404 });
	}

	// Completing sets the terminal timestamp the load guard bounces on.
	// Otherwise write both cursors: the integer phase (back-compat) and the
	// richer state that restores the exact sub-step, skips, and import counts.
	const patch: Record<string, unknown> = finishing
		? { onboarding_completed_at: new Date().toISOString() }
		: { onboarding_step: step };

	if (!finishing && onboardingState && typeof onboardingState === 'object') {
		patch.onboarding_state = onboardingState;
	}

	const { error } = await supabaseAdmin
		.from('organizations')
		.update(patch)
		.eq('id', membership.organization_id);

	if (error) {
		return json({ error: error.message }, { status: 500 });
	}

	const org = membership.organizations as { org_type?: string } | { org_type?: string }[] | null;
	const orgType = Array.isArray(org) ? org[0]?.org_type : org?.org_type;

	return json({ ok: true, landing: orgType === 'retailer' ? '/dashboard' : '/insight' });
};
