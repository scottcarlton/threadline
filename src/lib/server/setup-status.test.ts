import { describe, it, expect } from 'vitest';
import { deriveSetupStatus } from './setup-status.js';

describe('deriveSetupStatus', () => {
	const baseOrg = {
		address_line1: null,
		city: null,
		state: null,
		zip: null,
		time_zone: 'America/Los_Angeles',
		shipping_use_business_address: true,
		shipping_from_line1: null,
		default_shipping_method_id: null,
		default_payment_terms: null,
		returns_window_days: 0,
		taxes_us_sales_tax_enabled: false,
		taxes_vat_enabled: false,
		taxes_gst_enabled: false
	};

	it('returns all false for empty org', () => {
		const status = deriveSetupStatus(baseOrg, {
			shippingMethodCount: 0,
			productCount: 0,
			accountCount: 0,
			memberCount: 1,
			skippedSections: []
		});
		expect(status.address).toBe(false);
		expect(status.shipping).toBe(false);
		expect(status.payments).toBe(false);
		expect(status.products).toBe(false);
		expect(status.accounts).toBe(false);
		expect(status.members).toBe(false);
	});

	it('address complete when all fields populated', () => {
		const status = deriveSetupStatus(
			{ ...baseOrg, address_line1: '123 Main', city: 'LA', state: 'CA', zip: '90001' },
			{
				shippingMethodCount: 0,
				productCount: 0,
				accountCount: 0,
				memberCount: 1,
				skippedSections: []
			}
		);
		expect(status.address).toBe(true);
		expect(status.profile).toBe(true);
	});

	it('shipping complete when methods exist, default set, and address resolved via business address', () => {
		const status = deriveSetupStatus(
			{
				...baseOrg,
				address_line1: '123 Main',
				city: 'LA',
				state: 'CA',
				zip: '90001',
				shipping_use_business_address: true,
				default_shipping_method_id: 'some-uuid'
			},
			{
				shippingMethodCount: 3,
				productCount: 0,
				accountCount: 0,
				memberCount: 1,
				skippedSections: []
			}
		);
		expect(status.shipping).toBe(true);
	});

	it('payments complete when default_payment_terms is set', () => {
		const status = deriveSetupStatus(
			{ ...baseOrg, default_payment_terms: 'net_30' },
			{
				shippingMethodCount: 0,
				productCount: 0,
				accountCount: 0,
				memberCount: 1,
				skippedSections: []
			}
		);
		expect(status.payments).toBe(true);
	});

	it('taxes complete when skipped', () => {
		const status = deriveSetupStatus(baseOrg, {
			shippingMethodCount: 0,
			productCount: 0,
			accountCount: 0,
			memberCount: 1,
			skippedSections: ['taxes']
		});
		expect(status.taxes).toBe(true);
	});

	it('taxes complete when any system enabled', () => {
		const status = deriveSetupStatus(
			{ ...baseOrg, taxes_us_sales_tax_enabled: true },
			{
				shippingMethodCount: 0,
				productCount: 0,
				accountCount: 0,
				memberCount: 1,
				skippedSections: []
			}
		);
		expect(status.taxes).toBe(true);
	});

	it('returns complete when skipped', () => {
		const status = deriveSetupStatus(baseOrg, {
			shippingMethodCount: 0,
			productCount: 0,
			accountCount: 0,
			memberCount: 1,
			skippedSections: ['returns']
		});
		expect(status.returns).toBe(true);
	});

	it('products complete when count > 0', () => {
		const status = deriveSetupStatus(baseOrg, {
			shippingMethodCount: 0,
			productCount: 1,
			accountCount: 0,
			memberCount: 1,
			skippedSections: []
		});
		expect(status.products).toBe(true);
	});

	it('members complete when count > 1 (beyond owner)', () => {
		const status = deriveSetupStatus(baseOrg, {
			shippingMethodCount: 0,
			productCount: 0,
			accountCount: 0,
			memberCount: 2,
			skippedSections: []
		});
		expect(status.members).toBe(true);
	});

	it('members complete when skipped', () => {
		const status = deriveSetupStatus(baseOrg, {
			shippingMethodCount: 0,
			productCount: 0,
			accountCount: 0,
			memberCount: 1,
			skippedSections: ['members']
		});
		expect(status.members).toBe(true);
	});
});
