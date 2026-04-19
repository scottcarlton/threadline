import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/server/supabase.js';

export const load: PageServerLoad = async ({ locals }) => {
	const { user, organization, membership } = locals;

	if (!user || !organization) {
		return { emailIntakeEnabled: false, canToggle: false, orgs: [] };
	}

	// Only rep, admin, owner can enable email intake
	const canToggle = ['rep', 'admin', 'owner'].includes(membership?.role ?? '');

	// Get all orgs the user is a member of with their email_intake_enabled status
	const { data: memberships } = await supabaseAdmin
		.from('organization_members')
		.select('organization_id, email_intake_enabled, organizations(name)')
		.eq('profile_id', user.id);

	const orgs = (memberships ?? []).map((m) => {
		const org = m.organizations as { name: string } | { name: string }[] | null;
		const orgName = Array.isArray(org) ? (org[0]?.name ?? '') : (org?.name ?? '');
		return {
			organizationId: m.organization_id,
			orgName,
			emailIntakeEnabled: m.email_intake_enabled ?? false
		};
	});

	const currentOrg = orgs.find((o) => o.organizationId === organization.id);

	return {
		emailIntakeEnabled: currentOrg?.emailIntakeEnabled ?? false,
		canToggle,
		orgs
	};
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const { user, organization, membership } = locals;

		if (!user || !organization) {
			return fail(401, { message: 'Not authenticated' });
		}

		// Role gate: only rep, admin, owner
		if (!['rep', 'admin', 'owner'].includes(membership?.role ?? '')) {
			return fail(403, { message: 'Insufficient permissions' });
		}

		const formData = await request.formData();
		const enabled = formData.get('email_intake_enabled') === 'on';

		const { error } = await supabaseAdmin
			.from('organization_members')
			.update({ email_intake_enabled: enabled })
			.eq('profile_id', user.id)
			.eq('organization_id', organization.id);

		if (error) {
			return fail(500, { message: 'Failed to update setting' });
		}

		return { success: true };
	}
};
