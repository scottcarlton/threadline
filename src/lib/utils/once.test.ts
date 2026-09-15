import { describe, it, expect, vi } from 'vitest';
import { once } from './once.js';

describe('once', () => {
	it('calls the underlying function a single time', () => {
		const fn = vi.fn(() => 'value');
		const get = once(fn);

		expect(get()).toBe('value');
		expect(get()).toBe('value');
		expect(get()).toBe('value');
		expect(fn).toHaveBeenCalledTimes(1);
	});

	it('hands every caller the same promise, not a second call', async () => {
		// The property that makes this safe for per-request scope: concurrent
		// loads share one in-flight resolution rather than racing two.
		const fn = vi.fn(async () => ({ kind: 'internal' }));
		const get = once(fn);

		const a = get();
		const b = get();

		expect(a).toBe(b);
		expect(fn).toHaveBeenCalledTimes(1);
		await expect(a).resolves.toEqual({ kind: 'internal' });
	});

	it('caches a null result rather than retrying', () => {
		// null is a legitimate answer here: an unauthenticated request has no
		// scope. Treating it as "not computed yet" would re-run the work on
		// every read, which is exactly the bug a lazy field invites.
		const fn = vi.fn(() => null);
		const get = once(fn);

		expect(get()).toBeNull();
		expect(get()).toBeNull();
		expect(fn).toHaveBeenCalledTimes(1);
	});

	it('caches a rejected promise instead of re-running failed work', async () => {
		const fn = vi.fn(async () => {
			throw new Error('resolution failed');
		});
		const get = once(fn);

		const first = get();
		const second = get();

		expect(first).toBe(second);
		expect(fn).toHaveBeenCalledTimes(1);
		await expect(first).rejects.toThrow('resolution failed');
		await expect(second).rejects.toThrow('resolution failed');
	});

	it('keeps separate instances independent', () => {
		// One accessor per request; two requests must not share a value.
		const a = once(vi.fn(() => 'a'));
		const b = once(vi.fn(() => 'b'));
		expect(a()).toBe('a');
		expect(b()).toBe('b');
	});
});
