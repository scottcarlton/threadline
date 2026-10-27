import { describe, expect, it } from 'vitest';
import { pickPortalConfiguration } from './portal';

const configs: Array<{ id: string; active: boolean; metadata: Record<string, string> }> = [
	{ id: 'bpc_default', active: true, metadata: {} },
	{ id: 'bpc_rep_old', active: false, metadata: { threadline_track: 'rep' } },
	{ id: 'bpc_rep', active: true, metadata: { threadline_track: 'rep' } },
	{ id: 'bpc_brand', active: true, metadata: { threadline_track: 'brand' } }
];

describe('pickPortalConfiguration', () => {
	it('picks the active configuration for the track', () => {
		expect(pickPortalConfiguration(configs, 'rep')).toBe('bpc_rep');
		expect(pickPortalConfiguration(configs, 'brand')).toBe('bpc_brand');
	});

	it('never falls back to another track or the default configuration', () => {
		expect(pickPortalConfiguration(configs.slice(0, 2), 'rep')).toBeNull();
		expect(pickPortalConfiguration(configs.slice(0, 3), 'brand')).toBeNull();
	});
});
