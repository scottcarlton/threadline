import twilio from 'twilio';
import { env } from '$env/dynamic/private';
import type { MessagingChannel } from './types.js';

function getClient() {
	const sid = env.TWILIO_ACCOUNT_SID;
	const token = env.TWILIO_AUTH_TOKEN;
	if (!sid || !token) throw new Error('Twilio credentials not configured');
	return twilio(sid, token);
}

export async function sendReply(
	to: string,
	body: string,
	channel: MessagingChannel
): Promise<string> {
	const client = getClient();
	const from = env.TWILIO_MESSAGING_NUMBER;
	if (!from) throw new Error('TWILIO_MESSAGING_NUMBER not configured');

	const formatPhone = (phone: string, ch: MessagingChannel) =>
		ch === 'whatsapp' ? `whatsapp:${phone}` : phone;

	const message = await client.messages.create({
		from: formatPhone(from, channel),
		to: formatPhone(to, channel),
		body
	});

	return message.sid;
}
