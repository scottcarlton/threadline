import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase.js';

export const POST: RequestHandler = async ({ request, locals }) => {
	const { session } = await locals.safeGetSession();
	if (!session) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const userId = session.user.id;
	const { orgName, displayName, orgType } = await request.json();

	if (!orgName) {
		return json({ error: 'Organization name is required' }, { status: 400 });
	}

	// Idempotency: if this user already has a founding-admin membership, return
	// the existing org instead of inserting a second one. Re-submits, refreshes,
	// or bouncing back to /onboarding must not create duplicate orgs.
	const { data: existingMembership } = await supabaseAdmin
		.from('organization_members')
		.select('organizations(*)')
		.eq('profile_id', userId)
		.eq('role', 'admin')
		.limit(1)
		.maybeSingle();

	if (existingMembership?.organizations) {
		return json({ organization: existingMembership.organizations });
	}

	// Update profile display_name if provided
	if (displayName) {
		await supabaseAdmin.from('profiles').update({ display_name: displayName }).eq('id', userId);
	}

	// Generate slug from org name
	const slug = orgName
		.toLowerCase()
		.replace(/[^a-z0-9\s-]/g, '')
		.replace(/\s+/g, '-')
		.substring(0, 50);

	// Reject (don't suffix-mint) when another org owns this slug — the form can
	// ask for a different name. Suffix-minting silently let duplicate names
	// through and produced the recurring "two same-name orgs" bug.
	const { data: slugTaken } = await supabaseAdmin
		.from('organizations')
		.select('id')
		.eq('slug', slug)
		.maybeSingle();

	if (slugTaken) {
		return json(
			{ error: 'That organization name is taken. Please pick another.' },
			{ status: 409 }
		);
	}

	// Create organization
	const validOrgType = orgType === 'brand' ? 'brand' : 'rep';
	const { data: org, error: orgError } = await supabaseAdmin
		.from('organizations')
		.insert({ name: orgName, slug, org_type: validOrgType })
		.select()
		.single();

	if (orgError) {
		return json({ error: orgError.message }, { status: 500 });
	}

	// Create admin membership for the founding user
	const { error: memberError } = await supabaseAdmin.from('organization_members').insert({
		organization_id: org.id,
		profile_id: userId,
		role: 'admin',
		accepted_at: new Date().toISOString()
	});

	if (memberError) {
		return json({ error: memberError.message }, { status: 500 });
	}

	// For brand orgs, the auto_create_self_brand trigger has already inserted
	// a self-brand row. Set its contact_email to the founding admin's email so
	// the Profile page defaults to something sensible.
	if (validOrgType === 'brand' && session.user.email) {
		await supabaseAdmin
			.from('brands')
			.update({ contact_email: session.user.email })
			.eq('organization_id', org.id)
			.eq('is_self_brand', true);
	}

	return json({ organization: org });
};
