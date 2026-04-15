import { json } from '@sveltejs/kit';
import { dev } from '$app/environment';
import crypto from 'crypto';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase.js';

export const POST: RequestHandler = async ({ request }) => {
	try {
		return await handle(request);
	} catch (e) {
		console.error('[dev-signup-otp] uncaught:', e);
		const message = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
		return json({ error: `uncaught: ${message}` }, { status: 500 });
	}
};

async function handle(request: Request) {
	if (!dev) {
		return json({ error: 'Not available' }, { status: 404 });
	}

	const { email: rawEmail } = await request.json();
	const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : '';
	if (!email || !email.includes('@')) {
		return json({ error: 'Missing or invalid email' }, { status: 400 });
	}

	const { data: usersList, error: listError } = await supabaseAdmin.auth.admin.listUsers();
	if (listError) {
		console.error('[dev-signup-otp] listUsers failed:', listError);
		return json({ error: `listUsers: ${listError.message}` }, { status: 500 });
	}
	const existing = usersList?.users?.find((u) => u.email === email);
	if (!existing) {
		const { error: createError } = await supabaseAdmin.auth.admin.createUser({
			email,
			email_confirm: true
		});
		if (createError) {
			console.error('[dev-signup-otp] createUser failed:', createError);
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
		console.error('[dev-signup-otp] generateLink failed:', error, data);
		return json(
			{ error: error?.message ?? 'generateLink returned no email_otp' },
			{ status: 500 }
		);
	}

	return json({ otp: data.properties.email_otp });
}
