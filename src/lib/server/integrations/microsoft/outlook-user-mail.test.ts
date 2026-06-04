import { describe, it, expect } from 'vitest';
import { mapGraphMessage, parseRecipients } from './outlook-user-mail.js';

describe('mapGraphMessage', () => {
	it('formats from/to with a display name as "Name <address>"', () => {
		const result = mapGraphMessage({
			id: 'AAQk-1',
			conversationId: 'conv-1',
			subject: 'Fall order',
			from: { emailAddress: { name: 'Alice Buyer', address: 'alice@shop.com' } },
			toRecipients: [{ emailAddress: { name: 'Acme Sales', address: 'sales@acme.com' } }],
			receivedDateTime: '2026-06-01T12:00:00Z',
			bodyPreview: 'Here is my order',
			isRead: false
		});

		expect(result.id).toBe('AAQk-1');
		expect(result.conversationId).toBe('conv-1');
		expect(result.subject).toBe('Fall order');
		expect(result.from).toBe('Alice Buyer <alice@shop.com>');
		expect(result.to).toBe('Acme Sales <sales@acme.com>');
		expect(result.bodyPreview).toBe('Here is my order');
		expect(result.isRead).toBe(false);
	});

	it('uses the bare address when no display name is present', () => {
		const result = mapGraphMessage({
			id: 'm2',
			conversationId: 'c2',
			from: { emailAddress: { address: 'bob@shop.com' } },
			receivedDateTime: '2026-06-02T08:00:00Z'
		});

		expect(result.from).toBe('bob@shop.com');
		expect(result.to).toBe('');
	});

	it('does not duplicate the address when name equals address', () => {
		const result = mapGraphMessage({
			id: 'm3',
			from: { emailAddress: { name: 'bob@shop.com', address: 'bob@shop.com' } },
			receivedDateTime: '2026-06-02T08:00:00Z'
		});

		expect(result.from).toBe('bob@shop.com');
	});

	it('falls back to the message id when conversationId is missing', () => {
		const result = mapGraphMessage({
			id: 'm4',
			receivedDateTime: '2026-06-02T08:00:00Z'
		});

		expect(result.conversationId).toBe('m4');
	});

	it('defaults isRead to true and leaves body undefined when absent', () => {
		const result = mapGraphMessage({
			id: 'm5',
			receivedDateTime: '2026-06-02T08:00:00Z'
		});

		expect(result.isRead).toBe(true);
		expect(result.body).toBeUndefined();
		expect(result.subject).toBe('');
	});

	it('captures an HTML body content type', () => {
		const result = mapGraphMessage({
			id: 'm6',
			receivedDateTime: '2026-06-02T08:00:00Z',
			body: { contentType: 'html', content: '<p>hi</p>' }
		});

		expect(result.body).toBe('<p>hi</p>');
		expect(result.bodyContentType).toBe('html');
	});

	it('normalizes a non-html content type to text', () => {
		const result = mapGraphMessage({
			id: 'm7',
			receivedDateTime: '2026-06-02T08:00:00Z',
			body: { contentType: 'text', content: 'plain' }
		});

		expect(result.bodyContentType).toBe('text');
	});
});

describe('parseRecipients', () => {
	it('splits a comma-separated list into Graph recipient objects', () => {
		expect(parseRecipients('a@x.com, b@y.com')).toEqual([
			{ emailAddress: { address: 'a@x.com' } },
			{ emailAddress: { address: 'b@y.com' } }
		]);
	});

	it('trims whitespace and drops empty entries', () => {
		expect(parseRecipients('  a@x.com ,, ')).toEqual([{ emailAddress: { address: 'a@x.com' } }]);
	});

	it('returns an empty array for an empty string', () => {
		expect(parseRecipients('')).toEqual([]);
	});
});
