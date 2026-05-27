import crypto from 'node:crypto';
import type { ReceivedMessage, MessagingChannel } from './types.js';

export function parseTwilioWebhook(params: URLSearchParams): ReceivedMessage {
	const from = params.get('From') ?? '';
	const to = params.get('To') ?? '';
	const body = params.get('Body')?.trim() || null;
	const numMedia = parseInt(params.get('NumMedia') ?? '0', 10);

	const channel: MessagingChannel = from.startsWith('whatsapp:') ? 'whatsapp' : 'sms';
	const cleanPhone = (raw: string) => raw.replace('whatsapp:', '');

	return {
		messageId: params.get('MessageSid') ?? '',
		from: cleanPhone(from),
		to: cleanPhone(to),
		body,
		mediaUrl: numMedia > 0 ? (params.get('MediaUrl0') ?? null) : null,
		mediaType: numMedia > 0 ? (params.get('MediaContentType0') ?? null) : null,
		channel,
		timestamp: new Date().toISOString()
	};
}

export function verifyTwilioSignature(
	authToken: string,
	signature: string,
	url: string,
	params: URLSearchParams
): boolean {
	const sortedParams = Array.from(params.entries())
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([k, v]) => `${k}${v}`)
		.join('');

	const data = url + sortedParams;
	const expected = crypto.createHmac('sha1', authToken).update(data).digest('base64');

	return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}
