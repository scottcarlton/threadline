import { describe, expect, it } from 'vitest';
import { SUPABASE_URL } from './setup/env.js';

describe('rls harness', () => {
	it('resolves a local Supabase URL', () => {
		expect(new URL(SUPABASE_URL).hostname).toMatch(/^(127\.0\.0\.1|localhost)$/);
	});
});
