import type { ManagerScope } from '../scoping';
import { loadManagerScope } from '../scoping';
import { getNxBlsrBrandOrgIds, isNxBlsr } from '../nx-blsr';
import { supabaseAdmin } from '../supabase';

export type QueryScope =
	| {
			kind: 'internal';
			userId: string;
			orgType: 'brand' | 'rep';
			ownOrgIds: string[];
			boaBrandIds: string[];
			isSales: boolean;
			managerScope: ManagerScope | null;
	  }
	| {
			kind: 'buyer';
			userId: string;
			buyerAccountIds: string[];
			buyerBrandIds: string[];
	  };

export async function resolveQueryScope(locals: App.Locals): Promise<QueryScope | null> {
	if (locals.isBuyer && locals.user) {
		return {
			kind: 'buyer',
			userId: locals.user.id,
			buyerAccountIds: (locals.buyerAccounts ?? []).map((a) => a.account_id),
			buyerBrandIds: locals.buyerBrandIds ?? []
		};
	}

	if (!locals.organization || !locals.user) return null;

	const brandOrgIds = getNxBlsrBrandOrgIds(locals.allMemberships);
	const nxBlsr = isNxBlsr(brandOrgIds);
	const ownOrgIds = nxBlsr ? brandOrgIds : [locals.organization.id];
	const orgType = locals.orgType as 'brand' | 'rep';
	const isSales = locals.membership?.role === 'sales';

	let boaBrandIds: string[] = [];
	if (orgType === 'brand') {
		const { data } = await supabaseAdmin
			.from('brands')
			.select('id')
			.in('organization_id', ownOrgIds)
			.eq('is_active', true);
		boaBrandIds = (data ?? []).map((b: { id: string }) => b.id);
	}

	const managerScope =
		isSales && locals.user.id
			? await loadManagerScope(supabaseAdmin, locals.user.id, locals.membership?.id ?? null)
			: null;

	return {
		kind: 'internal',
		userId: locals.user.id,
		orgType,
		ownOrgIds,
		boaBrandIds,
		isSales,
		managerScope
	};
}
