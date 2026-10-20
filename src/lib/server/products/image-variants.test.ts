import { describe, it, expect, vi } from 'vitest';
import sharp from 'sharp';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	IMAGE_SIZES,
	allVariantPaths,
	generateVariantsFromStorage,
	isResizableMime,
	parseImageSize,
	renderVariants,
	storeVariants,
	variantPath
} from './image-variants.js';

async function makeImage(width: number, height: number): Promise<Buffer> {
	return sharp({
		create: { width, height, channels: 3, background: { r: 200, g: 100, b: 50 } }
	})
		.jpeg()
		.toBuffer();
}

function storageStub(opts: { uploadError?: string; download?: Blob | null } = {}) {
	const upload = vi.fn(async () => ({
		data: {},
		error: opts.uploadError ? { message: opts.uploadError } : null
	}));
	const download = vi.fn(async () =>
		opts.download
			? { data: opts.download, error: null }
			: { data: null, error: { message: 'nope' } }
	);
	const client = { storage: { from: () => ({ upload, download }) } } as unknown as SupabaseClient;
	return { client, upload, download };
}

describe('parseImageSize', () => {
	it('accepts known sizes', () => {
		expect(parseImageSize('thumb')).toBe('thumb');
		expect(parseImageSize('card')).toBe('card');
		expect(parseImageSize('display')).toBe('display');
	});

	it('rejects unknown, empty, and prototype keys', () => {
		expect(parseImageSize('huge')).toBeNull();
		expect(parseImageSize('')).toBeNull();
		expect(parseImageSize(null)).toBeNull();
		expect(parseImageSize('toString')).toBeNull();
	});
});

describe('isResizableMime', () => {
	it('resizes still images', () => {
		for (const mime of ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'IMAGE/JPEG']) {
			expect(isResizableMime(mime)).toBe(true);
		}
	});

	it('skips GIFs, video, and missing types', () => {
		expect(isResizableMime('image/gif')).toBe(false);
		expect(isResizableMime('video/mp4')).toBe(false);
		expect(isResizableMime(null)).toBe(false);
	});
});

describe('variantPath', () => {
	it('places variants beside the original with a webp extension', () => {
		expect(variantPath('org/products/p1/123-shirt.jpg', 'thumb')).toBe(
			'org/products/p1/_variants/thumb/123-shirt.webp'
		);
	});

	it('keeps dots inside the base name and handles extensionless names', () => {
		expect(variantPath('a/b/1-x.final.png', 'card')).toBe('a/b/_variants/card/1-x.final.webp');
		expect(variantPath('a/b/noext', 'display')).toBe('a/b/_variants/display/noext.webp');
	});

	it('lists one path per size', () => {
		expect(allVariantPaths('a/x.jpg')).toEqual([
			'a/_variants/thumb/x.webp',
			'a/_variants/card/x.webp',
			'a/_variants/display/x.webp'
		]);
	});
});

describe('renderVariants', () => {
	it('bounds the longest edge per size and outputs webp', async () => {
		const variants = await renderVariants(await makeImage(3000, 2000));
		for (const [size, edge] of Object.entries(IMAGE_SIZES)) {
			const meta = await sharp(variants[size as keyof typeof IMAGE_SIZES]).metadata();
			expect(meta.format).toBe('webp');
			expect(meta.width).toBe(edge);
			expect(meta.height).toBe(Math.round((edge * 2000) / 3000));
		}
	});

	it('never upscales small originals', async () => {
		const variants = await renderVariants(await makeImage(120, 300));
		const meta = await sharp(variants.display).metadata();
		expect(meta.width).toBe(120);
		expect(meta.height).toBe(300);
	});

	it('accepts an ArrayBuffer', async () => {
		const buf = await makeImage(500, 500);
		const ab = new ArrayBuffer(buf.byteLength);
		new Uint8Array(ab).set(buf);
		const variants = await renderVariants(ab);
		expect((await sharp(variants.thumb).metadata()).width).toBe(256);
	});

	it('rejects non-image bytes', async () => {
		await expect(renderVariants(Buffer.from('not an image'))).rejects.toThrow();
	});
});

describe('storeVariants', () => {
	it('upserts every size as webp at its variant path', async () => {
		const { client, upload } = storageStub();
		await storeVariants(client, 'o/products/p/1-a.jpg', await makeImage(400, 400));

		expect(upload).toHaveBeenCalledTimes(3);
		const paths = upload.mock.calls.map((c) => (c as unknown[])[0]);
		expect(paths).toEqual(allVariantPaths('o/products/p/1-a.jpg'));
		for (const call of upload.mock.calls) {
			expect((call as unknown[])[2]).toEqual({ contentType: 'image/webp', upsert: true });
		}
	});

	it('throws when an upload fails', async () => {
		const { client } = storageStub({ uploadError: 'boom' });
		await expect(storeVariants(client, 'a/x.jpg', await makeImage(50, 50))).rejects.toThrow(
			/Variant upload failed/
		);
	});
});

describe('generateVariantsFromStorage', () => {
	it('downloads the original and stores variants', async () => {
		const original = await makeImage(600, 600);
		const { client, upload, download } = storageStub({
			download: new Blob([new Uint8Array(original)])
		});
		await generateVariantsFromStorage(client, 'a/x.jpg');

		expect(download).toHaveBeenCalledWith('a/x.jpg');
		expect(upload).toHaveBeenCalledTimes(3);
	});

	it('throws when the original is missing', async () => {
		const { client, upload } = storageStub({ download: null });
		await expect(generateVariantsFromStorage(client, 'a/x.jpg')).rejects.toThrow(
			/Original download failed/
		);
		expect(upload).not.toHaveBeenCalled();
	});
});
