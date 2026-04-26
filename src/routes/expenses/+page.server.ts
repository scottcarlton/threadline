import type { PageServerLoad } from './$types';
import { supabaseAdmin } from '$lib/server/supabase.js';
import { getNxBlsrBrandOrgIds, isNxBlsr } from '$lib/server/nx-blsr';

export const load: PageServerLoad = async ({ locals, url, depends }) => {
	depends('data:expenses');
	const { organization, orgType, allMemberships } = locals;
	const brandOrgIds = getNxBlsrBrandOrgIds(allMemberships);
	const nxBlsr = isNxBlsr(brandOrgIds);

	const emptyReturn = {
		expenses: [],
		brands: [],
		metrics: {
			totalPending: 0,
			totalApproved: 0,
			totalRejected: 0,
			avgExpense: 0,
			pendingCount: 0,
			approvedCount: 0,
			rejectedCount: 0
		}
	};

	if (!organization) return emptyReturn;

	const status = url.searchParams.get('status');
	const brandId = url.searchParams.get('brand');
	const category = url.searchParams.get('category');
	const isSales = locals.membership?.role === 'sales';

	// ── Own-org expenses ──
	// MBISR sees expenses they submitted in their own org. Nx-BLSR (sales-role
	// in 2+ brand-orgs) sees expenses they submitted across the union of their
	// brand-org memberships, so the page shows their full expense activity.
	const ownOrgIds = nxBlsr ? brandOrgIds : [organization.id];
	let ownQuery = supabaseAdmin
		.from('brand_expenses')
		.select(
			'*, brands(name), profiles!brand_expenses_submitted_by_fkey(display_name), reviewer:profiles!brand_expenses_reviewed_by_fkey(display_name)'
		)
		.in('organization_id', ownOrgIds)
		.order('created_at', { ascending: false });

	if (isSales) ownQuery = ownQuery.eq('submitted_by', locals.user?.id);
	if (status) ownQuery = ownQuery.eq('status', status);
	if (brandId) ownQuery = ownQuery.eq('brand_id', brandId);
	if (category) ownQuery = ownQuery.eq('category', category);

	const ownResult = await ownQuery;
	const expenses = ownResult.data ?? [];

	// ── BOA sees expenses from connected reps on BOA's brands ──
	// Nx-BLSR is sales-role and excluded by `!isSales` — they don't see federated
	// reviewer expenses, just their own (which already covers all their orgs above).
	if (orgType === 'brand' && !isSales) {
		// Get this brand org's brand IDs
		const { data: boaBrands } = await supabaseAdmin
			.from('brands')
			.select('id')
			.in('organization_id', ownOrgIds)
			.eq('is_active', true);
		const boaBrandIds = (boaBrands ?? []).map((b) => b.id);

		if (boaBrandIds.length > 0) {
			let fedQuery = supabaseAdmin
				.from('brand_expenses')
				.select(
					'*, brands(name), profiles!brand_expenses_submitted_by_fkey(display_name), reviewer:profiles!brand_expenses_reviewed_by_fkey(display_name)'
				)
				.in('brand_id', boaBrandIds)
				.not('organization_id', 'in', `(${ownOrgIds.join(',')})`)
				.order('created_at', { ascending: false });

			if (status) fedQuery = fedQuery.eq('status', status);
			if (brandId) fedQuery = fedQuery.eq('brand_id', brandId);
			if (category) fedQuery = fedQuery.eq('category', category);

			const fedResult = await fedQuery;
			const fedExpenses = fedResult.data ?? [];

			// Dedupe by id, combine
			const seen = new Set(expenses.map((e) => e.id));
			for (const e of fedExpenses) {
				if (!seen.has(e.id)) expenses.push(e);
			}
			// Re-sort newest first
			expenses.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
		}
	}

	// Brands for filter dropdown
	const { data: brands } = await supabaseAdmin
		.from('brands')
		.select('id, name')
		.eq('is_active', true)
		.order('name');

	let totalPending = 0;
	let totalApproved = 0;
	let totalRejected = 0;
	let pendingCount = 0;
	let approvedCount = 0;
	let rejectedCount = 0;

	for (const e of expenses) {
		const amount = Number(e.amount) || 0;
		if (e.status === 'submitted') {
			totalPending += amount;
			pendingCount++;
		} else if (e.status === 'approved') {
			totalApproved += amount;
			approvedCount++;
		} else if (e.status === 'rejected') {
			totalRejected += amount;
			rejectedCount++;
		}
	}

	return {
		expenses,
		brands: brands ?? [],
		metrics: {
			totalPending,
			totalApproved,
			totalRejected,
			avgExpense:
				expenses.length > 0
					? expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0) / expenses.length
					: 0,
			pendingCount,
			approvedCount,
			rejectedCount
		}
	};
};
