import { describe, expect, it } from 'vitest';
import { formatPhone, PHONE_REGEX } from './phone';

describe('formatPhone', () => {
	it('returns empty string for empty input', () => {
		expect(formatPhone('')).toBe('');
	});

	it('opens with paren after first digit', () => {
		expect(formatPhone('7')).toBe('(7');
		expect(formatPhone('786')).toBe('(786');
	});

	it('inserts ") " after 3 digits', () => {
		expect(formatPhone('7869')).toBe('(786) 9');
		expect(formatPhone('786945')).toBe('(786) 945');
	});

	it('inserts "-" after 6 digits', () => {
		expect(formatPhone('7869454')).toBe('(786) 945-4');
		expect(formatPhone('7869454524')).toBe('(786) 945-4524');
	});

	it('drops digits beyond the 10th', () => {
		expect(formatPhone('7869454524353')).toBe('(786) 945-4524');
	});

	it('strips non-digit characters before formatting', () => {
		expect(formatPhone('(786) 945-4524')).toBe('(786) 945-4524');
		expect(formatPhone('786-945-4524')).toBe('(786) 945-4524');
		expect(formatPhone('786.945.4524')).toBe('(786) 945-4524');
		expect(formatPhone('786 945 4524 ext 99')).toBe('(786) 945-4524');
	});
});

describe('PHONE_REGEX', () => {
	it('accepts a fully-formatted 10-digit phone', () => {
		expect(PHONE_REGEX.test('(786) 945-4524')).toBe(true);
	});

	it('rejects partial or unformatted phones', () => {
		expect(PHONE_REGEX.test('786')).toBe(false);
		expect(PHONE_REGEX.test('(786) 945')).toBe(false);
		expect(PHONE_REGEX.test('7869454524')).toBe(false);
		expect(PHONE_REGEX.test('(786)945-4524')).toBe(false);
	});
});
