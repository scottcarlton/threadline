import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

const reportTitles: Record<string, string> = {
	'sales-by-brand': 'Sales by Brand',
	'sales-by-account': 'Sales by Account',
	'sales-by-territory': 'Sales by Territory',
	'sales-by-rep': 'Sales by Rep',
	commission: 'Commission Report',
	pipeline: 'Order Pipeline',
	'season-comparison': 'Season Comparison',
	'show-performance': 'Show Performance'
};

export const load: PageServerLoad = async ({ locals, params, url }) => {
	const { supabase, organization } = locals;
	const report = params.slug;

	if (!reportTitles[report]) throw error(404, 'Report not found');
	if (!organization)
		return { report, title: reportTitles[report], year: new Date().getFullYear(), rows: [] };

	const orgId = organization.id;
	const year = parseInt(url.searchParams.get('year') ?? '') || new Date().getFullYear();
	const brandScope = locals.brandScope as string[] | null;
	const isSales = locals.membership?.role === 'sales';

	const userId = locals.user?.id;

	// Helper: apply brand scope filter to any query with a brand_id column
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	function scopeByBrand(query: any) {
		return brandScope && brandScope.length > 0 ? query.in('brand_id', brandScope) : query;
	}

	// Helper: scope to sales rep's own orders
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	function scopeByRep(query: any) {
		return isSales && userId ? query.eq('created_by', userId) : query;
	}

	switch (report) {
		case 'sales-by-brand': {
			const { data: orders } = await scopeByRep(
				scopeByBrand(
					supabase
						.from('orders')
						.select('brand_id, total_amount, brands(name)')
						.eq('organization_id', orgId)
						.eq('order_year', year)
						.neq('status', 'cancelled')
				)
			);

			const brands = new Map<string, { name: string; orders: number; revenue: number }>();
			for (const o of orders ?? []) {
				const name = (o.brands as any)?.name ?? 'Unknown';
				const existing = brands.get(o.brand_id);
				if (existing) {
					existing.orders++;
					existing.revenue += Number(o.total_amount);
				} else brands.set(o.brand_id, { name, orders: 1, revenue: Number(o.total_amount) });
			}
			return {
				report,
				title: reportTitles[report],
				year,
				rows: Array.from(brands.values()).sort((a, b) => b.revenue - a.revenue)
			};
		}

		case 'sales-by-account': {
			const { data: orders } = await scopeByRep(
				scopeByBrand(
					supabase
						.from('orders')
						.select('account_id, total_amount, accounts(business_name)')
						.eq('organization_id', orgId)
						.eq('order_year', year)
						.neq('status', 'cancelled')
				)
			);

			const accounts = new Map<string, { name: string; orders: number; revenue: number }>();
			for (const o of orders ?? []) {
				const name = (o.accounts as any)?.business_name ?? 'Unknown';
				const existing = accounts.get(o.account_id);
				if (existing) {
					existing.orders++;
					existing.revenue += Number(o.total_amount);
				} else accounts.set(o.account_id, { name, orders: 1, revenue: Number(o.total_amount) });
			}
			return {
				report,
				title: reportTitles[report],
				year,
				rows: Array.from(accounts.values()).sort((a, b) => b.revenue - a.revenue)
			};
		}

		case 'sales-by-territory': {
			const { data: orders } = await scopeByRep(
				scopeByBrand(
					supabase
						.from('orders')
						.select('account_id, total_amount, accounts(business_name, territories(name))')
						.eq('organization_id', orgId)
						.eq('order_year', year)
						.neq('status', 'cancelled')
				)
			);

			const territories = new Map<
				string,
				{ name: string; orders: number; revenue: number; accounts: Set<string> }
			>();
			for (const o of orders ?? []) {
				const terr = (o.accounts as any)?.territories?.name ?? 'Unassigned';
				const existing = territories.get(terr);
				if (existing) {
					existing.orders++;
					existing.revenue += Number(o.total_amount);
					existing.accounts.add(o.account_id);
				} else
					territories.set(terr, {
						name: terr,
						orders: 1,
						revenue: Number(o.total_amount),
						accounts: new Set([o.account_id])
					});
			}
			return {
				report,
				title: reportTitles[report],
				year,
				rows: Array.from(territories.values())
					.map((t) => ({
						name: t.name,
						orders: t.orders,
						revenue: t.revenue,
						accountCount: t.accounts.size
					}))
					.sort((a, b) => b.revenue - a.revenue)
			};
		}

		case 'sales-by-rep': {
			const { data: orders } = await scopeByRep(
				scopeByBrand(
					supabase
						.from('orders')
						.select('created_by, total_amount')
						.eq('organization_id', orgId)
						.eq('order_year', year)
						.neq('status', 'cancelled')
				)
			);

			const { data: members } = await supabase
				.from('organization_members')
				.select('profile_id, profiles!organization_members_profile_id_fkey(display_name)')
				.eq('organization_id', orgId);

			const nameMap = new Map(
				(members ?? []).map((m: any) => [m.profile_id, m.profiles?.display_name ?? 'Unknown'])
			);
			const reps = new Map<string, { name: string; orders: number; revenue: number }>();
			for (const o of orders ?? []) {
				const name = nameMap.get(o.created_by) ?? 'Unknown';
				const existing = reps.get(o.created_by);
				if (existing) {
					existing.orders++;
					existing.revenue += Number(o.total_amount);
				} else reps.set(o.created_by, { name, orders: 1, revenue: Number(o.total_amount) });
			}
			return {
				report,
				title: reportTitles[report],
				year,
				rows: Array.from(reps.values()).sort((a, b) => b.revenue - a.revenue)
			};
		}

		case 'commission': {
			const { data: orders } = await scopeByRep(
				scopeByBrand(
					supabase
						.from('orders')
						.select(
							'id, total_amount, shipped_amount, brand_id, created_by, brands(name, commission_rate), accounts(business_name)'
						)
						.eq('organization_id', orgId)
						.eq('order_year', year)
						.neq('status', 'cancelled')
				)
			);

			const { data: memberCommissions } = await supabase
				.from('member_brand_commissions')
				.select('member_id, brand_id, rate')
				.eq('organization_id', orgId);

			const { data: members } = await supabase
				.from('organization_members')
				.select('id, profile_id, profiles!organization_members_profile_id_fkey(display_name)')
				.eq('organization_id', orgId);

			const profileToMember = new Map((members ?? []).map((m: any) => [m.profile_id, m.id]));
			const memberToName = new Map(
				(members ?? []).map((m: any) => [m.id, m.profiles?.display_name ?? 'Unknown'])
			);
			const commMap = new Map(
				(memberCommissions ?? []).map((mc: any) => [`${mc.member_id}-${mc.brand_id}`, mc.rate])
			);

			const rows = (orders ?? [])
				.map((o: any) => {
					const amount = Number(o.shipped_amount ?? o.total_amount);
					const brandRate = o.brands?.commission_rate ?? 0;
					const memberId = profileToMember.get(o.created_by);
					const repRate = memberId ? (commMap.get(`${memberId}-${o.brand_id}`) ?? 0) : 0;
					return {
						brand: o.brands?.name ?? 'Unknown',
						account: o.accounts?.business_name ?? 'Unknown',
						orderAmount: amount,
						brandRate,
						brandCommission: (amount * brandRate) / 100,
						rep: memberToName.get(memberId ?? '') ?? 'Unknown',
						repRate,
						repCommission: (amount * repRate) / 100
					};
				})
				.sort((a: any, b: any) => b.orderAmount - a.orderAmount);

			return { report, title: reportTitles[report], year, rows };
		}

		case 'pipeline': {
			const { data: orders } = await scopeByRep(
				scopeByBrand(
					supabase
						.from('orders')
						.select('status, total_amount')
						.eq('organization_id', orgId)
						.neq('status', 'cancelled')
				)
			);

			const statuses = new Map<string, { status: string; count: number; total_amount: number }>();
			for (const o of orders ?? []) {
				const existing = statuses.get(o.status);
				if (existing) {
					existing.count++;
					existing.total_amount += Number(o.total_amount);
				} else
					statuses.set(o.status, {
						status: o.status,
						count: 1,
						total_amount: Number(o.total_amount)
					});
			}
			return { report, title: reportTitles[report], year, rows: Array.from(statuses.values()) };
		}

		case 'season-comparison': {
			const { data: orders } = await scopeByRep(
				scopeByBrand(
					supabase
						.from('orders')
						.select('total_amount, order_year, season_id, seasons(name)')
						.eq('organization_id', orgId)
						.neq('status', 'cancelled')
				)
			);

			const seasons = new Map<
				string,
				{ name: string; year: number; orders: number; revenue: number }
			>();
			for (const o of orders ?? []) {
				const key = `${o.season_id}-${o.order_year}`;
				const name = (o.seasons as any)?.name ?? 'Unknown';
				const existing = seasons.get(key);
				if (existing) {
					existing.orders++;
					existing.revenue += Number(o.total_amount);
				} else
					seasons.set(key, {
						name: `${name} ${o.order_year ?? ''}`.trim(),
						year: o.order_year ?? 0,
						orders: 1,
						revenue: Number(o.total_amount)
					});
			}
			return {
				report,
				title: reportTitles[report],
				year,
				rows: Array.from(seasons.values()).sort((a, b) => b.year - a.year || b.revenue - a.revenue)
			};
		}

		case 'show-performance': {
			const { data: showDates } = await supabase
				.from('show_dates')
				.select('id, year, month, city, state, shows(name)')
				.eq('organization_id', orgId)
				.order('year')
				.order('month');

			const dateIds = (showDates ?? []).map((sd: any) => sd.id);
			if (dateIds.length === 0) return { report, title: reportTitles[report], year, rows: [] };

			const [ordersRes, visitsRes, apptsRes] = await Promise.all([
				scopeByRep(
					scopeByBrand(
						supabase
							.from('orders')
							.select('show_date_id, total_amount')
							.eq('organization_id', orgId)
							.in('show_date_id', dateIds)
							.neq('status', 'cancelled')
					)
				),
				supabase
					.from('show_visits')
					.select('show_date_id, is_new_account')
					.in('show_date_id', dateIds),
				supabase.from('appointments').select('show_date_id').in('show_date_id', dateIds)
			]);

			const months = [
				'Jan',
				'Feb',
				'Mar',
				'Apr',
				'May',
				'Jun',
				'Jul',
				'Aug',
				'Sep',
				'Oct',
				'Nov',
				'Dec'
			];
			const rows = (showDates ?? []).map((sd: any) => {
				const showName = Array.isArray(sd.shows)
					? sd.shows[0]?.name
					: (sd.shows?.name ?? 'Unknown');
				const sdOrders = (ordersRes.data ?? []).filter((o: any) => o.show_date_id === sd.id);
				const sdVisits = (visitsRes.data ?? []).filter((v: any) => v.show_date_id === sd.id);
				const sdAppts = (apptsRes.data ?? []).filter((a: any) => a.show_date_id === sd.id);
				return {
					show: `${showName} — ${months[sd.month - 1]} ${sd.year}`,
					location: [sd.city, sd.state].filter(Boolean).join(', '),
					orders: sdOrders.length,
					revenue: sdOrders.reduce((sum: number, o: any) => sum + Number(o.total_amount), 0),
					visits: sdVisits.length,
					newAccounts: sdVisits.filter((v: any) => v.is_new_account).length,
					appointments: sdAppts.length
				};
			});
			return { report, title: reportTitles[report], year, rows };
		}

		default:
			throw error(404, 'Report not found');
	}
};
