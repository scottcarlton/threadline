import { describe, it, expect } from 'vitest';
import { emailFromIdToken } from './outlook-user.js';

function makeIdToken(claims: Record<string, unknown>): string {
	const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
	const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
	return `${header}.${payload}.signature`;
}

describe('emailFromIdToken', () => {
	it('returns the email claim when present', () => {
		expect(emailFromIdToken(makeIdToken({ email: 'scott@threadline.systems' }))).toBe(
			'scott@threadline.systems'
		);
	});

	it('falls back to preferred_username when email is absent', () => {
		expect(emailFromIdToken(makeIdToken({ preferred_username: 'user@outlook.com' }))).toBe(
			'user@outlook.com'
		);
	});

	it('prefers email over preferred_username', () => {
		const token = makeIdToken({ email: 'a@x.com', preferred_username: 'b@y.com' });
		expect(emailFromIdToken(token)).toBe('a@x.com');
	});

	it('returns null when no email-like claim exists', () => {
		expect(emailFromIdToken(makeIdToken({ sub: '123' }))).toBeNull();
	});

	it('returns null for undefined, null, or malformed tokens', () => {
		expect(emailFromIdToken(undefined)).toBeNull();
		expect(emailFromIdToken(null)).toBeNull();
		expect(emailFromIdToken('not-a-jwt')).toBeNull();
		expect(emailFromIdToken('only.two')).toBeNull();
	});
});
