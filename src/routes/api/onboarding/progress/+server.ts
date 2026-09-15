import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase.js';
import { onboardingStateSchema } from '$lib/schemas/onboarding-state.js';

// Roles allowed to advance their org's onboarding. Must match the set used by
// the rest of the org-admin surface (see api/invite/send) — when this was
// admin-only, an owner's cursor silently stopped persisting.
const ORG_ADMIN_ROLES = ['admin', 'owner'];

// Persist the onboarding resume cursor. onboardingStep is the 1-based phase to
// resume at. Uses supabaseAdmin (client writes via @supabase/ssr are unreliable)
// but scopes strictly to an org the caller actually administers — resolved
// server-side from their membership, never from client input.
export const POST: RequestHandler = async ({ request, locals, cookies }) => {
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

	// Prefer the active org so a user who administers more than one can't have
	// this org's cursor written onto another. Falling back to their oldest admin
	// membership keeps first-run working, where no active org cookie exists yet.
	const activeOrgId = cookies.get('active_org_id');
	let query = supabaseAdmin
		.from('organization_members')
		.select('organization_id, organizations(org_type)')
		.eq('profile_id', session.user.id)
		.in('role', ORG_ADMIN_ROLES);
	if (activeOrgId) query = query.eq('organization_id', activeOrgId);

	const { data: membership } = await query
		.order('created_at', { ascending: true })
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

	if (!finishing && onboardingState !== undefined) {
		const parsed = onboardingStateSchema.safeParse(onboardingState);
		if (!parsed.success) {
			return json({ error: 'Invalid onboarding state' }, { status: 400 });
		}
		patch.onboarding_state = parsed.data;
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

	// Only the terminal write is worth a row. The step cursor is written on every
	// sub-step of the wizard and would drown the org's timeline in noise.
	if (finishing) {
		locals.audit.record('organization.onboarding_completed', {
			organizationId: membership.organization_id,
			subjectId: membership.organization_id,
			metadata: { orgType: orgType ?? null }
		});
	}

	return json({ ok: true, landing: orgType === 'retailer' ? '/dashboard' : '/insight' });
};
