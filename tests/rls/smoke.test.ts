import { describe, expect, it } from 'vitest';
import { SUPABASE_URL } from './setup/env.js';
import { adminClient, anonClient } from './setup/clients.js';

describe('rls harness', () => {
	it('resolves a local Supabase URL', () => {
		expect(new URL(SUPABASE_URL).hostname).toMatch(/^(127\.0\.0\.1|localhost)$/);
	});

	it('service role reads organizations', async () => {
		const { error } = await adminClient().from('organizations').select('id').limit(1);
		expect(error).toBeNull();
	});

	it('anon reads no organizations', async () => {
		const { data, error } = await anonClient().from('organizations').select('id').limit(1);
		expect(error).toBeNull();
		expect(data ?? []).toEqual([]);
	});
});
