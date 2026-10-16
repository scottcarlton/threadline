import { describe, it, expect } from 'vitest';
import {
	decideTransition,
	shouldRestock,
	validateDispositions,
	type ReturnTransition
} from './transitions.js';

describe('decideTransition', () => {
	it('allows the four legal moves', () => {
		expect(decideTransition('requested', 'approve')).toEqual({ ok: true, to: 'approved' });
		expect(decideTransition('requested', 'decline', { declineReason: 'Out of window' })).toEqual({
			ok: true,
			to: 'declined'
		});
		expect(decideTransition('approved', 'receive')).toEqual({ ok: true, to: 'received' });
		expect(decideTransition('requested', 'cancel')).toEqual({ ok: true, to: 'cancelled' });
		expect(decideTransition('approved', 'cancel')).toEqual({ ok: true, to: 'cancelled' });
	});

	it('refuses to skip approval', () => {
		const d = decideTransition('requested', 'receive');
		expect(d.ok).toBe(false);
		if (!d.ok) expect(d.code).toBe('illegal_transition');
	});

	it('refuses to cancel a received return', () => {
		// The stock has already moved. Withdrawing it is a new physical event,
		// not a change of mind, so there is no path back.
		const d = decideTransition('received', 'cancel');
		expect(d.ok).toBe(false);
	});

	it('refuses to re-action a settled return', () => {
		for (const from of ['declined', 'cancelled', 'closed']) {
			for (const t of ['approve', 'decline', 'receive', 'cancel'] as ReturnTransition[]) {
				expect(decideTransition(from, t).ok, `${from} -> ${t}`).toBe(false);
			}
		}
	});

	it('never reaches closed, which belongs to the credit memo', () => {
		const reachable = (['approve', 'decline', 'receive', 'cancel'] as ReturnTransition[]).flatMap(
			(t) =>
				['requested', 'approved', 'declined', 'received', 'closed', 'cancelled']
					.map((from) => decideTransition(from, t))
					.filter((d) => d.ok)
					.map((d) => (d as { ok: true; to: string }).to)
		);
		expect(reachable).not.toContain('closed');
	});

	it('requires a reason to decline', () => {
		// Declining silently is how a buyer ends up phoning their rep to ask
		// what happened.
		for (const reason of [undefined, null, '', '   ']) {
			const d = decideTransition('requested', 'decline', { declineReason: reason });
			expect(d.ok, JSON.stringify(reason)).toBe(false);
			if (!d.ok) expect(d.code).toBe('decline_reason_required');
		}
	});

	it('does not demand a reason for the other three', () => {
		expect(decideTransition('requested', 'approve').ok).toBe(true);
		expect(decideTransition('approved', 'receive').ok).toBe(true);
		expect(decideTransition('requested', 'cancel').ok).toBe(true);
	});
});

describe('shouldRestock', () => {
	const tracked = { stock_qty: 12, shopify_variant_id: null };

	it('restocks a tracked variant marked restock', () => {
		expect(shouldRestock({ disposition: 'restock', variant_id: 'v1', variant: tracked })).toBe(
			true
		);
	});

	it('does not restock damaged or destroyed goods', () => {
		expect(shouldRestock({ disposition: 'damaged', variant_id: 'v1', variant: tracked })).toBe(
			false
		);
		expect(shouldRestock({ disposition: 'destroy', variant_id: 'v1', variant: tracked })).toBe(
			false
		);
	});

	it('does not restock a line with no disposition yet', () => {
		expect(shouldRestock({ disposition: null, variant_id: 'v1', variant: tracked })).toBe(false);
	});

	it('does not restock a free-entry line that never matched the catalogue', () => {
		expect(shouldRestock({ disposition: 'restock', variant_id: null, variant: null })).toBe(false);
	});

	it('leaves an untracked variant untracked', () => {
		// NULL stock_qty means "no signal yet". Writing a number invents
		// inventory tracking for an org that never opted in, and the first thing
		// they would see is a count that appeared from nowhere.
		expect(
			shouldRestock({
				disposition: 'restock',
				variant_id: 'v1',
				variant: { stock_qty: null, shopify_variant_id: null }
			})
		).toBe(false);
	});

	it('does not touch a Shopify-mirrored variant', () => {
		// 20260422000001 states it outright: Threadline must not edit stock_qty
		// when shopify_variant_id is set. Shopify is the system of record, so our
		// write would be reverted on the next sync and the two disagree until then.
		expect(
			shouldRestock({
				disposition: 'restock',
				variant_id: 'v1',
				variant: { stock_qty: 12, shopify_variant_id: 'gid://shopify/ProductVariant/1' }
			})
		).toBe(false);
	});

	it('restocks a variant sitting at zero', () => {
		// Zero is a real count, unlike null. Selling out is exactly when a return
		// coming back matters most.
		expect(
			shouldRestock({
				disposition: 'restock',
				variant_id: 'v1',
				variant: { stock_qty: 0, shopify_variant_id: null }
			})
		).toBe(true);
	});
});

describe('validateDispositions', () => {
	it('accepts a complete set', () => {
		expect(
			validateDispositions(
				['a', 'b'],
				[
					{ lineId: 'a', disposition: 'restock' },
					{ lineId: 'b', disposition: 'damaged' }
				]
			)
		).toEqual({ ok: true });
	});

	it('refuses a partial set', () => {
		// Receiving goods without recording what happened to them leaves the
		// return half-written, and the person who can answer is holding the box.
		const r = validateDispositions(['a', 'b'], [{ lineId: 'a', disposition: 'restock' }]);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.message).toContain('1 left');
	});

	it('refuses an unknown disposition', () => {
		const r = validateDispositions(['a'], [{ lineId: 'a', disposition: 'resell' }]);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.message).toContain('resell');
	});

	it('refuses a disposition for a line on another return', () => {
		const r = validateDispositions(
			['a'],
			[
				{ lineId: 'a', disposition: 'restock' },
				{ lineId: 'other', disposition: 'restock' }
			]
		);
		expect(r.ok).toBe(false);
	});

	it('accepts an empty return with no lines', () => {
		expect(validateDispositions([], [])).toEqual({ ok: true });
	});
});
