import { supabaseAdmin } from '$lib/server/supabase.js';
import type { ReturnPolicy } from './credit.js';

/**
 * The issuing brand org's return policy.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * Why this uses supabaseAdmin
 * ───────────────────────────────────────────────────────────────────────────
 *
 * The policy lives on `organizations`, whose only SELECT policy is
 * `id IN get_user_org_ids()`. A buyer has no org at all and a rep is not a
 * member of the brand's org, so neither can read the row through RLS — yet the
 * window is the rule being enforced against exactly those two actors, and
 * `returns_policy_text` is written to be shown to them. Reading it through RLS
 * would return nothing and silently deny every buyer request.
 *
 * `compute_order_tax()` hit the same wall and answered it with SECURITY
 * DEFINER, because the tax rule has to run inside a trigger. This check runs in
 * the app layer, so a definer function would buy nothing but a migration.
 *
 * The read is kept narrow on purpose: only the seven `returns_*` columns, never
 * `select('*')`. `organizations` carries tax configuration, payment settings and
 * onboarding state that a buyer has no business seeing, and a widened select
 * here would hand all of it to whatever renders the result. Callers must have
 * already authorized the actor against the order or brand this org owns.
 */
export interface OrgReturnPolicy extends ReturnPolicy {
	policyText: string | null;
	returnAddress: {
		line1: string | null;
		line2: string | null;
		city: string | null;
		state: string | null;
		zip: string | null;
		country: string | null;
	};
	useShipFromAddress: boolean;
}

const POLICY_COLUMNS =
	'returns_window_days, returns_policy_text, returns_use_ship_from_address, returns_address_line1, returns_address_line2, returns_address_city, returns_address_state, returns_address_zip, returns_address_country, returns_restocking_fee_type, returns_restocking_fee_value, returns_buyer_pays_shipping';

type PolicyRow = {
	returns_window_days: number | null;
	returns_policy_text: string | null;
	returns_use_ship_from_address: boolean | null;
	returns_address_line1: string | null;
	returns_address_line2: string | null;
	returns_address_city: string | null;
	returns_address_state: string | null;
	returns_address_zip: string | null;
	returns_address_country: string | null;
	returns_restocking_fee_type: string | null;
	returns_restocking_fee_value: number | string | null;
	returns_buyer_pays_shipping: boolean | null;
};

/** Defaults match the column defaults in 20260425000005: returns off, no fee. */
export const DEFAULT_RETURN_POLICY: OrgReturnPolicy = {
	windowDays: 0,
	restockingFeeType: 'percent',
	restockingFeeValue: 0,
	buyerPaysShipping: false,
	policyText: null,
	useShipFromAddress: true,
	returnAddress: { line1: null, line2: null, city: null, state: null, zip: null, country: null }
};

export function toReturnPolicy(row: PolicyRow | null): OrgReturnPolicy {
	if (!row) return DEFAULT_RETURN_POLICY;
	const feeType = row.returns_restocking_fee_type === 'flat' ? 'flat' : 'percent';
	const feeValue = Number(row.returns_restocking_fee_value ?? 0);
	return {
		windowDays: Number(row.returns_window_days ?? 0),
		restockingFeeType: feeType,
		restockingFeeValue: Number.isFinite(feeValue) ? feeValue : 0,
		buyerPaysShipping: row.returns_buyer_pays_shipping ?? false,
		policyText: row.returns_policy_text,
		useShipFromAddress: row.returns_use_ship_from_address ?? true,
		returnAddress: {
			line1: row.returns_address_line1,
			line2: row.returns_address_line2,
			city: row.returns_address_city,
			state: row.returns_address_state,
			zip: row.returns_address_zip,
			country: row.returns_address_country
		}
	};
}

export async function loadReturnPolicy(organizationId: string): Promise<OrgReturnPolicy> {
	const { data } = await supabaseAdmin
		.from('organizations')
		.select(POLICY_COLUMNS)
		.eq('id', organizationId)
		.maybeSingle();

	return toReturnPolicy(data as PolicyRow | null);
}
