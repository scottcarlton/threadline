import { describe, it, expect } from 'vitest';
import { trackingUrl, CARRIERS } from './carriers';

describe('trackingUrl', () => {
	it('returns UPS tracking URL', () => {
		const url = trackingUrl('UPS', '1Z999AA10123456784');
		expect(url).toBe('https://www.ups.com/track?tracknum=1Z999AA10123456784');
	});

	it('returns FedEx tracking URL', () => {
		const url = trackingUrl('FedEx', '123456789012');
		expect(url).toBe('https://www.fedex.com/fedextrack/?trknbr=123456789012');
	});

	it('returns USPS tracking URL', () => {
		const url = trackingUrl('USPS', '9400111899223033');
		expect(url).toBe('https://tools.usps.com/go/TrackConfirmAction?tLabels=9400111899223033');
	});

	it('returns null for Other carrier', () => {
		expect(trackingUrl('Other', 'ABC123')).toBeNull();
	});

	it('returns null when carrier is null', () => {
		expect(trackingUrl(null, '123')).toBeNull();
	});

	it('returns null when tracking number is null', () => {
		expect(trackingUrl('UPS', null)).toBeNull();
	});

	it('encodes special characters in tracking number', () => {
		const url = trackingUrl('UPS', '1Z 999&AA');
		expect(url).toBe('https://www.ups.com/track?tracknum=1Z%20999%26AA');
	});

	it('exports expected carrier list', () => {
		expect(CARRIERS).toEqual(['FedEx', 'UPS', 'USPS', 'Other']);
	});
});
