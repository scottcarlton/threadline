import type { SupabaseClient } from '@supabase/supabase-js';

// Shared product image upload helpers.
//
// Two entry points:
//
//   uploadProductImageFromBlob — given a Blob/Buffer + mime type, store it
//     in the `brand-assets` bucket and insert the matching `product_images`
//     row. Used by:
//       • POST /api/products/[productId]/images (interactive upload)
//       • The CSV importer's per-row image fetch (via the URL helper below)
//
//   fetchAndUploadProductImageFromUrl — fetches a public URL, validates
//     content-type + size, then delegates to uploadProductImageFromBlob.
//     Returns a discriminated result so the importer can collect failures
//     without throwing (best-effort: a bad URL skips the image, the
//     product still lands).
//
// Storage keys must avoid spaces and unsafe characters or the upload
// silently 400s with an opaque "Invalid key" message — the sanitizer
// below preserves that behavior from the original endpoint.

const BUCKET = 'brand-assets';

// 10 MB hard cap on image fetch — prevents a malicious URL from streaming
// us a giant payload during CSV import. Aligns with the `MAX_FILE_SIZE`
// constants used elsewhere for direct uploads.
const URL_FETCH_MAX_BYTES = 10 * 1024 * 1024;

// 10s connect+read timeout for image fetches. Long enough for slow CDNs,
// short enough that 100-row CSV imports don't stall on bad URLs.
const URL_FETCH_TIMEOUT_MS = 10_000;

const ALLOWED_IMAGE_MIMES = new Set([
	'image/jpeg',
	'image/jpg',
	'image/png',
	'image/webp',
	'image/avif',
	'image/gif'
]);

function safeFileName(name: string): string {
	return (name || 'upload')
		.normalize('NFKD')
		.replace(/[^a-zA-Z0-9.\-_]/g, '-')
		.replace(/-+/g, '-')
		.toLowerCase();
}

function extensionForMime(mime: string): string {
	switch (mime) {
		case 'image/jpeg':
		case 'image/jpg':
			return 'jpg';
		case 'image/png':
			return 'png';
		case 'image/webp':
			return 'webp';
		case 'image/avif':
			return 'avif';
		case 'image/gif':
			return 'gif';
		default:
			return 'bin';
	}
}

export type UploadProductImageResult = {
	id: string;
	file_path: string;
};

export async function uploadProductImageFromBlob(
	supabase: SupabaseClient,
	params: {
		productId: string;
		orgId: string;
		buffer: Buffer | ArrayBuffer | Uint8Array;
		mimeType: string;
		fileName?: string;
		fileSize?: number;
		uploadedBy: string;
		variantId?: string | null;
		role?: 'primary' | 'hover' | null;
	}
): Promise<UploadProductImageResult> {
	const { productId, orgId, buffer, mimeType, fileName, fileSize, uploadedBy, variantId, role } =
		params;

	const ext = extensionForMime(mimeType);
	const safeName = safeFileName(fileName ?? `image.${ext}`);
	const timestamp = Date.now();
	const filePath = `${orgId}/products/${productId}/${timestamp}-${safeName}`;

	const uploadBody =
		buffer instanceof Buffer
			? buffer
			: buffer instanceof Uint8Array
				? Buffer.from(buffer)
				: Buffer.from(new Uint8Array(buffer));

	const { error: uploadError } = await supabase.storage.from(BUCKET).upload(filePath, uploadBody, {
		contentType: mimeType,
		upsert: false
	});
	if (uploadError) {
		throw new Error(`Storage upload failed: ${uploadError.message}`);
	}

	// Match the existing endpoint's behavior: first image becomes primary,
	// sort_order is the current count (so subsequent images append).
	const { count } = await supabase
		.from('product_images')
		.select('id', { count: 'exact', head: true })
		.eq('product_id', productId);

	const { data: row, error: dbError } = await supabase
		.from('product_images')
		.insert({
			product_id: productId,
			file_path: filePath,
			file_size: fileSize ?? uploadBody.byteLength,
			mime_type: mimeType,
			sort_order: count ?? 0,
			is_primary: (count ?? 0) === 0,
			uploaded_by: uploadedBy,
			variant_id: variantId ?? null,
			role: role ?? null
		})
		.select('id, file_path')
		.single();

	if (dbError || !row) {
		// Roll back the storage write so we don't leak orphan blobs.
		await supabase.storage.from(BUCKET).remove([filePath]);
		throw new Error(`Image row insert failed: ${dbError?.message ?? 'unknown error'}`);
	}

	return { id: row.id as string, file_path: row.file_path as string };
}

export type FetchUrlImageResult =
	| { ok: true; id: string; file_path: string }
	| { ok: false; reason: string };

export async function fetchAndUploadProductImageFromUrl(
	supabase: SupabaseClient,
	params: {
		productId: string;
		orgId: string;
		url: string;
		uploadedBy: string;
	}
): Promise<FetchUrlImageResult> {
	const { productId, orgId, url, uploadedBy } = params;

	// Reject obviously bad input early — saves a network round trip.
	let parsedUrl: URL;
	try {
		parsedUrl = new URL(url);
	} catch {
		return { ok: false, reason: 'Invalid URL' };
	}
	if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
		return { ok: false, reason: 'URL must be http(s)' };
	}

	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), URL_FETCH_TIMEOUT_MS);

	try {
		const res = await fetch(url, { redirect: 'follow', signal: controller.signal });
		if (!res.ok) {
			return { ok: false, reason: `Fetch failed: HTTP ${res.status}` };
		}

		const contentType = (res.headers.get('content-type') ?? '').toLowerCase().split(';')[0].trim();
		if (!contentType.startsWith('image/')) {
			return { ok: false, reason: `Not an image (content-type: ${contentType || 'unknown'})` };
		}
		if (!ALLOWED_IMAGE_MIMES.has(contentType)) {
			return { ok: false, reason: `Unsupported image type: ${contentType}` };
		}

		// Cheap upfront check before reading the body.
		const declaredLength = Number(res.headers.get('content-length') ?? '0');
		if (declaredLength > URL_FETCH_MAX_BYTES) {
			return { ok: false, reason: 'Image exceeds 10MB cap' };
		}

		const arrayBuffer = await res.arrayBuffer();
		if (arrayBuffer.byteLength > URL_FETCH_MAX_BYTES) {
			return { ok: false, reason: 'Image exceeds 10MB cap' };
		}

		const fileNameFromUrl = parsedUrl.pathname.split('/').pop() ?? '';
		const result = await uploadProductImageFromBlob(supabase, {
			productId,
			orgId,
			buffer: arrayBuffer,
			mimeType: contentType,
			fileName: fileNameFromUrl,
			fileSize: arrayBuffer.byteLength,
			uploadedBy
		});

		return { ok: true, id: result.id, file_path: result.file_path };
	} catch (err) {
		if (err instanceof Error && err.name === 'AbortError') {
			return { ok: false, reason: 'Fetch timed out' };
		}
		const message = err instanceof Error ? err.message : 'Unknown error';
		return { ok: false, reason: message };
	} finally {
		clearTimeout(timeoutId);
	}
}
