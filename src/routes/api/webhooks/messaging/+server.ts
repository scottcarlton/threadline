import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { parseTwilioWebhook, verifyTwilioSignature } from '$lib/server/messaging/inbound.js';
import {
	lookupByPhone,
	bindPhoneToUser,
	parseVerificationReply,
	getVerificationPrompt,
	getMaxAttemptsMessage,
	MAX_ATTEMPTS
} from '$lib/server/messaging/identity.js';
import {
	getOrCreateSession,
	appendToSession,
	recordMessage
} from '$lib/server/messaging/session.js';
import { runAgent } from '$lib/server/messaging/agent.js';
import { sendReply } from '$lib/server/messaging/send.js';
import { supabaseAdmin } from '$lib/server/supabase.js';
import { checkInboundRateLimit } from '$lib/server/messaging/rate-limit.js';
import {
	getVerificationAttempts,
	recordVerificationAttempt,
	clearVerificationAttempts
} from '$lib/server/messaging/verification-attempts.js';

export const POST: RequestHandler = async ({ request, url }) => {
	const body = await request.text();
	const params = new URLSearchParams(body);

	const signature = request.headers.get('x-twilio-signature') ?? '';
	const authToken = env.TWILIO_AUTH_TOKEN;
	if (!authToken) return json({ error: 'Not configured' }, { status: 500 });

	const isValid = verifyTwilioSignature(authToken, signature, url.toString(), params);
	if (!isValid) {
		return new Response('<Response></Response>', {
			status: 403,
			headers: { 'Content-Type': 'text/xml' }
		});
	}

	const message = parseTwilioWebhook(params);

	const verdict = await checkInboundRateLimit(message.from);
	if (!verdict.allowed) {
		// Drop silently rather than replying. A message over the ceiling is either
		// abuse or a runaway loop, and answering each one turns our own rate limit
		// into an outbound-SMS amplifier billed to us.
		console.warn(
			`[messaging] rate limited (${verdict.scope}) at ${verdict.count} inbound messages in the last hour`
		);
		return twimlResponse();
	}

	const identity = await lookupByPhone(message.from);

	if (!identity) {
		await handleVerification(message.from, message.body, message.channel);
		return twimlResponse();
	}

	const { data: membership } = await supabaseAdmin
		.from('organization_members')
		.select('organization_id, role, brand_scope')
		.eq('user_id', identity.userId)
		.limit(1)
		.maybeSingle();

	if (!membership) {
		await sendReply(
			message.from,
			"Your account isn't associated with any organization. Please contact your admin.",
			message.channel
		);
		return twimlResponse();
	}

	const orgMembership = membership as Record<string, unknown>;
	const organizationId = orgMembership.organization_id as string;
	const role = orgMembership.role as string;
	const brandScope = (orgMembership.brand_scope as string[] | null) ?? null;

	const { data: org } = await supabaseAdmin
		.from('organizations')
		.select('name, org_type')
		.eq('id', organizationId)
		.single();

	const orgRow = org as Record<string, unknown> | null;
	const orgName = (orgRow?.name as string) ?? 'your organization';
	const orgType = ((orgRow?.org_type as string) === 'brand' ? 'brand' : 'rep') as 'rep' | 'brand';

	const { data: profile } = await supabaseAdmin
		.from('profiles')
		.select('display_name')
		.eq('id', identity.userId)
		.single();

	const userName = ((profile as Record<string, unknown> | null)?.display_name as string) ?? 'there';

	const session = await getOrCreateSession(
		identity.profileId,
		organizationId,
		message.from,
		message.channel
	);

	await recordMessage(
		session.id,
		'inbound',
		message.body,
		message.messageId,
		message.mediaUrl,
		message.mediaType
	);

	await appendToSession(session.id, {
		role: 'user',
		content: message.body ?? '(image)',
		timestamp: message.timestamp,
		mediaUrl: message.mediaUrl ?? undefined
	});

	const reply = await runAgent({
		context: { orgName, userName, role, channel: message.channel },
		conversationHistory: session.conversationHistory,
		newMessage: message.body ?? '(image sent)',
		organizationId,
		userId: identity.userId,
		brandScope,
		orgType,
		mediaUrl: message.mediaUrl
	});

	const replySid = await sendReply(message.from, reply, message.channel);

	await recordMessage(session.id, 'outbound', reply, replySid);

	await appendToSession(session.id, {
		role: 'assistant',
		content: reply,
		timestamp: new Date().toISOString()
	});

	return twimlResponse();
};

async function handleVerification(
	phone: string,
	body: string | null,
	channel: 'whatsapp' | 'sms'
): Promise<void> {
	// Persisted rather than held in memory: the old Map was per instance, so the
	// cap reset whenever a request landed on a fresh one.
	const attempts = await getVerificationAttempts(phone);

	if (attempts >= MAX_ATTEMPTS) {
		await sendReply(phone, getMaxAttemptsMessage(), channel);
		return;
	}

	if (!body) {
		await sendReply(phone, getVerificationPrompt(), channel);
		return;
	}

	const email = parseVerificationReply(body);
	if (!email) {
		await recordVerificationAttempt(phone);
		await sendReply(
			phone,
			"I didn't catch an email address. Please reply with the email you use to sign in to Threadline.",
			channel
		);
		return;
	}

	const result = await bindPhoneToUser(phone, email);
	if (!result.success) {
		await recordVerificationAttempt(phone);
		await sendReply(phone, result.message, channel);
		return;
	}

	await clearVerificationAttempts(phone);
	await sendReply(
		phone,
		"You're verified. You can now place orders, check inventory, and more — just text naturally.",
		channel
	);
}

function twimlResponse(): Response {
	return new Response('<Response></Response>', {
		headers: { 'Content-Type': 'text/xml' }
	});
}
