import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { buildAuthUrl, normalizeShopDomain } from '$lib/server/integrations/shopify';

export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.session || !locals.user) {
		return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
	}

	if (!locals.membership || !['admin', 'owner'].includes(locals.membership.role)) {
		return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
	}

	const shopInput = url.searchParams.get('shop');
	if (!shopInput) {
		return new Response(JSON.stringify({ error: 'Missing shop parameter' }), { status: 400 });
	}

	let shop: string;
	try {
		shop = normalizeShopDomain(shopInput);
	} catch (err) {
		const msg = err instanceof Error ? err.message : 'Invalid shop';
		return new Response(JSON.stringify({ error: msg }), { status: 400 });
	}

	const state = Buffer.from(
		JSON.stringify({
			userId: locals.user.id,
			orgId: locals.organization!.id,
			shop
		})
	).toString('base64url');

	const authUrl = buildAuthUrl({ shop, origin: url.origin, state });
	throw redirect(302, authUrl);
};
