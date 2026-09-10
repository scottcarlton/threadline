import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase.js';

/** Supabase types a single-row join as object-or-array; normalise both. */
function memberName(rel: unknown): string | null {
	const p = rel as { display_name?: string } | { display_name?: string }[] | null;
	return (Array.isArray(p) ? p[0]?.display_name : p?.display_name) ?? null;
}

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

	// Verify the member belongs to the caller's org before touching commissions.
	// Every sibling /api/team/* endpoint does this; this one did not, which let an
	// admin rewrite another org's commission rate given a member+brand UUID.
	const { data: targetMember } = await supabaseAdmin
		.from('organization_members')
		// profile_id so the audit subject is the person, matching the profiles
		// subjectType these membership events declare.
		.select('id, profile_id, profiles!organization_members_profile_id_fkey(display_name)')
		.eq('id', memberId)
		.eq('organization_id', organization.id)
		.maybeSingle();

	if (!targetMember) {
		return json({ error: 'Member not found' }, { status: 404 });
	}

	// `member_brand_commissions` is own-org only (§A.3), so the brand must be ours too.
	const { data: targetBrand } = await supabaseAdmin
		.from('brands')
		.select('id')
		.eq('id', brandId)
		.eq('organization_id', organization.id)
		.maybeSingle();

	if (!targetBrand) {
		return json({ error: 'Brand not found' }, { status: 404 });
	}

	// Upsert the commission rate
	const { data: existing } = await supabaseAdmin
		.from('member_brand_commissions')
		// The existing rate is the "before" half of the audit diff.
		.select('id, rate')
		.eq('member_id', memberId)
		.eq('brand_id', brandId)
		.eq('organization_id', organization.id)
		.maybeSingle();

	if (existing) {
		await supabaseAdmin
			.from('member_brand_commissions')
			.update({ rate: numRate })
			.eq('id', existing.id)
			.eq('organization_id', organization.id);
	} else {
		await supabaseAdmin.from('member_brand_commissions').insert({
			organization_id: organization.id,
			member_id: memberId,
			brand_id: brandId,
			rate: numRate
		});
	}

	locals.audit.record('member.commission_changed', {
		subjectId: targetMember.profile_id,
		subjectLabel: memberName(targetMember.profiles),
		metadata: { scope: 'brand', brandId, memberId },
		changes: { rate: { before: existing?.rate ?? null, after: numRate } }
	});

	return json({ success: true });
};
