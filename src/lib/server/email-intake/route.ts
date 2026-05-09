import { supabaseAdmin } from '$lib/server/supabase.js';

// ── Types ────────────────────────────────────────────────────

export type RouteResult =
	| { kind: 'single'; organizationId: string; userId: string }
	| {
			kind: 'multiple';
			candidates: Array<{ organizationId: string; userId: string; orgName: string }>;
	  }
	| { kind: 'none'; reason: 'unknown_sender' | 'not_enabled' };

/**
 * Resolve a sender email to one or more eligible organizations.
 *
 * Looks up auth.users by email, then checks organization_members for
 * memberships where email_intake_enabled = true.
 */
export async function resolveOrgFromSender(fromEmail: string): Promise<RouteResult> {
	// Find the user by email
	const { data: userList } = await supabaseAdmin.auth.admin.listUsers();
	const user = userList?.users?.find((u) => u.email?.toLowerCase() === fromEmail.toLowerCase());

	if (!user) {
		return { kind: 'none', reason: 'unknown_sender' };
	}

	// Find org memberships with email intake enabled
	const { data: memberships } = await supabaseAdmin
		.from('organization_members')
		.select('organization_id, organizations(name)')
		.eq('profile_id', user.id)
		.eq('email_intake_enabled', true);

	const eligible = (memberships ?? []) as Array<{
		organization_id: string;
		organizations: { name: string } | { name: string }[] | null;
	}>;

	if (eligible.length === 0) {
		return { kind: 'none', reason: 'not_enabled' };
	}

	if (eligible.length === 1) {
		return {
			kind: 'single',
			organizationId: eligible[0].organization_id,
			userId: user.id
		};
	}

	return {
		kind: 'multiple',
		candidates: eligible.map((m) => {
			const orgName = Array.isArray(m.organizations)
				? (m.organizations[0]?.name ?? '')
				: (m.organizations?.name ?? '');
			return {
				organizationId: m.organization_id,
				userId: user.id,
				orgName
			};
		})
	};
}
