import { redirect, fail } from '@sveltejs/kit';
import { message, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import type { PageServerLoad, Actions } from './$types';
import { supabaseAdmin } from '$lib/server/supabase.js';
import { listConnectedReps } from '$lib/server/federation.js';
import {
	getOrCreateConnectInvite,
	refreshConnectInvite,
	type ConnectInvite
} from '$lib/server/connections.js';
import { sendInviteEmailFromOrg } from '$lib/server/email-templates.js';
import { inviteEmailSchema } from '$lib/schemas/invite-email.js';

export const load: PageServerLoad = async ({ locals, url }) => {
	const { organization, orgType } = locals;

	if (!organization) throw redirect(303, '/insight');
	if (orgType !== 'brand') throw redirect(303, '/insight');

	const orgId = organization.id;
	const isAdmin = ['admin', 'owner'].includes(locals.membership?.role ?? '');

	let connectInvite: ConnectInvite | null = null;
	if (isAdmin && locals.session) {
		connectInvite = await getOrCreateConnectInvite(supabaseAdmin, orgId, locals.session.user.id);
	}

	const [connectedReps, inviteEmailForm] = await Promise.all([
		listConnectedReps(supabaseAdmin, orgId),
		superValidate(zod4(inviteEmailSchema))
	]);

	// Fetch the brand's default commission rate for the share picker
	const defaultCommissionRate =
		(organization as { default_commission_rate?: number }).default_commission_rate ?? 10;

	return {
		connectInvite,
		inviteEmailForm,
		origin: url.origin,
		isAdmin,
		connectedReps,
		defaultCommissionRate
	};
};

export const actions: Actions = {
	refreshInvite: async ({ locals }) => {
		const role = locals.membership?.role;
		if (!role || !['admin', 'owner'].includes(role)) {
			return fail(403, { message: 'Not authorized' });
		}
		if (!locals.organization || locals.orgType !== 'brand') {
			return fail(400, { message: 'Only brand orgs can refresh invites' });
		}
		try {
			await refreshConnectInvite(supabaseAdmin, locals.organization.id);
			return { success: true };
		} catch {
			return fail(500, { message: 'Failed to refresh invite' });
		}
	},

	sendInviteEmail: async ({ request, locals, url }) => {
		const form = await superValidate(request, zod4(inviteEmailSchema));
		if (!form.valid) return fail(400, { form });

		const role = locals.membership?.role;
		if (!role || !['admin', 'owner'].includes(role)) {
			return fail(403, { form, message: 'Not authorized' });
		}
		if (!locals.organization || locals.orgType !== 'brand') {
			return fail(400, { form, message: 'Only brand orgs can send invites' });
		}
		if (!locals.session) {
			return fail(401, { form, message: 'Not signed in' });
		}

		const invite = await getOrCreateConnectInvite(
			supabaseAdmin,
			locals.organization.id,
			locals.session.user.id
		);
		const inviteUrl = `${url.origin}/connect/${invite.code}`;

		const result = await sendInviteEmailFromOrg({
			to: form.data.recipient_email,
			from_org_name: locals.organization.name,
			from_user_name: locals.user?.display_name ?? null,
			invite_url: inviteUrl,
			message: form.data.message,
			organizationId: locals.organization.id,
			profileId: locals.session.user.id
		});

		if (!result.ok) return fail(500, { form, message: 'Failed to send email' });

		return message(form, { sent: true, recipient: form.data.recipient_email });
	}
};
