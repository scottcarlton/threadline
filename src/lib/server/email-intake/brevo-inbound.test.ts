import { describe, it, expect } from 'vitest';
import { extractEmailAddress, parseInboundItem, verifyWebhook } from './brevo-inbound.js';
import type { BrevoInboundItem } from './brevo-inbound.js';
import { createHmac } from 'node:crypto';
import { env } from '$env/dynamic/private';

describe('extractEmailAddress', () => {
	it('extracts from angle-bracket format', () => {
		expect(extractEmailAddress('"Jane Doe" <jane@example.com>')).toBe('jane@example.com');
	});

	it('extracts from angle-bracket without quotes', () => {
		expect(extractEmailAddress('Jane Doe <jane@example.com>')).toBe('jane@example.com');
	});

	it('handles bare email', () => {
		expect(extractEmailAddress('jane@example.com')).toBe('jane@example.com');
	});

	it('lowercases', () => {
		expect(extractEmailAddress('Jane@Example.COM')).toBe('jane@example.com');
	});

	it('trims whitespace', () => {
		expect(extractEmailAddress('  jane@example.com  ')).toBe('jane@example.com');
	});

	it('handles display name format', () => {
		expect(extractEmailAddress('Acme <info@acme.com>')).toBe('info@acme.com');
	});
});

describe('parseInboundItem', () => {
	const fixture: BrevoInboundItem = {
		Uuid: ['abc-123'],
		Date: '2026-05-09T15:32:11Z',
		MessageId: '<msg-001@mail.example.com>',
		Subject: 'Test order',
		From: { Address: 'rep@brand.com', Name: 'Rep Name' },
		To: [{ Address: 'stitch@reply.threadline.systems', Name: null }],
		Cc: [{ Address: 'cc@example.com', Name: 'CC Person' }],
		ReplyTo: null,
		SentAtDate: '2026-05-09T15:32:00Z',
		RawHtmlBody: '<p>Hello</p>',
		RawTextBody: 'Hello',
		Headers: { 'X-Custom': 'value' }
	};

	it('maps all fields correctly', () => {
		const result = parseInboundItem(fixture);
		expect(result).toEqual({
			id: 'abc-123',
			from: 'rep@brand.com',
			to: ['stitch@reply.threadline.systems'],
			subject: 'Test order',
			text: 'Hello',
			html: '<p>Hello</p>',
			headers: { 'X-Custom': 'value' },
			messageId: '<msg-001@mail.example.com>',
			cc: ['cc@example.com'],
			bcc: null,
			createdAt: '2026-05-09T15:32:11Z'
		});
	});

	it('handles missing optional fields', () => {
		const minimal: BrevoInboundItem = {
			Uuid: ['def-456'],
			Date: '2026-05-09T16:00:00Z',
			MessageId: '<msg-002@mail.example.com>',
			Subject: 'Minimal',
			From: { Address: 'a@b.com', Name: null },
			To: [{ Address: 'stitch@reply.threadline.systems', Name: null }],
			ReplyTo: null,
			SentAtDate: '2026-05-09T16:00:00Z'
		};

		const result = parseInboundItem(minimal);
		expect(result.text).toBeNull();
		expect(result.html).toBeNull();
		expect(result.headers).toBeNull();
		expect(result.cc).toBeNull();
		expect(result.bcc).toBeNull();
	});

	it('handles Uuid as a string (not array)', () => {
		const item = { ...fixture, Uuid: 'single-uuid' };
		expect(parseInboundItem(item).id).toBe('single-uuid');
	});
});

describe('verifyWebhook', () => {
	const secret = env.BREVO_WEBHOOK_SECRET!;

	function sign(body: string): string {
		return createHmac('sha256', secret).update(body).digest('hex');
	}

	it('returns parsed payload for valid signature', () => {
		const body = JSON.stringify({ items: [] });
		const headers = new Headers({ 'x-brevo-signature': sign(body) });
		const result = verifyWebhook(body, headers);
		expect(result).toEqual({ items: [] });
	});

	it('returns null for missing signature header', () => {
		const body = JSON.stringify({ items: [] });
		const headers = new Headers();
		const result = verifyWebhook(body, headers);
		expect(result).toBeNull();
	});

	it('returns null for wrong signature', () => {
		const body = JSON.stringify({ items: [] });
		const headers = new Headers({ 'x-brevo-signature': 'deadbeef'.repeat(8) });
		const result = verifyWebhook(body, headers);
		expect(result).toBeNull();
	});

	it('accepts x-mailin-signature header as fallback', () => {
		const body = JSON.stringify({ items: [] });
		const headers = new Headers({ 'x-mailin-signature': sign(body) });
		const result = verifyWebhook(body, headers);
		expect(result).toEqual({ items: [] });
	});
});
