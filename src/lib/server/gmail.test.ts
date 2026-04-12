import { describe, it, expect } from 'vitest';
import { parseMessage, buildRawEmail } from './gmail.js';

function decodeBase64Url(encoded: string): string {
	const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
	return Buffer.from(base64, 'base64').toString('utf-8');
}

function encodeBase64Url(str: string): string {
	return Buffer.from(str).toString('base64url');
}

describe('parseMessage', () => {
	it('parses a simple single-part text/plain message', () => {
		const msg = {
			id: 'msg-1',
			threadId: 'thread-1',
			snippet: 'Hello world',
			labelIds: ['INBOX'],
			payload: {
				headers: [
					{ name: 'From', value: 'alice@example.com' },
					{ name: 'To', value: 'bob@example.com' },
					{ name: 'Subject', value: 'Test Subject' },
					{ name: 'Date', value: 'Mon, 1 Jan 2026 00:00:00 +0000' }
				],
				body: { data: encodeBase64Url('Hello from Alice') }
			}
		};

		const result = parseMessage(msg);

		expect(result.id).toBe('msg-1');
		expect(result.threadId).toBe('thread-1');
		expect(result.from).toBe('alice@example.com');
		expect(result.to).toBe('bob@example.com');
		expect(result.subject).toBe('Test Subject');
		expect(result.date).toBe('Mon, 1 Jan 2026 00:00:00 +0000');
		expect(result.body).toBe('Hello from Alice');
		expect(result.isUnread).toBe(false);
	});

	it('prefers text/plain over text/html in multipart messages', () => {
		const msg = {
			id: 'msg-2',
			threadId: 'thread-2',
			snippet: '',
			labelIds: [],
			payload: {
				headers: [],
				parts: [
					{ mimeType: 'text/plain', body: { data: encodeBase64Url('Plain text body') } },
					{ mimeType: 'text/html', body: { data: encodeBase64Url('<p>HTML body</p>') } }
				]
			}
		};

		const result = parseMessage(msg);
		expect(result.body).toBe('Plain text body');
	});

	it('falls back to text/html when text/plain is absent', () => {
		const msg = {
			id: 'msg-3',
			threadId: 'thread-3',
			snippet: '',
			labelIds: [],
			payload: {
				headers: [],
				parts: [
					{ mimeType: 'text/html', body: { data: encodeBase64Url('<p>Only HTML</p>') } }
				]
			}
		};

		const result = parseMessage(msg);
		expect(result.body).toBe('<p>Only HTML</p>');
	});

	it('recurses into nested multipart structures', () => {
		const msg = {
			id: 'msg-4',
			threadId: 'thread-4',
			snippet: '',
			labelIds: [],
			payload: {
				headers: [],
				parts: [
					{
						mimeType: 'multipart/alternative',
						parts: [
							{ mimeType: 'text/plain', body: { data: encodeBase64Url('Nested plain') } },
							{ mimeType: 'text/html', body: { data: encodeBase64Url('<p>Nested HTML</p>') } }
						]
					}
				]
			}
		};

		const result = parseMessage(msg);
		expect(result.body).toBe('Nested plain');
	});

	it('returns empty strings for missing headers', () => {
		const msg = {
			id: 'msg-5',
			threadId: 'thread-5',
			snippet: '',
			labelIds: [],
			payload: {
				headers: []
			}
		};

		const result = parseMessage(msg);
		expect(result.from).toBe('');
		expect(result.to).toBe('');
		expect(result.subject).toBe('');
		expect(result.date).toBe('');
		expect(result.body).toBe('');
	});

	it('detects UNREAD label', () => {
		const msg = {
			id: 'msg-6',
			threadId: 'thread-6',
			snippet: '',
			labelIds: ['INBOX', 'UNREAD'],
			payload: { headers: [] }
		};

		const result = parseMessage(msg);
		expect(result.isUnread).toBe(true);
	});

	it('handles case-insensitive header matching', () => {
		const msg = {
			id: 'msg-7',
			threadId: 'thread-7',
			snippet: '',
			labelIds: [],
			payload: {
				headers: [
					{ name: 'from', value: 'lower@example.com' },
					{ name: 'SUBJECT', value: 'Upper Subject' }
				]
			}
		};

		const result = parseMessage(msg);
		expect(result.from).toBe('lower@example.com');
		expect(result.subject).toBe('Upper Subject');
	});

	it('throws when payload is missing (known limitation)', () => {
		const msg = {
			id: 'msg-8',
			threadId: 'thread-8',
			snippet: 'test',
			labelIds: []
		};

		// parseMessage does not guard against undefined payload — this documents the current behavior
		expect(() => parseMessage(msg)).toThrow();
	});
});

describe('buildRawEmail', () => {
	it('builds a simple email without attachments', () => {
		const raw = buildRawEmail('from@test.com', 'to@test.com', 'Hello', 'Body text');
		const decoded = decodeBase64Url(raw);

		expect(decoded).toContain('From: from@test.com');
		expect(decoded).toContain('To: to@test.com');
		expect(decoded).toContain('Subject: Hello');
		expect(decoded).toContain('Content-Type: text/plain; charset="UTF-8"');
		expect(decoded).toContain('MIME-Version: 1.0');
		expect(decoded).toContain('Body text');
	});

	it('includes References and In-Reply-To when threadId is provided', () => {
		const raw = buildRawEmail('a@t.com', 'b@t.com', 'Re: Thread', 'Reply body', 'thread-abc');
		const decoded = decodeBase64Url(raw);

		expect(decoded).toContain('References: <thread-abc>');
		expect(decoded).toContain('In-Reply-To: <thread-abc>');
	});

	it('does not include thread headers when threadId is absent', () => {
		const raw = buildRawEmail('a@t.com', 'b@t.com', 'New', 'Body');
		const decoded = decodeBase64Url(raw);

		expect(decoded).not.toContain('References:');
		expect(decoded).not.toContain('In-Reply-To:');
	});

	it('builds multipart/mixed email with attachments', () => {
		const attachment = {
			filename: 'order.pdf',
			mimeType: 'application/pdf',
			content: Buffer.from('fake-pdf-content')
		};

		const raw = buildRawEmail('a@t.com', 'b@t.com', 'Order', 'See attached', undefined, [attachment]);
		const decoded = decodeBase64Url(raw);

		expect(decoded).toContain('Content-Type: multipart/mixed; boundary=');
		expect(decoded).toContain('Content-Type: text/plain; charset="UTF-8"');
		expect(decoded).toContain('See attached');
		expect(decoded).toContain('Content-Type: application/pdf; name="order.pdf"');
		expect(decoded).toContain('Content-Disposition: attachment; filename="order.pdf"');
		expect(decoded).toContain('Content-Transfer-Encoding: base64');
	});

	it('handles multiple attachments', () => {
		const attachments = [
			{ filename: 'file1.pdf', mimeType: 'application/pdf', content: Buffer.from('pdf') },
			{ filename: 'file2.csv', mimeType: 'text/csv', content: Buffer.from('a,b,c') }
		];

		const raw = buildRawEmail('a@t.com', 'b@t.com', 'Files', 'Body', undefined, attachments);
		const decoded = decodeBase64Url(raw);

		expect(decoded).toContain('name="file1.pdf"');
		expect(decoded).toContain('name="file2.csv"');
	});

	it('returns valid base64url string', () => {
		const raw = buildRawEmail('a@t.com', 'b@t.com', 'Test', 'Body');

		// base64url should not contain +, /, or =
		expect(raw).not.toMatch(/[+/=]/);
	});
});
