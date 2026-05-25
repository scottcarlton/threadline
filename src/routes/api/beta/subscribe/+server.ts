import { json } from '@sveltejs/kit';
import { BrevoClient } from '@getbrevo/brevo';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

const BETA_LIST_ID = 4;

export const POST: RequestHandler = async ({ request }) => {
	const { email } = await request.json();

	if (!email || typeof email !== 'string' || !email.includes('@')) {
		return json({ ok: false, error: 'Valid email required' }, { status: 400 });
	}

	if (!env.BREVO_API_KEY) {
		return json({ ok: false, error: 'Email service not configured' }, { status: 500 });
	}

	const brevo = new BrevoClient({ apiKey: env.BREVO_API_KEY });

	try {
		await brevo.contacts.createContact({
			email: email.toLowerCase().trim(),
			listIds: [BETA_LIST_ID],
			updateEnabled: true
		});

		return json({ ok: true });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Failed to subscribe';
		return json({ ok: false, error: message }, { status: 500 });
	}
};
