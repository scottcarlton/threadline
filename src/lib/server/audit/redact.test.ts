import { describe, it, expect } from 'vitest';
import { redact, redactRecord, pick } from './redact.js';

describe('redact', () => {
	it('replaces secret-looking keys at any depth', () => {
		const out = redact({
			ok: 'keep',
			password: 'p',
			refresh_token: 't',
			'client-secret': 's',
			deep: { authorization: 'Bearer x', fine: 1 }
		}) as Record<string, unknown>;

		expect(out.ok).toBe('keep');
		expect(out.password).toBe('[redacted]');
		expect(out.refresh_token).toBe('[redacted]');
		expect(out['client-secret']).toBe('[redacted]');
		expect((out.deep as Record<string, unknown>).authorization).toBe('[redacted]');
		expect((out.deep as Record<string, unknown>).fine).toBe(1);
	});

	it('caps long free text rather than dropping it', () => {
		const out = redact({ prompt: 'x'.repeat(900) }) as Record<string, string>;
		expect(out.prompt.length).toBeLessThan(600);
		expect(out.prompt.endsWith('[truncated]')).toBe(true);
	});

	it('caps large arrays and says how many were dropped', () => {
		const out = redact({ ids: Array.from({ length: 60 }, (_, i) => i) }) as {
			ids: unknown[];
		};
		expect(out.ids.length).toBe(51);
		expect(out.ids[50]).toBe('[10 more]');
	});

	it('stops runaway nesting', () => {
		let deep: Record<string, unknown> = { end: true };
		for (let i = 0; i < 12; i++) deep = { deep };
		expect(JSON.stringify(redact(deep))).toContain('max depth');
	});

	it('returns null for empty records', () => {
		expect(redactRecord(null)).toBeNull();
		expect(redactRecord(undefined)).toBeNull();
	});
});

describe('PII masking', () => {
	it('masks an email while keeping it identifiable', () => {
		const out = redact({ contact_email: 'ada@acme.co' }) as Record<string, string>;
		expect(out.contact_email).toBe('a•••@acme.co');
	});

	it('keeps the last four digits of a phone number', () => {
		const out = redact({ phone: '(212) 555-0140' }) as Record<string, string>;
		expect(out.phone).toBe('•••0140');
	});

	it('drops street addresses and tax ids entirely', () => {
		const out = redact({
			address_line1: '12 Mercer St',
			zip: '10013',
			tax_id: '00-1234567'
		}) as Record<string, string>;
		expect(out.address_line1).toBe('[redacted:pii]');
		expect(out.zip).toBe('[redacted:pii]');
		expect(out.tax_id).toBe('[redacted:pii]');
	});

	it('masks PII nested inside an AI tool_input payload', () => {
		const out = redact({
			tool: 'create_account',
			tool_input: { name: 'Mercer Boutique', contact_email: 'buyer@mercer.co', phone: '2125550140' }
		}) as Record<string, Record<string, string>>;
		expect(out.tool_input.name).toBe('Mercer Boutique');
		expect(out.tool_input.contact_email).toBe('b•••@mercer.co');
		expect(out.tool_input.phone).toBe('•••0140');
	});

	it('still redacts secrets ahead of PII rules', () => {
		const out = redact({ email_token: 'abc' }) as Record<string, string>;
		expect(out.email_token).toBe('[redacted]');
	});

	it('masks non-string PII values rather than leaking them', () => {
		const out = redact({ phone: 2125550140 }) as Record<string, string>;
		expect(out.phone).toBe('[redacted:pii]');
	});
});

describe('pick', () => {
	it('keeps only the named fields', () => {
		expect(pick({ a: 1, b: 2, c: 3 }, ['a', 'c'])).toEqual({ a: 1, c: 3 });
	});

	it('ignores absent keys and null sources', () => {
		expect(pick({ a: 1 }, ['a', 'missing'])).toEqual({ a: 1 });
		expect(pick(null, ['a'])).toEqual({});
	});
});
