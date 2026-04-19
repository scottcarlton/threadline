import { describe, it, expect } from 'vitest';
import { extractEmailAddress } from './resend-inbound.js';

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

	it('handles Resend-style format', () => {
		expect(extractEmailAddress('Acme <onboarding@resend.dev>')).toBe('onboarding@resend.dev');
	});
});
