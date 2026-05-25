import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase.js';

export const GET: RequestHandler = async ({ params, locals }) => {
	const { session } = await locals.safeGetSession();
	if (!session) {
		throw redirect(303, `/invite/${params.token}`);
	}

	const userId = session.user.id;
	const token = params.token;

	// Look up the invitation
	const { data: invitation } = await supabaseAdmin
		.from('invitations')
		.select('*')
		.eq('token', token)
		.is('accepted_at', null)
		.single();

	if (!invitation) {
		throw redirect(303, '/login?error=invitation_invalid');
	}

	if (new Date(invitation.expires_at) < new Date()) {
		throw redirect(303, '/login?error=invitation_expired');
	}

	// Normalize sales-scoped fields the same way /api/invite/send does
	const isSales = invitation.role === 'sales';
	const isMemberOrSales = invitation.role === 'member' || isSales;

	let commission = 0;
	if (isSales && invitation.commission_rate != null) {
		const n = Number(invitation.commission_rate);
		if (Number.isFinite(n)) commission = Math.min(100, Math.max(0, n));
	}

	// Create organization membership
	const { data: inserted, error: memberError } = await supabaseAdmin
		.from('organization_members')
		.insert({
			organization_id: invitation.organization_id,
			profile_id: userId,
			role: invitation.role,
			commission_rate: commission,
			manages_others: isMemberOrSales && invitation.manages_others === true,
			manager_id: invitation.manager_id ?? null,
			invited_by: invitation.invited_by,
			accepted_at: new Date().toISOString()
		})
		.select('id')
		.single();

	if (memberError || !inserted) {
		throw redirect(303, '/login?error=invite_accept_failed');
	}

	// Brand access + per-brand commissions
	if (invitation.brand_ids && invitation.brand_ids.length > 0) {
		const brandAccessRows = invitation.brand_ids.map((brandId: string) => ({
			member_id: inserted.id,
			brand_id: brandId,
			granted_by: invitation.invited_by
		}));
		await supabaseAdmin.from('member_brand_access').insert(brandAccessRows);

		if (commission > 0) {
			const commissionRows = invitation.brand_ids.map((brandId: string) => ({
				organization_id: invitation.organization_id,
				member_id: inserted.id,
				brand_id: brandId,
				rate: commission
			}));
			await supabaseAdmin.from('member_brand_commissions').insert(commissionRows);
		}
	}

	// Territory assignments
	const territoryIds: string[] =
		isSales && Array.isArray(invitation.territory_ids) ? invitation.territory_ids : [];
	if (territoryIds.length > 0) {
		const territoryRows = territoryIds.map((territoryId: string) => ({
			organization_member_id: inserted.id,
			territory_id: territoryId
		}));
		await supabaseAdmin.from('member_territories').insert(territoryRows);
	}

	// Mark invitation as accepted
	await supabaseAdmin
		.from('invitations')
		.update({ accepted_at: new Date().toISOString() })
		.eq('id', invitation.id);

	throw redirect(303, '/insight');
};
