import { supabaseAdmin } from '$lib/server/supabase.js';

// Per-sender ceiling. This is the limit that actually protects us: it stops one
// phone number from driving unbounded Anthropic calls and outbound Twilio spend.
export const PER_SENDER_LIMIT_PER_HOUR = 120;

// Platform-wide circuit breaker, deliberately far above the per-sender ceiling.
// It exists to catch a distributed flood, not to cap normal traffic — a value
// close to PER_SENDER_LIMIT_PER_HOUR would let one busy org lock out everyone.
export const GLOBAL_LIMIT_PER_HOUR = 2000;

export type RateLimitVerdict =
	| { allowed: true }
	| { allowed: false; scope: 'sender' | 'global'; count: number };

/**
 * Pure decision half, split out so the thresholds are testable without a DB.
 * Sender is checked first: when both are breached, the sender is the cause.
 */
export function decideRateLimit(senderCount: number, globalCount: number): RateLimitVerdict {
	if (senderCount >= PER_SENDER_LIMIT_PER_HOUR) {
		return { allowed: false, scope: 'sender', count: senderCount };
	}
	if (globalCount >= GLOBAL_LIMIT_PER_HOUR) {
		return { allowed: false, scope: 'global', count: globalCount };
	}
	return { allowed: true };
}

/**
 * Count this hour's inbound messages for one phone number, and platform-wide.
 *
 * messaging_messages has no phone column — the number lives on the parent
 * messaging_sessions row — so the per-sender count joins through it with an
 * inner embed. Only inbound rows count; our own replies are not user requests.
 */
export async function checkInboundRateLimit(phone: string): Promise<RateLimitVerdict> {
	const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

	const [sender, global] = await Promise.all([
		supabaseAdmin
			.from('messaging_messages')
			.select('id, messaging_sessions!inner(phone_number)', { count: 'exact', head: true })
			.eq('messaging_sessions.phone_number', phone)
			.eq('direction', 'inbound')
			.gte('created_at', oneHourAgo),
		supabaseAdmin
			.from('messaging_messages')
			.select('id', { count: 'exact', head: true })
			.eq('direction', 'inbound')
			.gte('created_at', oneHourAgo)
	]);

	return decideRateLimit(sender.count ?? 0, global.count ?? 0);
}
