import { describe, it, expect } from 'vitest';
import { orderMenuItems } from './order-menu-permissions';

const own = (role: string) => ({ isBuyer: false, isFederatedView: false, role });
const federated = (role: string) => ({ isBuyer: false, isFederatedView: true, role });

describe('orderMenuItems', () => {
	describe('own-org order', () => {
		it.each(['admin', 'owner', 'member', 'sales'])('offers every item to %s', (role) => {
			expect(orderMenuItems(own(role), 'submitted')).toEqual({
				clone: true,
				downloadPdf: true,
				cancel: true
			});
		});

		it('offers nothing to a guest', () => {
			expect(orderMenuItems(own('guest'), 'submitted')).toEqual({
				clone: false,
				downloadPdf: false,
				cancel: false
			});
		});

		it('offers nothing to a caller with no role', () => {
			expect(orderMenuItems(own(''), 'draft')).toEqual({
				clone: false,
				downloadPdf: false,
				cancel: false
			});
		});

		it.each(['shipped', 'delivered', 'cancelled'])('hides cancel once %s', (status) => {
			expect(orderMenuItems(own('admin'), status).cancel).toBe(false);
		});
	});

	describe('federated order (brand viewing a rep-owned order)', () => {
		it('never offers clone, since the clone endpoint is own-org only', () => {
			expect(orderMenuItems(federated('admin'), 'submitted').clone).toBe(false);
		});

		it.each(['admin', 'owner'])('lets %s cancel', (role) => {
			expect(orderMenuItems(federated(role), 'submitted').cancel).toBe(true);
		});

		it.each(['member', 'sales'])('does not let %s cancel', (role) => {
			expect(orderMenuItems(federated(role), 'submitted').cancel).toBe(false);
		});

		it('still offers the PDF to a writing role', () => {
			expect(orderMenuItems(federated('sales'), 'submitted').downloadPdf).toBe(true);
		});
	});

	describe('buyer', () => {
		it('offers nothing, even on their own draft', () => {
			expect(
				orderMenuItems({ isBuyer: true, isFederatedView: false, role: 'admin' }, 'draft')
			).toEqual({ clone: false, downloadPdf: false, cancel: false });
		});
	});
});
