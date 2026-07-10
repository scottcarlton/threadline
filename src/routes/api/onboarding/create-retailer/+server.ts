import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase.js';
import { createRetailer } from '$lib/server/retailers.js';

export const POST: RequestHandler = async ({ request, locals }) => {
	const { session } = await locals.safeGetSession();
	if (!session) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const { retailerName, displayName } = await request.json();

	const result = await createRetailer(supabaseAdmin, {
		userId: session.user.id,
		businessName: retailerName,
		displayName
	});

	if (result.error) {
		return json({ error: result.error }, { status: result.status ?? 500 });
	}

	return json({ organization: result.organization });
};
