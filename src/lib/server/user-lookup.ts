/**
 * Indexed lookups against auth.users.
 *
 * Several call sites resolved a user by calling
 * `supabaseAdmin.auth.admin.listUsers()` with no pagination and scanning the
 * result. That returns a single page, fifty users by default, so each of them
 * silently stopped working for anyone who signed up after the first fifty:
 * email intake fails to route a known sender, and the invite flows decide an
 * existing user does not exist and send a duplicate invitation.
 *
 * The failure mode is invisible. Nothing errors; the scan simply does not find
 * someone who is there.
 *
 * These wrap the `get_user_id_by_email` RPC that already existed for the
 * messaging identity flow, plus a companion for the reverse direction, so a
 * lookup is one indexed query regardless of how many users exist.
 */
import { supabaseAdmin } from './supabase.js';

/**
 * Resolve an email address to its auth user id, or null.
 *
 * Matching is case-insensitive: the RPC lowercases the input and Supabase
 * stores addresses lowercased. Two of the scans this replaces compared with
 * `===`, so a capitalised address went unrecognised.
 */
export async function findUserIdByEmail(email: string): Promise<string | null> {
	const trimmed = email.trim();
	if (!trimmed) return null;

	const { data, error } = await supabaseAdmin.rpc('get_user_id_by_email', {
		lookup_email: trimmed
	});

	if (error) {
		console.error('[user-lookup] get_user_id_by_email failed:', error.message);
		return null;
	}

	const rows = (data ?? []) as Array<{ id: string }>;
	return rows[0]?.id ?? null;
}

/**
 * Resolve user ids to their email addresses.
 *
 * Returns a map keyed by id so callers can index into it directly rather than
 * scanning, which is what the code being replaced was doing.
 */
export async function findEmailsByUserIds(userIds: string[]): Promise<Record<string, string>> {
	const unique = [...new Set(userIds.filter(Boolean))];
	if (unique.length === 0) return {};

	const { data, error } = await supabaseAdmin.rpc('get_user_emails_by_ids', {
		lookup_ids: unique
	});

	if (error) {
		console.error('[user-lookup] get_user_emails_by_ids failed:', error.message);
		return {};
	}

	const rows = (data ?? []) as Array<{ id: string; email: string | null }>;
	const map: Record<string, string> = {};
	for (const row of rows) {
		if (row.email) map[row.id] = row.email;
	}
	return map;
}
