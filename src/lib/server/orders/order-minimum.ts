import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveOrderSettings, type BrandCommerceSettings } from './resolve-order-settings.js';
import {
	effectiveOrderMinimum,
	minimumBlockedMessage,
	minimumOverrideNote,
	minimumShortfall,
	type MinimumAccount
} from '$lib/utils/order-minimum';

export type MinimumCheckOrder = {
	brand_id: string;
	account_id: string | null;
	total_amount: number | string | null;
};

export type MinimumViolation = {
	/** Index into the orders passed in. */
	index: number;
	brand_id: string;
	brand_name: string;
	minimum: number;
	shortfall: number;
	/** The actor's org owns the brand, so it may submit anyway. */
	canOverride: boolean;
	/** What to show the actor: a block for others, a note for the brand. */
	message: string;
};

/**
 * Which of these orders sit under their brand's minimum (SCO-137).
 *
 * Takes the caller's client rather than naming one: every call site has
 * already authorized the order, and some run as the service role. Pass
 * `settings` when the caller has already resolved them.
 */
export async function findMinimumViolations(
	client: SupabaseClient,
	orders: MinimumCheckOrder[],
	/**
	 * The acting org, or null when the actor can never override. Pass null for
	 * a buyer: a legacy buyer's `locals.organization` is the brand's own org,
	 * and a buyer must not inherit the brand's override.
	 */
	actorOrgId: string | null,
	settings?: Map<string, BrandCommerceSettings>
): Promise<MinimumViolation[]> {
	if (orders.length === 0) return [];
	const brandIds = Array.from(new Set(orders.map((o) => o.brand_id)));
	const resolved = settings ?? (await resolveOrderSettings(client, brandIds));

	const accountIds = Array.from(
		new Set(orders.map((o) => o.account_id).filter((id): id is string => Boolean(id)))
	);
	const [{ data: accountRows }, { data: brandRows }] = await Promise.all([
		accountIds.length
			? client
					.from('accounts')
					.select('id, organization_id, order_minimum_override')
					.in('id', accountIds)
			: Promise.resolve({ data: [] }),
		client.from('brands').select('id, name').in('id', brandIds)
	]);
	const accounts = new Map(
		((accountRows ?? []) as Array<{ id: string } & NonNullable<MinimumAccount>>).map((a) => [
			a.id,
			a
		])
	);
	const brandNames = new Map(
		((brandRows ?? []) as Array<{ id: string; name: string }>).map((b) => [b.id, b.name])
	);

	const violations: MinimumViolation[] = [];
	orders.forEach((order, index) => {
		const brandSettings = resolved.get(order.brand_id);
		if (!brandSettings) return;
		const account = order.account_id ? (accounts.get(order.account_id) ?? null) : null;
		const minimum = effectiveOrderMinimum(brandSettings, account);
		const shortfall = minimumShortfall(Number(order.total_amount ?? 0), minimum);
		if (minimum === null || shortfall === null) return;

		const canOverride = actorOrgId !== null && actorOrgId === brandSettings.owner_org_id;
		const brandName = brandNames.get(order.brand_id) ?? 'the brand';
		violations.push({
			index,
			brand_id: order.brand_id,
			brand_name: brandName,
			minimum,
			shortfall,
			canOverride,
			message: canOverride
				? minimumOverrideNote(minimum, shortfall)
				: minimumBlockedMessage(brandName, minimum, shortfall)
		});
	});
	return violations;
}

/** The violations that stop the actor from submitting. */
export function blockingViolations(violations: MinimumViolation[]): MinimumViolation[] {
	return violations.filter((v) => !v.canOverride);
}
