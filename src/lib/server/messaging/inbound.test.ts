import { describe, it, expect } from 'vitest';
import { parseTwilioWebhook } from './inbound.js';

describe('parseTwilioWebhook', () => {
	it('parses a WhatsApp message', () => {
		const params = new URLSearchParams({
			MessageSid: 'SM123',
			From: 'whatsapp:+14155551234',
			To: 'whatsapp:+15555555555',
			Body: 'Order 3 M Classic Tee for Bloom Boutique',
			NumMedia: '0'
		});
		const result = parseTwilioWebhook(params);
		expect(result).toEqual({
			messageId: 'SM123',
			from: '+14155551234',
			to: '+15555555555',
			body: 'Order 3 M Classic Tee for Bloom Boutique',
			mediaUrl: null,
			mediaType: null,
			channel: 'whatsapp',
			timestamp: expect.any(String)
		});
	});

	it('parses an SMS message', () => {
		const params = new URLSearchParams({
			MessageSid: 'SM456',
			From: '+14155551234',
			To: '+15555555555',
			Body: 'Check inventory Classic Tee',
			NumMedia: '0'
		});
		const result = parseTwilioWebhook(params);
		expect(result.channel).toBe('sms');
		expect(result.from).toBe('+14155551234');
	});

	it('parses a message with media', () => {
		const params = new URLSearchParams({
			MessageSid: 'SM789',
			From: 'whatsapp:+14155551234',
			To: 'whatsapp:+15555555555',
			Body: '',
			NumMedia: '1',
			MediaUrl0: 'https://api.twilio.com/media/123.jpg',
			MediaContentType0: 'image/jpeg'
		});
		const result = parseTwilioWebhook(params);
		expect(result.mediaUrl).toBe('https://api.twilio.com/media/123.jpg');
		expect(result.mediaType).toBe('image/jpeg');
		expect(result.body).toBeNull();
	});

	it('returns null body for empty string', () => {
		const params = new URLSearchParams({
			MessageSid: 'SM000',
			From: '+14155551234',
			To: '+15555555555',
			Body: '',
			NumMedia: '0'
		});
		const result = parseTwilioWebhook(params);
		expect(result.body).toBeNull();
	});
});
