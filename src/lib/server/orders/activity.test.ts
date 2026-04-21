import { describe, expect, it } from 'vitest';
import { aggregateOrderActivity, type RawAudit } from './activity.js';

function audit(over: Partial<RawAudit>): RawAudit {
	return {
		id: 'a1',
		order_id: 'o1',
		actor_id: 'u1',
		event_type: 'line_added',
		field: null,
		before_value: null,
		after_value: null,
		created_at: '2026-04-21T12:00:00Z',
		...over
	};
}

const names = new Map<string, string | null>([
	['u1', 'Denise Carlton'],
	['u2', 'Brand Admin']
]);

describe('aggregateOrderActivity', () => {
	it('returns an empty array for no input', () => {
		expect(aggregateOrderActivity([], names)).toEqual([]);
	});

	it('keeps a solo status change as its own entry', () => {
		const rows = aggregateOrderActivity(
			[
				audit({
					event_type: 'status_changed',
					field: 'status',
					before_value: 'draft',
					after_value: 'submitted',
					created_at: '2026-04-21T12:00:00Z'
				})
			],
			names
		);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			kind: 'status',
			title: 'Marked submitted',
			subtitle: 'Draft → Submitted',
			actor_name: 'Denise Carlton',
			event_count: 1
		});
	});

	it('collapses consecutive line_added events from the same actor into one entry', () => {
		const rows = aggregateOrderActivity(
			[
				audit({
					id: 'a1',
					after_value: {
						style_number: 'SB-1',
						description: 'Sophie Blouse',
						color: 'Black',
						size: 'L',
						qty: 1,
						unit_price: 100
					},
					created_at: '2026-04-21T12:00:03Z'
				}),
				audit({
					id: 'a2',
					after_value: {
						style_number: 'SB-1',
						description: 'Sophie Blouse',
						color: 'Black',
						size: 'M',
						qty: 1,
						unit_price: 100
					},
					created_at: '2026-04-21T12:00:02Z'
				}),
				audit({
					id: 'a3',
					after_value: {
						style_number: 'SB-1',
						description: 'Sophie Blouse',
						color: 'Black',
						size: 'S',
						qty: 1,
						unit_price: 100
					},
					created_at: '2026-04-21T12:00:01Z'
				})
			],
			names
		);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			id: 'a1',
			kind: 'content',
			title: '3 lines added',
			subtitle: 'Sophie Blouse · Black (L, M, S)',
			actor_name: 'Denise Carlton',
			event_count: 3
		});
	});

	it('does not collapse line_added events from different actors', () => {
		const rows = aggregateOrderActivity(
			[
				audit({ id: 'a1', actor_id: 'u1', after_value: { style_number: 'S-1', size: 'M' } }),
				audit({ id: 'a2', actor_id: 'u2', after_value: { style_number: 'S-1', size: 'S' } })
			],
			names
		);
		expect(rows).toHaveLength(2);
		expect(rows.map((r) => r.actor_name)).toEqual(['Denise Carlton', 'Brand Admin']);
	});

	it('does not collapse line_added events more than 60s apart', () => {
		const rows = aggregateOrderActivity(
			[
				audit({
					id: 'a1',
					created_at: '2026-04-21T12:00:00Z',
					after_value: { style_number: 'S-1', size: 'L' }
				}),
				audit({
					id: 'a2',
					created_at: '2026-04-21T12:02:30Z',
					after_value: { style_number: 'S-1', size: 'M' }
				})
			],
			names
		);
		expect(rows).toHaveLength(2);
		expect(rows[0].title).toBe('1 line added');
		expect(rows[1].title).toBe('1 line added');
	});

	it('does not collapse across event_type boundaries', () => {
		const rows = aggregateOrderActivity(
			[
				audit({
					id: 'a1',
					event_type: 'line_added',
					after_value: { style_number: 'S-1', size: 'L' },
					created_at: '2026-04-21T12:00:03Z'
				}),
				audit({
					id: 'a2',
					event_type: 'line_changed',
					before_value: { qty: 1 },
					after_value: { qty: 2, style_number: 'S-1', description: 'Shirt', size: 'L' },
					created_at: '2026-04-21T12:00:02Z'
				}),
				audit({
					id: 'a3',
					event_type: 'line_added',
					after_value: { style_number: 'S-1', size: 'M' },
					created_at: '2026-04-21T12:00:01Z'
				})
			],
			names
		);
		expect(rows.map((r) => r.title)).toEqual(['1 line added', 'Line changed', '1 line added']);
	});

	it('describes a line_removed entry using the before snapshot', () => {
		const rows = aggregateOrderActivity(
			[
				audit({
					event_type: 'line_removed',
					before_value: {
						style_number: 'LD-1',
						description: 'Linen Dress',
						color: 'Sand',
						size: 'L',
						qty: 2,
						unit_price: 154
					}
				})
			],
			names
		);
		expect(rows[0]).toMatchObject({
			kind: 'content',
			title: 'Line removed',
			subtitle: 'Linen Dress · Sand · L'
		});
	});

	it('describes a line_changed entry with qty/color/size deltas', () => {
		const rows = aggregateOrderActivity(
			[
				audit({
					event_type: 'line_changed',
					before_value: {
						style_number: 'S-1',
						description: 'Shirt',
						qty: 1,
						color: 'Natural',
						size: 'M'
					},
					after_value: {
						style_number: 'S-1',
						description: 'Shirt',
						qty: 3,
						color: 'Black',
						size: 'M'
					}
				})
			],
			names
		);
		expect(rows[0].title).toBe('Line changed');
		expect(rows[0].subtitle).toBe('Shirt · qty 1 → 3 · color Natural → Black');
	});

	it('describes order_created and order_cancelled as status entries', () => {
		const rows = aggregateOrderActivity(
			[
				audit({ id: 'a1', event_type: 'order_created', actor_id: 'u1' }),
				audit({ id: 'a2', event_type: 'order_cancelled', actor_id: 'u1' })
			],
			names
		);
		expect(rows[0]).toMatchObject({ kind: 'status', title: 'Order created' });
		expect(rows[1]).toMatchObject({ kind: 'status', title: 'Order cancelled' });
	});

	it('describes a field_changed entry and humanizes the field name', () => {
		const rows = aggregateOrderActivity(
			[
				audit({
					event_type: 'field_changed',
					field: 'start_ship_date',
					before_value: '2026-09-01',
					after_value: '2026-09-15'
				})
			],
			names
		);
		expect(rows[0].title).toBe('Start ship date changed');
		expect(rows[0].subtitle).toBe('2026-09-01 → 2026-09-15');
	});

	it('returns actor_name null when the actor is missing from the profile map', () => {
		const rows = aggregateOrderActivity(
			[audit({ event_type: 'order_created', actor_id: 'unknown' })],
			names
		);
		expect(rows[0].actor_name).toBeNull();
	});

	it('returns actor_name null when actor_id is null', () => {
		const rows = aggregateOrderActivity(
			[audit({ event_type: 'order_created', actor_id: null })],
			names
		);
		expect(rows[0].actor_name).toBeNull();
	});

	it('joins multi-style buckets with style·color list rather than sizes', () => {
		const rows = aggregateOrderActivity(
			[
				audit({
					id: 'a1',
					after_value: {
						style_number: 'SB-1',
						description: 'Sophie Blouse',
						color: 'Black',
						size: 'L'
					},
					created_at: '2026-04-21T12:00:02Z'
				}),
				audit({
					id: 'a2',
					after_value: {
						style_number: 'LD-1',
						description: 'Linen Dress',
						color: 'Sand',
						size: 'M'
					},
					created_at: '2026-04-21T12:00:01Z'
				})
			],
			names
		);
		expect(rows).toHaveLength(1);
		expect(rows[0].title).toBe('2 lines added');
		expect(rows[0].subtitle).toBe('Sophie Blouse · Black · Linen Dress · Sand');
	});

	it('titleizes the status-change direction', () => {
		const rows = aggregateOrderActivity(
			[
				audit({
					event_type: 'status_changed',
					field: 'status',
					before_value: 'submitted',
					after_value: 'confirmed'
				})
			],
			names
		);
		expect(rows[0].title).toBe('Marked confirmed');
		expect(rows[0].subtitle).toBe('Submitted → Confirmed');
	});

	it('preserves input order (descending-time) in the output', () => {
		const rows = aggregateOrderActivity(
			[
				audit({
					id: 'newer',
					event_type: 'status_changed',
					field: 'status',
					before_value: 'draft',
					after_value: 'submitted',
					created_at: '2026-04-21T13:00:00Z'
				}),
				audit({
					id: 'older',
					event_type: 'order_created',
					created_at: '2026-04-21T12:00:00Z'
				})
			],
			names
		);
		expect(rows.map((r) => r.id)).toEqual(['newer', 'older']);
	});
});
