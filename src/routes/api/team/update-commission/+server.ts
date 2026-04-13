import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase.js';

export const POST: RequestHandler = async ({ request, locals }) => {
	const { membership, organization } = locals;

	if (!membership || !['admin', 'owner'].includes(membership.role)) {
		return json({ error: 'Unauthorized' }, { status: 403 });
	}

	if (!organization) {
		return json({ error: 'No organization found' }, { status: 400 });
	}

	const { memberId, brandId, rate } = await request.json();

	if (!memberId || !brandId || rate === undefined) {
		return json({ error: 'Missing required fields' }, { status: 400 });
	}

	const numRate = parseFloat(rate);
	if (isNaN(numRate) || numRate < 0 || numRate > 100) {
		return json({ error: 'Invalid rate' }, { status: 400 });
	}

	// Upsert the commission rate
	const { data: existing } = await supabaseAdmin
		.from('member_brand_commissions')
		.select('id')
		.eq('member_id', memberId)
		.eq('brand_id', brandId)
		.single();

	if (existing) {
		await supabaseAdmin
			.from('member_brand_commissions')
			.update({ rate: numRate })
			.eq('id', existing.id);
	} else {
		await supabaseAdmin.from('member_brand_commissions').insert({
			organization_id: organization.id,
			member_id: memberId,
			brand_id: brandId,
			rate: numRate
		});
	}

	return json({ success: true });
};
