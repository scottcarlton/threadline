import { describe, it, expect } from 'vitest';
import { parseVerificationReply, isVerificationPrompt } from './identity.js';

describe('parseVerificationReply', () => {
	it('extracts a valid email from a reply', () => {
		expect(parseVerificationReply('jane@acmereps.com')).toBe('jane@acmereps.com');
	});

	it('extracts email with surrounding text', () => {
		expect(parseVerificationReply('My email is jane@acmereps.com thanks')).toBe(
			'jane@acmereps.com'
		);
	});

	it('returns null for no email', () => {
		expect(parseVerificationReply('hello there')).toBeNull();
	});

	it('returns null for empty string', () => {
		expect(parseVerificationReply('')).toBeNull();
	});
});

describe('isVerificationPrompt', () => {
	it('returns true for the verification message', () => {
		expect(
			isVerificationPrompt(
				'Welcome to Threadline. To get started, reply with the email address you use to sign in.'
			)
		).toBe(true);
	});

	it('returns false for a regular message', () => {
		expect(isVerificationPrompt('Order 3 M Classic Tee')).toBe(false);
	});
});
