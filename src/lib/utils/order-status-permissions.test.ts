import { describe, it, expect } from 'vitest';
import {
	FULFILLMENT_STATUSES,
	mayAdvanceOrderStatus,
	allowedNextStatuses,
	mayEditShipWindow
} from './order-status-permissions';

describe('mayAdvanceOrderStatus', () => {
	it('lets a brand org set every fulfillment status', () => {
		for (const status of FULFILLMENT_STATUSES) {
			expect(mayAdvanceOrderStatus('brand', status)).toBe(true);
		}
	});

	it('blocks a rep org from every fulfillment status', () => {
		for (const status of FULFILLMENT_STATUSES) {
			expect(mayAdvanceOrderStatus('rep', status)).toBe(false);
		}
	});

	it('blocks fulfillment statuses for a rep org even on a locally owned brand', () => {
		// There is no federation-aware exception: the org type decides alone.
		expect(mayAdvanceOrderStatus('rep', 'delivered')).toBe(false);
	});

	it('leaves the selling half of the lifecycle to the rep', () => {
		for (const status of ['draft', 'submitted', 'confirmed', 'cancelled']) {
			expect(mayAdvanceOrderStatus('rep', status)).toBe(true);
		}
	});

	it('does not block a retailer org from non-fulfillment statuses', () => {
		expect(mayAdvanceOrderStatus('retailer', 'submitted')).toBe(true);
		expect(mayAdvanceOrderStatus('retailer', 'shipped')).toBe(false);
	});
});

describe('allowedNextStatuses', () => {
	it('strips shipped from a rep ladder but keeps cancel', () => {
		expect(allowedNextStatuses('rep', ['shipped', 'cancelled'])).toEqual(['cancelled']);
	});

	it('empties the rep ladder once an order is confirmed or later', () => {
		expect(allowedNextStatuses('rep', ['delivered'])).toEqual([]);
	});

	it('leaves a brand ladder untouched', () => {
		expect(allowedNextStatuses('brand', ['preparing', 'cancelled'])).toEqual([
			'preparing',
			'cancelled'
		]);
	});
});

describe('mayEditShipWindow', () => {
	it('lets a rep move the window while the order is still being sold', () => {
		for (const status of ['draft', 'submitted', 'confirmed']) {
			expect(mayEditShipWindow('rep', status)).toBe(true);
		}
	});

	it('locks the window for a rep once the brand starts fulfilling', () => {
		for (const status of FULFILLMENT_STATUSES) {
			expect(mayEditShipWindow('rep', status)).toBe(false);
		}
	});

	it('keeps the window editable for the brand at every fulfillment status', () => {
		for (const status of FULFILLMENT_STATUSES) {
			expect(mayEditShipWindow('brand', status)).toBe(true);
		}
	});

	it('locks the window for a retailer once fulfillment starts', () => {
		expect(mayEditShipWindow('retailer', 'confirmed')).toBe(true);
		expect(mayEditShipWindow('retailer', 'preparing')).toBe(false);
	});
});
