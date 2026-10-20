import { describe, expect, it, vi } from 'vitest';
import { clearAppCaches } from './clear-app-caches';

function fakeCacheStorage(contents: Record<string, string[]>) {
	const stores = new Map(
		Object.entries(contents).map(([name, urls]) => [
			name,
			new Set(urls.map((u) => `https://threadline.test${u}`))
		])
	);
	const storage = {
		keys: async () => [...stores.keys()],
		open: async (name: string) => {
			const set = stores.get(name)!;
			return {
				keys: async () => [...set].map((url) => new Request(url)),
				delete: async (req: Request) => set.delete(req.url)
			};
		}
	} as unknown as CacheStorage;
	const remaining = () =>
		Object.fromEntries(
			[...stores].map(([name, set]) => [name, [...set].map((u) => new URL(u).pathname)])
		);
	return { storage, remaining };
}

describe('clearAppCaches', () => {
	it('removes every cached response except the offline fallback', async () => {
		const { storage, remaining } = fakeCacheStorage({
			'cache-v1': ['/offline.html', '/dashboard', '/_app/immutable/app.js'],
			'cache-v0': ['/accounts/123']
		});
		await clearAppCaches(storage);
		expect(remaining()).toEqual({ 'cache-v1': ['/offline.html'], 'cache-v0': [] });
	});

	it('is a no-op when Cache Storage is unavailable', async () => {
		await expect(clearAppCaches(undefined)).resolves.toBeUndefined();
	});

	it('swallows errors so sign-out still completes', async () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const broken = {
			keys: async () => {
				throw new Error('denied');
			}
		} as unknown as CacheStorage;
		await expect(clearAppCaches(broken)).resolves.toBeUndefined();
		expect(spy).toHaveBeenCalled();
		spy.mockRestore();
	});
});
