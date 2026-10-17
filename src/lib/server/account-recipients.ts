import { supabaseAdmin } from '$lib/server/supabase';

/**
 * Addresses a document for this account may be sent to.
 *
 * The order send endpoint takes a caller-supplied `to` and its own comment
 * calls that "an exfiltration primitive, not just a leak". An invoice or a
 * credit memo has a correct recipient by definition, so there is no free-text
 * address: an override may only name a contact already attached to the account.
 *
 * Callers must already have established that the document, and so the
 * account, belongs to the caller's org; this reads by account id alone.
 */
export async function allowedRecipients(accountId: string | null): Promise<string[]> {
	if (!accountId) return [];

	const [{ data: account }, { data: locations }] = await Promise.all([
		supabaseAdmin.from('accounts').select('contact_email').eq('id', accountId).maybeSingle(),
		supabaseAdmin.from('account_locations').select('contact_email').eq('account_id', accountId)
	]);

	const emails = [
		account?.contact_email,
		...(locations ?? []).map((l) => (l as { contact_email: string | null }).contact_email)
	];

	return Array.from(
		new Set(
			emails.filter((e): e is string => Boolean(e && e.trim())).map((e) => e.trim().toLowerCase())
		)
	);
}
