import { describe, it, expect } from 'vitest';
import { mapOrderPipelineRow } from './orderPipeline';

describe('mapOrderPipelineRow', () => {
	it('maps a typical row', () => {
		expect(mapOrderPipelineRow({ status: 'submitted', count: 5, total_amount: 12500 })).toEqual({
			status: 'submitted',
			count: 5,
			total_amount: 12500
		});
	});

	it('coerces numeric strings from Postgres BIGINT / NUMERIC', () => {
		const row = mapOrderPipelineRow({
			status: 'shipped',
			count: '3' as unknown as number,
			total_amount: '9999.99' as unknown as number
		});
		expect(row.count).toBe(3);
		expect(row.total_amount).toBe(9999.99);
	});
});
