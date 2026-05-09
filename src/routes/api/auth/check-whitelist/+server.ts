import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isEmailWhitelisted, isBetaWhitelistEnabled } from '$lib/server/beta-whitelist.js';

export const POST: RequestHandler = async ({ request }) => {
	if (!isBetaWhitelistEnabled()) {
		return json({ allowed: true });
	}

	const body = await request.json();
	const email = body.email?.trim()?.toLowerCase();

	if (!email) {
		return json({ allowed: false, message: 'Email is required.' }, { status: 400 });
	}

	const allowed = await isEmailWhitelisted(email);

	if (!allowed) {
		return json({
			allowed: false,
			message:
				"Threadline is currently in private beta. If you'd like access, reach out to hello@threadline.systems."
		});
	}

	return json({ allowed: true });
};
