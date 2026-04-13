import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.session || !locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}
	if (!locals.membership || locals.membership.role !== 'owner') {
		return json(
			{ error: 'Only the organization owner can change SSO enforcement' },
			{ status: 403 }
		);
	}

	const orgId = locals.organization!.id;
	const { enforced } = await request.json();

	if (typeof enforced !== 'boolean') {
		return json({ error: 'enforced must be a boolean' }, { status: 400 });
	}

	// If enabling, verify at least one SSO provider exists
	if (enforced) {
		const { data: providers } = await supabaseAdmin
			.from('organization_sso_providers')
			.select('id')
			.eq('organization_id', orgId)
			.limit(1);

		if (!providers || providers.length === 0) {
			return json(
				{ error: 'Configure an SSO provider before enabling enforcement' },
				{ status: 400 }
			);
		}
	}

	const { error } = await supabaseAdmin
		.from('organizations')
		.update({ sso_enforced: enforced })
		.eq('id', orgId);

	if (error) {
		return json({ error: error.message }, { status: 500 });
	}

	return json({ sso_enforced: enforced });
};
