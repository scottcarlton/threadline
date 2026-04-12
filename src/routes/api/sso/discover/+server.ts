import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase';

export const POST: RequestHandler = async ({ request }) => {
	const { email } = await request.json();

	if (!email || typeof email !== 'string') {
		return json({ error: 'Email is required' }, { status: 400 });
	}

	const domain = email.split('@')[1]?.toLowerCase();
	if (!domain) {
		return json({ error: 'Invalid email' }, { status: 400 });
	}

	const { data: provider } = await supabaseAdmin
		.from('organization_sso_providers')
		.select('domain')
		.eq('domain', domain)
		.limit(1)
		.single();

	if (provider) {
		return json({ sso: true, domain: provider.domain });
	}

	return json({ sso: false });
};
