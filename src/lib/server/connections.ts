import type { SupabaseClient } from '@supabase/supabase-js';

export type ConnectInvite = {
	id: string;
	code: string;
	use_count: number;
	last_used_at: string | null;
	created_at: string;
};

const COLUMNS = 'id, code, use_count, last_used_at, created_at';

function newCode(): string {
	const bytes = new Uint8Array(16);
	crypto.getRandomValues(bytes);
	return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Returns the single connect invite for a brand org. Idempotent — creates one if
 * missing. The org-creation trigger should normally seed it, so this is a
 * defensive fallback (tests, races, future schema changes).
 *
 * Caller is responsible for the Admin/Owner + brand-org role check.
 */
export async function getOrCreateConnectInvite(
	supabase: SupabaseClient,
	brandOrgId: string,
	createdBy: string
): Promise<ConnectInvite> {
	const { data: existing, error: selectErr } = await supabase
		.from('connection_invites')
		.select(COLUMNS)
		.eq('brand_org_id', brandOrgId)
		.maybeSingle();

	if (selectErr) throw selectErr;
	if (existing) return existing as ConnectInvite;

	const { data: inserted, error: insertErr } = await supabase
		.from('connection_invites')
		.insert({
			brand_org_id: brandOrgId,
			code: newCode(),
			created_by: createdBy,
			expires_at: null,
			max_uses: 0
		})
		.select(COLUMNS)
		.single();

	if (insertErr) throw insertErr;
	return inserted as ConnectInvite;
}

/**
 * Rotates the connect invite's code in place. Invalidates the old code
 * immediately. Resets use_count and last_used_at.
 */
/**
 * Rotates the invite code and stamps a commission rate for one-time use.
 * Called when a brand admin copies the connect link via the ShareLinkPicker.
 * Sets max_uses = 1 so the link is single-use; resets use_count to 0.
 */
export async function shareConnectInvite(
	supabase: SupabaseClient,
	brandOrgId: string,
	commissionRate: number
): Promise<ConnectInvite & { commission_rate: number }> {
	const rate = Math.max(0, Math.min(100, Number(commissionRate) || 0));
	const { data, error } = await supabase
		.from('connection_invites')
		.update({
			code: newCode(),
			commission_rate: rate,
			max_uses: 1,
			use_count: 0,
			last_used_at: null
		})
		.eq('brand_org_id', brandOrgId)
		.select(`${COLUMNS}, commission_rate`)
		.single();

	if (error) throw error;
	return data as ConnectInvite & { commission_rate: number };
}

export async function refreshConnectInvite(
	supabase: SupabaseClient,
	brandOrgId: string
): Promise<ConnectInvite> {
	const { data, error } = await supabase
		.from('connection_invites')
		.update({
			code: newCode(),
			use_count: 0,
			last_used_at: null
		})
		.eq('brand_org_id', brandOrgId)
		.select(COLUMNS)
		.single();

	if (error) throw error;
	return data as ConnectInvite;
}

/**
 * Called from the connection-claim path on a successful claim. Increments
 * use_count and stamps last_used_at. No-op if the code doesn't match an invite.
 */
export async function recordConnectInviteUse(
	supabase: SupabaseClient,
	code: string
): Promise<void> {
	const { data: invite } = await supabase
		.from('connection_invites')
		.select('id, use_count')
		.eq('code', code)
		.maybeSingle();

	if (!invite) return;

	await supabase
		.from('connection_invites')
		.update({
			use_count: (invite.use_count ?? 0) + 1,
			last_used_at: new Date().toISOString()
		})
		.eq('id', invite.id);
}
