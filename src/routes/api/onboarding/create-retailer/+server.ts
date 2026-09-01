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

	// Recorded here rather than inside createRetailer so the lib stays free of
	// request-scoped state. Guarded on `created`: the idempotent path returns an
	// existing org, and a refresh must not mint a second creation event.
	if (result.created && result.organization) {
		const org = result.organization;
		locals.audit.record('organization.created', {
			organizationId: org.id,
			organizationName: org.name,
			subjectId: org.id,
			subjectLabel: org.name,
			metadata: { orgType: 'retailer' }
		});
		// A retailer's wizard ends at creation, so completion is atomic with it.
		locals.audit.record('organization.onboarding_completed', {
			organizationId: org.id,
			organizationName: org.name,
			subjectId: org.id,
			metadata: { orgType: 'retailer' }
		});
		locals.audit.record('member.added', {
			organizationId: org.id,
			organizationName: org.name,
			subjectId: session.user.id,
			subjectLabel: displayName ?? session.user.email ?? session.user.id,
			metadata: { role: 'admin', founding: true }
		});
	}

	return json({ organization: result.organization });
};
