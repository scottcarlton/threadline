import { describe, expect, it } from 'vitest';
import { formatLocation, formatPayment, formatShipWindow, seasonLabel } from './format';

describe('seasonLabel', () => {
	it('combines name and year with a space', () => {
		expect(seasonLabel('Fall', 2026)).toBe('Fall 2026');
	});
	it('falls back to name when year is missing', () => {
		expect(seasonLabel('Resort', null)).toBe('Resort');
	});
	it('falls back to year when name is missing', () => {
		expect(seasonLabel(null, 2026)).toBe('2026');
	});
	it('returns empty string when both are missing', () => {
		expect(seasonLabel(null, null)).toBe('');
		expect(seasonLabel(undefined, undefined)).toBe('');
	});
	it('trims whitespace on the name', () => {
		expect(seasonLabel('  Fall  ', 2026)).toBe('Fall 2026');
	});
});

describe('formatShipWindow', () => {
	it('shows a range when start and expected differ', () => {
		expect(formatShipWindow('2026-07-15', '2026-08-30')).toBe('Jul 15 – Aug 30');
	});
	it('shows a single date when start equals expected', () => {
		expect(formatShipWindow('2026-07-15', '2026-07-15')).toBe('Jul 15');
	});
	it('falls back to whichever date is present', () => {
		expect(formatShipWindow(null, '2026-08-30')).toBe('Aug 30');
		expect(formatShipWindow('2026-07-15', null)).toBe('Jul 15');
	});
	it('returns an em-dash when both are missing', () => {
		expect(formatShipWindow(null, null)).toBe('—');
	});
	it('parses the YYYY-MM-DD date portion even with a trailing time', () => {
		expect(formatShipWindow('2026-07-15T12:00:00Z', '2026-08-30T23:00:00Z')).toBe(
			'Jul 15 – Aug 30'
		);
	});
});

describe('formatLocation', () => {
	it('combines label + city/state', () => {
		expect(formatLocation({ label: 'Primary', city: 'Denver', state: 'CO' })).toBe(
			'Primary · Denver, CO'
		);
	});
	it('falls back to just label when city/state are missing', () => {
		expect(formatLocation({ label: 'Primary', city: null, state: null })).toBe('Primary');
	});
	it('falls back to just city/state when label is missing', () => {
		expect(formatLocation({ label: null, city: 'Denver', state: 'CO' })).toBe('Denver, CO');
	});
	it('returns an em-dash when nothing is present', () => {
		expect(formatLocation(null)).toBe('—');
		expect(formatLocation({ label: null, city: null, state: null })).toBe('—');
	});
});

describe('formatPayment', () => {
	it('combines method + terms with a dot', () => {
		expect(formatPayment('credit_card', 'net_30')).toBe('Credit Card · Net 30');
	});
	it('shows method only when terms are missing', () => {
		expect(formatPayment('credit_card', null)).toBe('Credit Card');
	});
	it('shows terms only when method is missing', () => {
		expect(formatPayment(null, 'net_30')).toBe('Net 30');
	});
	it('returns an em-dash when both are missing', () => {
		expect(formatPayment(null, null)).toBe('—');
	});
	it('passes through unknown codes rather than hiding them', () => {
		expect(formatPayment('bespoke', 'custom_terms')).toBe('bespoke · custom_terms');
	});
});
