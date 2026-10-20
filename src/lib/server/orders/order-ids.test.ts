import { describe, expect, it } from 'vitest';
import { submissionIds, uuidV5 } from './order-ids';

const UUID_V5 = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SUB = '7d9f3c1e-2b4a-4f6d-8e0c-1a2b3c4d5e6f';
const BRAND = 'b0000000-0000-4000-8000-000000000001';
const SEASON = '5e000000-0000-4000-8000-000000000001';

describe('uuidV5', () => {
	it('matches the RFC 4122 reference vector', () => {
		// DNS namespace + "www.example.com", from the RFC test suite and every
		// mainstream uuid library.
		expect(uuidV5('www.example.com', '6ba7b810-9dad-11d1-80b4-00c04fd430c8')).toBe(
			'2ed6657d-e927-568b-95e1-2665a8aea6a2'
		);
	});

	it('produces a version 5, RFC variant uuid', () => {
		expect(uuidV5('anything')).toMatch(UUID_V5);
	});
});

describe('submissionIds', () => {
	it('derives the same order ids for the same submission', () => {
		const a = submissionIds(SUB);
		const b = submissionIds(SUB);
		expect(a.orderId(BRAND, SEASON)).toBe(b.orderId(BRAND, SEASON));
		expect(a.accountId()).toBe(b.accountId());
	});

	it('gives each brand and season group its own id', () => {
		const ids = submissionIds(SUB);
		const all = [
			ids.orderId(BRAND, SEASON),
			ids.orderId(BRAND, null),
			ids.orderId('b0000000-0000-4000-8000-000000000002', SEASON),
			ids.accountId()
		];
		expect(new Set(all).size).toBe(all.length);
	});

	it('changes every id when the submission changes', () => {
		const other = submissionIds('7d9f3c1e-2b4a-4f6d-8e0c-000000000000');
		expect(other.orderId(BRAND, SEASON)).not.toBe(submissionIds(SUB).orderId(BRAND, SEASON));
	});

	it('falls back to a random submission when the client sent none', () => {
		expect(submissionIds(null).submissionId).not.toBe(submissionIds(null).submissionId);
	});
});
