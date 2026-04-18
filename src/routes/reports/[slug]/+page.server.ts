import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type { OrgType } from '$lib/types/database';

const repReportTitles: Record<string, string> = {
	'sales-by-brand': 'Sales by Brand',
	'sales-by-account': 'Sales by Account',
	'sales-by-territory': 'Sales by Territory',
	'sales-by-rep': 'Sales by Rep',
	commission: 'Commission Report',
	pipeline: 'Order Pipeline',
	'season-comparison': 'Season Comparison',
	'show-performance': 'Show Performance'
};

const brandReportTitles: Record<string, string> = {
	'sales-by-rep': 'Sales by Rep',
	'product-performance': 'Product Performance',
	'territory-coverage': 'Territory Coverage',
	'account-penetration': 'Account Penetration',
	'season-sell-through': 'Season Sell-Through'
};

function titleFor(orgType: OrgType, slug: string): string | null {
	if (orgType === 'brand') return brandReportTitles[slug] ?? null;
	return repReportTitles[slug] ?? null;
}

export const load: PageServerLoad = async ({ locals, params, url }) => {
	const { supabase, organization } = locals;
	const report = params.slug;

	const title = titleFor(locals.orgType, report);
	if (!title) throw error(404, 'Report not found');
	if (!organization) return { report, title, year: new Date().getFullYear(), rows: [] };

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
				const brandsJoin = o.brands as { name?: string } | { name?: string }[] | null;
				const name =
					(Array.isArray(brandsJoin) ? brandsJoin[0]?.name : brandsJoin?.name) ?? 'Unknown';
				const existing = brands.get(o.brand_id);
				if (existing) {
					existing.orders++;
					existing.revenue += Number(o.total_amount);
				} else brands.set(o.brand_id, { name, orders: 1, revenue: Number(o.total_amount) });
			}
			return {
				report,
				title,
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
				const accountsJoin = o.accounts as
					| { business_name?: string }
					| { business_name?: string }[]
					| null;
				const name =
					(Array.isArray(accountsJoin)
						? accountsJoin[0]?.business_name
						: accountsJoin?.business_name) ?? 'Unknown';
				const existing = accounts.get(o.account_id);
				if (existing) {
					existing.orders++;
					existing.revenue += Number(o.total_amount);
				} else accounts.set(o.account_id, { name, orders: 1, revenue: Number(o.total_amount) });
			}
			return {
				report,
				title,
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
				const accountsJoin = o.accounts as
					| { territories?: { name?: string } | { name?: string }[] | null }
					| { territories?: { name?: string } | { name?: string }[] | null }[]
					| null;
				const acct = Array.isArray(accountsJoin) ? accountsJoin[0] : accountsJoin;
				const terrJoin = acct?.territories;
				const terr = (Array.isArray(terrJoin) ? terrJoin[0]?.name : terrJoin?.name) ?? 'Unassigned';
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
				title,
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
			if (locals.orgType === 'brand') {
				const { loadSalesByRep } = await import('$lib/server/reports/brand/salesByRep');
				const rows = await loadSalesByRep(supabase, orgId, year);
				return { report, title, year, rows, variant: 'brand' as const };
			}
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

			type MemberRow = {
				profile_id: string;
				profiles?: { display_name?: string } | { display_name?: string }[] | null;
			};
			const pickDisplayName = (
				profiles: { display_name?: string } | { display_name?: string }[] | null | undefined
			): string =>
				(Array.isArray(profiles) ? profiles[0]?.display_name : profiles?.display_name) ?? 'Unknown';
			const nameMap = new Map(
				((members ?? []) as MemberRow[]).map((m) => [m.profile_id, pickDisplayName(m.profiles)])
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
				title,
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

			type CommMemberRow = {
				id: string;
				profile_id: string;
				profiles?: { display_name?: string } | { display_name?: string }[] | null;
			};
			const pickName = (
				profiles: { display_name?: string } | { display_name?: string }[] | null | undefined
			): string =>
				(Array.isArray(profiles) ? profiles[0]?.display_name : profiles?.display_name) ?? 'Unknown';
			const profileToMember = new Map(
				((members ?? []) as CommMemberRow[]).map((m) => [m.profile_id, m.id])
			);
			const memberToName = new Map(
				((members ?? []) as CommMemberRow[]).map((m) => [m.id, pickName(m.profiles)])
			);
			const commMap = new Map(
				(
					(memberCommissions ?? []) as Array<{ member_id: string; brand_id: string; rate: number }>
				).map((mc) => [`${mc.member_id}-${mc.brand_id}`, mc.rate])
			);

			type CommOrderRow = {
				id: string;
				total_amount: number;
				shipped_amount?: number | null;
				brand_id: string;
				created_by: string;
				brands?:
					| { name?: string; commission_rate?: number }
					| { name?: string; commission_rate?: number }[]
					| null;
				accounts?: { business_name?: string } | { business_name?: string }[] | null;
			};
			const rows = ((orders ?? []) as CommOrderRow[])
				.map((o) => {
					const amount = Number(o.shipped_amount ?? o.total_amount);
					const brandObj = Array.isArray(o.brands) ? o.brands[0] : o.brands;
					const acctObj = Array.isArray(o.accounts) ? o.accounts[0] : o.accounts;
					const brandRate = brandObj?.commission_rate ?? 0;
					const memberId = profileToMember.get(o.created_by);
					const repRate = memberId ? (commMap.get(`${memberId}-${o.brand_id}`) ?? 0) : 0;
					return {
						brand: brandObj?.name ?? 'Unknown',
						account: acctObj?.business_name ?? 'Unknown',
						orderAmount: amount,
						brandRate,
						brandCommission: (amount * brandRate) / 100,
						rep: memberToName.get(memberId ?? '') ?? 'Unknown',
						repRate,
						repCommission: (amount * repRate) / 100
					};
				})
				.sort((a, b) => b.orderAmount - a.orderAmount);

			return { report, title, year, rows };
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
			return { report, title, year, rows: Array.from(statuses.values()) };
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
				const seasonsJoin = o.seasons as { name?: string } | { name?: string }[] | null;
				const name =
					(Array.isArray(seasonsJoin) ? seasonsJoin[0]?.name : seasonsJoin?.name) ?? 'Unknown';
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
				title,
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

			type ShowDateRow = {
				id: string;
				year: number;
				month: number;
				city: string | null;
				state: string | null;
				shows?: { name?: string } | { name?: string }[] | null;
			};
			const showDateRows = (showDates ?? []) as ShowDateRow[];
			const dateIds = showDateRows.map((sd) => sd.id);
			if (dateIds.length === 0) return { report, title, year, rows: [] };

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
			const ordersData = (ordersRes.data ?? []) as Array<{
				show_date_id: string;
				total_amount: number;
			}>;
			const visitsData = (visitsRes.data ?? []) as Array<{
				show_date_id: string;
				is_new_account?: boolean;
			}>;
			const apptsData = (apptsRes.data ?? []) as Array<{ show_date_id: string }>;
			const rows = showDateRows.map((sd) => {
				const showName = Array.isArray(sd.shows)
					? (sd.shows[0]?.name ?? 'Unknown')
					: (sd.shows?.name ?? 'Unknown');
				const sdOrders = ordersData.filter((o) => o.show_date_id === sd.id);
				const sdVisits = visitsData.filter((v) => v.show_date_id === sd.id);
				const sdAppts = apptsData.filter((a) => a.show_date_id === sd.id);
				return {
					show: `${showName} — ${months[sd.month - 1]} ${sd.year}`,
					location: [sd.city, sd.state].filter(Boolean).join(', '),
					orders: sdOrders.length,
					revenue: sdOrders.reduce((sum, o) => sum + Number(o.total_amount), 0),
					visits: sdVisits.length,
					newAccounts: sdVisits.filter((v) => v.is_new_account).length,
					appointments: sdAppts.length
				};
			});
			return { report, title, year, rows };
		}

		case 'product-performance': {
			const { loadProductPerformance } =
				await import('$lib/server/reports/brand/productPerformance');
			const daysBack = parseInt(url.searchParams.get('days') ?? '') || 90;
			const rows = await loadProductPerformance(supabase, orgId, daysBack);
			return { report, title, year, rows, daysBack };
		}

		case 'territory-coverage': {
			if (locals.orgType !== 'brand') throw error(404, 'Report not found');
			const { loadTerritoryCoverage } = await import('$lib/server/reports/brand/territoryCoverage');
			const rows = await loadTerritoryCoverage(supabase, orgId, year);
			return { report, title, year, rows, variant: 'brand' as const };
		}

		case 'account-penetration': {
			if (locals.orgType !== 'brand') throw error(404, 'Report not found');
			const { loadAccountPenetration } =
				await import('$lib/server/reports/brand/accountPenetration');
			const rows = await loadAccountPenetration(supabase, orgId, year);
			return { report, title, year, rows, variant: 'brand' as const };
		}

		case 'season-sell-through': {
			if (locals.orgType !== 'brand') throw error(404, 'Report not found');
			const { loadSeasonSellThrough } = await import('$lib/server/reports/brand/seasonSellThrough');
			const rows = await loadSeasonSellThrough(supabase, orgId, year);
			return { report, title, year, rows, variant: 'brand' as const };
		}

		default:
			throw error(404, 'Report not found');
	}
};
