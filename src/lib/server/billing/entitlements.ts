import type { SupabaseClient } from '@supabase/supabase-js';
import type { OrgType } from '$lib/types/database.js';
import {
	effectivePlan,
	limitsFor,
	takesSeat,
	withinLimit,
	type PlanLimits
} from '$lib/billing/entitlements.js';
import { isBetaActive } from '$lib/server/beta.js';
import { logSupabaseError } from '$lib/server/log-supabase-error.js';

/**
 * Plan enforcement (SCO-47). Every gate goes through here.
 *
 * Off while the beta is active: every check passes and nothing is read, so
 * the beta keeps full access. Once BETA_ENABLED is "false", each org is held
 * to its live subscription's limits, or the free tier without one.
 *
 * Gates only refuse growth. An org already over a limit (for example after a
 * downgrade) keeps what it has; it just cannot add more.
 *
 * Callers pass the admin client because the counts span rows the caller may
 * not see through RLS (pending invitations, the other side of a connection).
 * Every query is keyed on an org id the caller derived on the server.
 */

export type LimitCheck = { ok: true } | { ok: false; message: string };

const OK: LimitCheck = { ok: true };

function plural(n: number, one: string, many: string): string {
	return `${n} ${n === 1 ? one : many}`;
}

/** The limits an org is held to, or null when nothing is enforced. */
export async function getOrgLimits(
	admin: SupabaseClient,
	orgId: string,
	orgType: OrgType
): Promise<PlanLimits | null> {
	if (isBetaActive()) return null;
	const { data, error } = await admin
		.from('organization_subscriptions')
		.select('plan, status')
		.eq('organization_id', orgId)
		.maybeSingle();
	logSupabaseError('entitlements subscription', error);
	return limitsFor(orgType, effectivePlan(orgType, data));
}

async function countSeats(
	admin: SupabaseClient,
	orgId: string,
	includePendingInvites: boolean
): Promise<number> {
	const { count: members, error } = await admin
		.from('organization_members')
		.select('id', { count: 'exact', head: true })
		.eq('organization_id', orgId)
		.neq('role', 'guest');
	logSupabaseError('entitlements seat count', error);
	let total = members ?? 0;

	if (includePendingInvites) {
		const { count: pending, error: invError } = await admin
			.from('invitations')
			.select('id', { count: 'exact', head: true })
			.eq('organization_id', orgId)
			.is('accepted_at', null)
			.gt('expires_at', new Date().toISOString())
			.neq('role', 'guest');
		logSupabaseError('entitlements pending invite count', invError);
		total += pending ?? 0;
	}
	return total;
}

/**
 * May the org take on one more person in `role`?
 *
 * At invite time pending invitations count, so an org cannot send more
 * invitations than it has seats. At accept time they don't: the invitation
 * being accepted already held its seat.
 */
export async function checkSeatLimit(
	admin: SupabaseClient,
	org: { id: string; orgType: OrgType },
	role: string,
	stage: 'invite' | 'accept'
): Promise<LimitCheck> {
	if (!takesSeat(role)) return OK;
	const limits = await getOrgLimits(admin, org.id, org.orgType);
	if (!limits || limits.seats === null) return OK;
	const used = await countSeats(admin, org.id, stage === 'invite');
	if (withinLimit(limits.seats, used)) return OK;
	return {
		ok: false,
		message: `Your plan includes ${plural(limits.seats, 'seat', 'seats')}, and all are taken. Guests don't use a seat. Upgrade in Billing to add more people.`
	};
}

async function countActiveConnections(
	admin: SupabaseClient,
	orgId: string,
	side: 'rep_org_id' | 'brand_org_id'
): Promise<number> {
	const { count, error } = await admin
		.from('org_connections')
		.select('id', { count: 'exact', head: true })
		.eq(side, orgId)
		.eq('status', 'active');
	logSupabaseError('entitlements connection count', error);
	return count ?? 0;
}

/**
 * May this rep org and brand org become actively connected?
 *
 * Both sides are checked: the rep org against its brand connections, the
 * brand org against its connected reps. `actor` decides the wording, so each
 * side reads about its own plan in the first person and the other's in the
 * third.
 */
export async function checkConnectionLimit(
	admin: SupabaseClient,
	pair: { repOrgId: string; brandOrgId: string },
	actor: 'rep' | 'brand'
): Promise<LimitCheck> {
	const [repLimits, brandLimits] = await Promise.all([
		getOrgLimits(admin, pair.repOrgId, 'rep'),
		getOrgLimits(admin, pair.brandOrgId, 'brand')
	]);

	const repCap = repLimits?.brandConnections ?? null;
	if (repCap !== null) {
		const used = await countActiveConnections(admin, pair.repOrgId, 'rep_org_id');
		if (!withinLimit(repCap, used)) {
			return {
				ok: false,
				message:
					actor === 'rep'
						? `Your plan includes ${plural(repCap, 'brand connection', 'brand connections')}, and all are in use. Upgrade in Billing to connect more brands.`
						: `This rep's plan has no room for another brand connection. They can upgrade, then request again.`
			};
		}
	}

	const brandCap = brandLimits?.connectedReps ?? null;
	if (brandCap !== null) {
		const used = await countActiveConnections(admin, pair.brandOrgId, 'brand_org_id');
		if (!withinLimit(brandCap, used)) {
			return {
				ok: false,
				message:
					actor === 'brand'
						? `Your plan includes ${plural(brandCap, 'connected rep', 'connected reps')}, and all are in use. Upgrade in Billing to connect more reps.`
						: `This brand's plan has no room for another rep right now. Ask them to upgrade, then request again.`
			};
		}
	}

	return OK;
}
