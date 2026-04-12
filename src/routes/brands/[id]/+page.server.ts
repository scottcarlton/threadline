import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	if (locals.isBuyer) throw redirect(303, '/shop');
	const { supabase } = locals;

	const [brandResult, assetsResult, productCountResult, expenseSummaryResult] = await Promise.all([
		supabase
			.from('brands')
			.select('*')
			.eq('id', params.id)
			.single(),
		supabase
			.from('brand_assets')
			.select('*')
			.eq('brand_id', params.id)
			.order('created_at', { ascending: false }),
		supabase
			.from('products')
			.select('id', { count: 'exact', head: true })
			.eq('brand_id', params.id)
			.is('archived_at', null),
		supabase
			.from('brand_expenses')
			.select('status, amount')
			.eq('brand_id', params.id)
	]);

	if (brandResult.error || !brandResult.data) {
		throw error(404, 'Brand not found');
	}

	const allExpenses = expenseSummaryResult.data ?? [];
	const pendingExpenses = allExpenses.filter((e) => e.status === 'submitted');
	const expenseSummary = {
		total: allExpenses.length,
		pendingCount: pendingExpenses.length,
		pendingAmount: pendingExpenses.reduce((s, e) => s + Number(e.amount), 0)
	};

	return {
		brand: brandResult.data,
		brandAssets: assetsResult.data ?? [],
		productCount: productCountResult.count ?? 0,
		expenseSummary
	};
};
