import { json } from '@sveltejs/kit';
import { dev } from '$app/environment';
import crypto from 'crypto';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase.js';

export const POST: RequestHandler = async ({ request }) => {
	try {
		return await handle(request);
	} catch (e) {
		console.error('[dev-otp] uncaught:', e);
		const message = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
		return json({ error: `uncaught: ${message}` }, { status: 500 });
	}
};

async function handle(request: Request) {
	if (!dev) {
		return json({ error: 'Not available' }, { status: 404 });
	}

	const { token } = await request.json();
	if (!token) {
		return json({ error: 'Missing token' }, { status: 400 });
	}

	// Only reveal OTPs for emails tied to a real pending invitation.
	const { data: invitation, error: invitationError } = await supabaseAdmin
		.from('invitations')
		.select('email')
		.eq('token', token)
		.is('accepted_at', null)
		.maybeSingle();

	if (invitationError) {
		console.error('[dev-otp] invitation lookup failed:', invitationError);
		return json({ error: `Invitation lookup: ${invitationError.message}` }, { status: 500 });
	}
	if (!invitation?.email) {
		return json({ error: 'Invitation not found' }, { status: 404 });
	}

	const email = invitation.email;

	// generateLink with type 'magiclink' requires the user to exist; create them first if not.
	const { data: usersList, error: listError } = await supabaseAdmin.auth.admin.listUsers();
	if (listError) {
		console.error('[dev-otp] listUsers failed:', listError);
		return json({ error: `listUsers: ${listError.message}` }, { status: 500 });
	}
	const existing = usersList?.users?.find((u) => u.email === email);
	if (!existing) {
		const { error: createError } = await supabaseAdmin.auth.admin.createUser({
			email,
			email_confirm: true
		});
		if (createError) {
			console.error('[dev-otp] createUser failed:', createError);
			return json({ error: `createUser: ${createError.message}` }, { status: 500 });
		}
	}

	const linkType = existing ? 'magiclink' : 'signup';
	const { data, error } = await supabaseAdmin.auth.admin.generateLink({
		type: linkType,
		email,
		...(linkType === 'signup' ? { password: `dev-${crypto.randomUUID()}` } : {})
	} as Parameters<typeof supabaseAdmin.auth.admin.generateLink>[0]);

	if (error || !data?.properties?.email_otp) {
		console.error('[dev-otp] generateLink failed:', error, data);
		return json({ error: error?.message ?? 'generateLink returned no email_otp' }, { status: 500 });
	}

	return json({ otp: data.properties.email_otp });
}
