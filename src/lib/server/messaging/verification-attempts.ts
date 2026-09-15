/**
 * Failed phone-verification attempts, persisted.
 *
 * The counter behind MAX_ATTEMPTS was a module-level `Map` in the webhook
 * handler. On Fluid Compute that lives per instance, so the cap reset whenever
 * a request landed on a fresh one. Anyone willing to keep texting outlasted it
 * without trying, and every attempt costs us an outbound SMS.
 *
 * It also never pruned, so the map grew for the life of each instance.
 *
 * This matters beyond the counter: unverified senders produce no
 * `messaging_messages` rows, so the per-sender rate limit cannot see them
 * either. This table is the only durable trace of a stranger repeatedly texting
 * our number.
 */
import { supabaseAdmin } from '$lib/server/supabase.js';

/**
 * Count failed attempts for a number.
 *
 * Returns 0 on a read failure rather than a number that would lock someone out:
 * a database hiccup should not look like abuse. The insert side is where the
 * limit is actually enforced.
 */
export async function getVerificationAttempts(phone: string): Promise<number> {
	const { data, error } = await supabaseAdmin
		.from('messaging_verification_attempts')
		.select('attempts')
		.eq('phone_number', phone)
		.maybeSingle();

	if (error) {
		console.error('[messaging] verification attempt read failed:', error.message);
		return 0;
	}

	return (data as { attempts?: number } | null)?.attempts ?? 0;
}

/**
 * Record a failed attempt and return the new total.
 *
 * Increment happens in the database rather than as read-then-write here, so two
 * concurrent messages from the same number cannot both read the same count and
 * both get through.
 */
export async function recordVerificationAttempt(phone: string): Promise<number> {
	const { data, error } = await supabaseAdmin.rpc('record_verification_attempt', {
		lookup_phone: phone
	});

	if (error) {
		console.error('[messaging] verification attempt write failed:', error.message);
		return 0;
	}

	return typeof data === 'number' ? data : 0;
}

/** Clear the record once a number verifies successfully. */
export async function clearVerificationAttempts(phone: string): Promise<void> {
	const { error } = await supabaseAdmin
		.from('messaging_verification_attempts')
		.delete()
		.eq('phone_number', phone);

	if (error) console.error('[messaging] verification attempt clear failed:', error.message);
}
