import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const { supabase, organization } = locals;

	if (!organization)
		return {
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

	const status = url.searchParams.get('status');
	const brandId = url.searchParams.get('brand');
	const category = url.searchParams.get('category');

	const isSales = locals.membership?.role === 'sales';

	let query = supabase
		.from('brand_expenses')
		.select(
			'*, brands(name), profiles!brand_expenses_submitted_by_fkey(display_name), reviewer:profiles!brand_expenses_reviewed_by_fkey(display_name)'
		)
		.eq('organization_id', organization.id)
		.order('created_at', { ascending: false });

	if (isSales) query = query.eq('submitted_by', locals.user?.id);
	if (status) query = query.eq('status', status);
	if (brandId) query = query.eq('brand_id', brandId);
	if (category) query = query.eq('category', category);

	const [expensesResult, brandsResult] = await Promise.all([
		query,
		supabase
			.from('brands')
			.select('id, name')
			.eq('organization_id', organization.id)
			.eq('is_active', true)
			.order('name')
	]);

	const expenses = expensesResult.data ?? [];

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

	const metrics = {
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
	};

	return {
		expenses,
		brands: brandsResult.data ?? [],
		metrics
	};
};
