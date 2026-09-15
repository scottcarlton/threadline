import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const { organization, user, supabase } = locals;

	if (!user) {
		throw redirect(303, '/login');
	}

	// Bounce a completed org out of onboarding. Mid-onboarding users (membership
	// exists but onboarding_completed_at is NULL) are allowed back in to resume
	// from their last step. A completed retailer org belongs in the buyer portal
	// (/dashboard); rep/brand orgs go to /insight. Rep-only edge cases that
	// previously caused dup orgs (re-entering onboarding because they had 0
	// brands) are still prevented because every org goes through the same finish
	// flow that sets onboarding_completed_at.
	if (organization?.onboarding_completed_at) {
		throw redirect(303, organization.org_type === 'retailer' ? '/dashboard' : '/insight');
	}

	// Org seasons feed the catalog step's <ProductImportFlow> so it can
	// match AI-detected season hints to a real season_id and offer the
	// fallback dropdown when detection fails. Brand-orgs get the seeded
	// set (Spring/Summer/Fall/Resort/Holiday) at creation, so this query
	// returns ≥5 rows for any brand-org partway through onboarding.
	const seasons = organization
		? ((
				await supabase
					.from('seasons')
					.select('id, name')
					.eq('organization_id', organization.id)
					.eq('is_active', true)
					.order('sort_order', { ascending: true })
			).data ?? [])
		: [];

	// The product import posts to api/products/import, which requires a brandId.
	// For a brand-org that's the self-brand row the auto_create_self_brand
	// trigger inserts at creation. Null until the org exists (created mid-flow),
	// so the client re-reads this after invalidateAll().
	const selfBrandId =
		organization?.org_type === 'brand'
			? ((
					await supabase
						.from('brands')
						.select('id')
						.eq('organization_id', organization.id)
						.eq('is_self_brand', true)
						.maybeSingle()
				).data?.id ?? null)
			: null;

	// Brands the rep already has, so the brands step still shows its list (and
	// the connect action on each) after a refresh. Rep orgs only: a brand org's
	// only brand row is its own self-brand. `status` comes from the connection
	// the brand row is attached to via org_connections.rep_brand_id.
	let repBrands: { id: string; name: string; status: string | null }[] = [];
	if (organization?.org_type === 'rep') {
		const { data: brandRows } = await supabase
			.from('brands')
			.select('id, name')
			.eq('organization_id', organization.id)
			.eq('is_active', true)
			.eq('is_self_brand', false)
			.order('created_at', { ascending: true })
			.limit(100);
		const rows = (brandRows ?? []) as { id: string; name: string }[];
		if (rows.length > 0) {
			const { data: connectionRows } = await supabase
				.from('org_connections')
				.select('rep_brand_id, status')
				.eq('rep_org_id', organization.id);
			const statusByBrand = new Map(
				((connectionRows ?? []) as { rep_brand_id: string | null; status: string }[])
					.filter((c) => c.rep_brand_id)
					.map((c) => [c.rep_brand_id as string, c.status])
			);
			repBrands = rows.map((b) => ({ ...b, status: statusByBrand.get(b.id) ?? null }));
		}
	}

	// The user's own mailbox (Gmail/Outlook), not an org resource — the
	// Connections step shows which one is attached, or offers both.
	const { data: mailbox } = await supabase
		.from('email_connections')
		.select('provider, email_address')
		.eq('profile_id', user.id)
		.order('updated_at', { ascending: false })
		.limit(1)
		.maybeSingle();

	return {
		organization: organization ?? null,
		mailbox: (mailbox ?? null) as { provider: string; email_address: string } | null,
		seasons: seasons as { id: string; name: string }[],
		repBrands,
		selfBrandId: selfBrandId as string | null,
		user
	};
};
