import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase.js';
import { createStore } from '$lib/server/stores.js';

export const POST: RequestHandler = async ({ request, locals }) => {
	const { session } = await locals.safeGetSession();
	if (!session) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const { storeName, displayName } = await request.json();

	const result = await createStore(supabaseAdmin, {
		userId: session.user.id,
		businessName: storeName,
		displayName
	});

	if (result.error) {
		return json({ error: result.error }, { status: result.status ?? 500 });
	}

	return json({ store: result.store });
};
