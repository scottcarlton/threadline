import { describe, it, expect } from 'vitest';
import { mayConvertNote } from './order-convert-permissions';

describe('mayConvertNote', () => {
	describe('own-org note', () => {
		it.each(['admin', 'owner', 'member', 'sales'])('allows %s', (role) => {
			expect(mayConvertNote(role, false)).toBe(true);
		});

		it('denies guest', () => {
			expect(mayConvertNote('guest', false)).toBe(false);
		});

		it('denies a caller with no role', () => {
			expect(mayConvertNote('', false)).toBe(false);
		});
	});

	describe('federated note (brand org acting on a rep-owned note)', () => {
		it.each(['admin', 'owner'])('allows %s', (role) => {
			expect(mayConvertNote(role, true)).toBe(true);
		});

		// SCO-171: a BLSR reached the submitted-order transition through the
		// convert action, which the admin/owner-only federated status policy
		// forbids everywhere RLS is in play.
		it('denies sales (BLSR)', () => {
			expect(mayConvertNote('sales', true)).toBe(false);
		});

		it('denies member', () => {
			expect(mayConvertNote('member', true)).toBe(false);
		});

		it('denies guest', () => {
			expect(mayConvertNote('guest', true)).toBe(false);
		});
	});
});
