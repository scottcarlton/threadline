import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase.js';

export const POST: RequestHandler = async ({ request }) => {
	const { orgName, userId } = await request.json();

	if (!orgName || !userId) {
		return json({ error: 'Missing required fields' }, { status: 400 });
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
	const { data: org, error: orgError } = await supabaseAdmin
		.from('organizations')
		.insert({ name: orgName, slug: finalSlug })
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

	return json({ organization: org });
};
