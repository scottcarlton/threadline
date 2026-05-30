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

const RATE_LIMIT_PER_HOUR = 120;

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

	const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
	const { count } = await supabaseAdmin
		.from('messaging_messages')
		.select('id', { count: 'exact', head: true })
		.gte('created_at', oneHourAgo);

	if ((count ?? 0) >= RATE_LIMIT_PER_HOUR) {
		await sendReply(
			message.from,
			"You've sent a lot of messages recently. Please wait a bit before trying again.",
			message.channel
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

const verificationAttempts = new Map<string, number>();

async function handleVerification(
	phone: string,
	body: string | null,
	channel: 'whatsapp' | 'sms'
): Promise<void> {
	const attempts = verificationAttempts.get(phone) ?? 0;

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
		verificationAttempts.set(phone, attempts + 1);
		await sendReply(
			phone,
			"I didn't catch an email address. Please reply with the email you use to sign in to Threadline.",
			channel
		);
		return;
	}

	const result = await bindPhoneToUser(phone, email);
	if (!result.success) {
		verificationAttempts.set(phone, attempts + 1);
		await sendReply(phone, result.message, channel);
		return;
	}

	verificationAttempts.delete(phone);
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
