import sharp from 'sharp';
import type { SupabaseClient } from '@supabase/supabase-js';

// Resized WebP variants of product images.
//
// Originals land in `brand-assets` at full resolution (often multi-MB
// Dropbox exports). Grids and thumbnail strips should never pull those, so
// every resizable original gets sibling variants at deterministic paths:
//
//   {dir}/{name}.jpg  →  {dir}/_variants/{size}/{name}.webp
//
// Variants are written eagerly at upload (uploadProductImageFromBlob) and
// lazily on first request for images uploaded before variants existed
// (GET /api/products/[productId]/images/[imageId]?size=...). Deterministic
// paths mean no schema change: a missing variant is just a storage miss.

const BUCKET = 'brand-assets';

// Longest-edge pixel bounds. Sized for 2x displays:
//   thumb:   thumbnail strips, order line items, cart rows (≤128 CSS px)
//   card:    grid cards and secondary detail tiles (≤400 CSS px)
//   display: detail page main image (≤800 CSS px)
export const IMAGE_SIZES = {
	thumb: 256,
	card: 800,
	display: 1600
} as const;

export type ImageSize = keyof typeof IMAGE_SIZES;

const WEBP_QUALITY = 80;

// GIFs are skipped (resizing drops animation); video is never resized.
const RESIZABLE_MIMES = new Set([
	'image/jpeg',
	'image/jpg',
	'image/png',
	'image/webp',
	'image/avif'
]);

export function parseImageSize(raw: string | null | undefined): ImageSize | null {
	return raw && Object.hasOwn(IMAGE_SIZES, raw) ? (raw as ImageSize) : null;
}

export function isResizableMime(mime: string | null | undefined): boolean {
	return !!mime && RESIZABLE_MIMES.has(mime.toLowerCase());
}

export function variantPath(filePath: string, size: ImageSize): string {
	const slash = filePath.lastIndexOf('/');
	const dir = slash === -1 ? '' : filePath.slice(0, slash + 1);
	const fileName = filePath.slice(slash + 1);
	const dot = fileName.lastIndexOf('.');
	const base = dot > 0 ? fileName.slice(0, dot) : fileName;
	return `${dir}_variants/${size}/${base}.webp`;
}

export function allVariantPaths(filePath: string): string[] {
	return (Object.keys(IMAGE_SIZES) as ImageSize[]).map((size) => variantPath(filePath, size));
}

export async function renderVariants(
	input: Buffer | ArrayBuffer | Uint8Array
): Promise<Record<ImageSize, Buffer>> {
	const source = input instanceof ArrayBuffer ? new Uint8Array(input) : input;
	const entries = await Promise.all(
		(Object.entries(IMAGE_SIZES) as [ImageSize, number][]).map(async ([size, edge]) => {
			const buffer = await sharp(source)
				// Apply EXIF orientation before the metadata is stripped.
				.rotate()
				.resize({ width: edge, height: edge, fit: 'inside', withoutEnlargement: true })
				.webp({ quality: WEBP_QUALITY })
				.toBuffer();
			return [size, buffer] as const;
		})
	);
	return Object.fromEntries(entries) as Record<ImageSize, Buffer>;
}

// Render and upload every variant for one original. Upserts, so concurrent
// lazy generation for the same image is harmless.
export async function storeVariants(
	supabase: SupabaseClient,
	filePath: string,
	original: Buffer | ArrayBuffer | Uint8Array
): Promise<void> {
	const variants = await renderVariants(original);
	await Promise.all(
		(Object.entries(variants) as [ImageSize, Buffer][]).map(async ([size, buffer]) => {
			const { error } = await supabase.storage
				.from(BUCKET)
				.upload(variantPath(filePath, size), buffer, {
					contentType: 'image/webp',
					upsert: true
				});
			if (error) throw new Error(`Variant upload failed (${size}): ${error.message}`);
		})
	);
}

// Lazy path for originals uploaded before variants existed. Downloads the
// original once and writes all sizes so sibling requests hit storage.
export async function generateVariantsFromStorage(
	supabase: SupabaseClient,
	filePath: string
): Promise<void> {
	const { data, error } = await supabase.storage.from(BUCKET).download(filePath);
	if (error || !data) {
		throw new Error(`Original download failed: ${error?.message ?? 'not found'}`);
	}
	await storeVariants(supabase, filePath, await data.arrayBuffer());
}
