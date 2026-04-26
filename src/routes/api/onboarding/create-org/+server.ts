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

	// Check for slug uniqueness
	const { data: existing } = await supabaseAdmin
		.from('organizations')
		.select('id')
		.eq('slug', slug)
		.single();

	const finalSlug = existing ? `${slug}-${Date.now().toString(36)}` : slug;

	// Create organization
	const validOrgType = orgType === 'brand' ? 'brand' : 'rep';
	const { data: org, error: orgError } = await supabaseAdmin
		.from('organizations')
		.insert({ name: orgName, slug: finalSlug, org_type: validOrgType })
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
