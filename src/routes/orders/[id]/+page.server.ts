import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { supabaseAdmin } from '$lib/server/supabase.js';

export const load: PageServerLoad = async ({ locals, params }) => {
	const { supabase, organization, orgType } = locals;

	const [orderResult, linesResult] = await Promise.all([
		supabase
			.from('orders')
			.select(
				'*, brands(name, commission_rate), accounts(business_name, contact_email), seasons(name), shows(name), profiles!orders_created_by_fkey(display_name), source_types(name), season_deliveries!delivery_id(label, delivery_month, delivery_day), show_dates(id, year, month, city, state, shows(name)), account_locations!location_id(label, address_line1, address_line2, city, state, zip)'
			)
			.eq('id', params.id)
			.single(),
		supabase.from('order_lines').select('*').eq('order_id', params.id).order('sort_order')
	]);

	if (orderResult.error || !orderResult.data) {
		throw error(404, 'Order not found');
	}

	// Mark this order as viewed by the current user. Drives the Orders nav badge
	// ('unviewed' drops once the user opens the detail page). Best-effort — don't
	// fail the page load if the upsert errors.
	if (locals.user?.id) {
		await supabaseAdmin.from('order_views').upsert(
			{
				order_id: params.id,
				profile_id: locals.user.id,
				viewed_at: new Date().toISOString()
			},
			{ onConflict: 'order_id,profile_id' }
		);
	}

	// Load brand assets, commission override, rep info, comments, and audits in parallel
	const [brandAssetsRes, overrideRes, repRes, commentsRes, auditsRes] = await Promise.all([
		supabase
			.from('brand_assets')
			.select('*')
			.eq('brand_id', orderResult.data.brand_id)
			.order('created_at', { ascending: false }),
		supabase
			.from('commission_overrides')
			.select('rate')
			.eq('brand_id', orderResult.data.brand_id)
			.eq('account_id', orderResult.data.account_id)
			.single(),
		supabase
			.from('organization_members')
			.select('id, commission_rate, profiles!organization_members_profile_id_fkey(display_name)')
			.eq('profile_id', orderResult.data.created_by)
			.single(),
		// Use supabaseAdmin for comments + audits — order visibility is already
		// enforced by the orders SELECT above (404 if the user can't see it).
		// RLS on order_comments / order_audits was previously returning empty
		// for brand admins viewing direct orders because of nested-policy eval
		// quirks. Admin read is safe here.
		supabaseAdmin
			.from('order_comments')
			.select('*, profiles:author_id(display_name), source_org:source_org_id(id, name)')
			.eq('order_id', params.id)
			.order('created_at', { ascending: true }),
		supabaseAdmin
			.from('order_audits')
			.select('*, actor:actor_id(display_name)')
			.eq('order_id', params.id)
			.order('created_at', { ascending: false })
	]);

	// Look up per-brand commission for the rep, fall back to their default rate
	let repCommissionRate = repRes.data?.commission_rate ?? 0;
	if (repRes.data?.id) {
		const { data: brandCommission } = await supabase
			.from('member_brand_commissions')
			.select('rate')
			.eq('member_id', repRes.data.id)
			.eq('brand_id', orderResult.data.brand_id)
			.single();
		if (brandCommission) {
			repCommissionRate = brandCommission.rate;
		}
	}

	// Federation context: is this a federated order viewed from the brand side?
	let federation: {
		isFederatedView: boolean;
		sourceOrg: { id: string; name: string } | null;
		repDisplayName: string | null;
	} = { isFederatedView: false, sourceOrg: null, repDisplayName: null };

	if (orgType === 'brand' && organization && orderResult.data.organization_id !== organization.id) {
		// Admin client so we can read the rep org + rep user across org boundaries.
		const { data: link } = await supabaseAdmin
			.from('federated_order_links')
			.select('source_org_id, source_org:source_org_id(id, name)')
			.eq('order_id', params.id)
			.eq('target_org_id', organization.id)
			.eq('status', 'active')
			.maybeSingle();
		if (link) {
			// Supabase sometimes types foreign-key joins as an array; normalize.
			const rawSourceOrg = (link as unknown as { source_org: unknown }).source_org;
			const sourceOrg = Array.isArray(rawSourceOrg)
				? ((rawSourceOrg[0] ?? null) as { id: string; name: string } | null)
				: ((rawSourceOrg ?? null) as { id: string; name: string } | null);
			federation = {
				isFederatedView: true,
				sourceOrg,
				repDisplayName:
					(orderResult.data as { profiles?: { display_name?: string | null } | null }).profiles
						?.display_name ?? null
			};
		}
	}

	return {
		order: orderResult.data,
		lines: linesResult.data ?? [],
		brandAssets: brandAssetsRes.data ?? [],
		commissionOverride: overrideRes.data?.rate ?? null,
		repCommissionRate,
		repName: (() => {
			const profilesJoin = repRes.data?.profiles as
				| { display_name?: string }
				| { display_name?: string }[]
				| null
				| undefined;
			if (!profilesJoin) return null;
			return (
				(Array.isArray(profilesJoin) ? profilesJoin[0]?.display_name : profilesJoin.display_name) ??
				null
			);
		})(),
		comments: commentsRes.data ?? [],
		audits: auditsRes.data ?? [],
		federation
	};
};
