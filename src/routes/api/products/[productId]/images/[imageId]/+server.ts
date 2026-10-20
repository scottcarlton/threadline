import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase';
import {
	generateVariantsFromStorage,
	isResizableMime,
	parseImageSize,
	variantPath,
	type ImageSize
} from '$lib/server/products/image-variants';

const SIGNED_URL_TTL_S = 300;

async function sign(path: string): Promise<string | null> {
	const { data } = await supabaseAdmin.storage
		.from('brand-assets')
		.createSignedUrl(path, SIGNED_URL_TTL_S);
	return data?.signedUrl ?? null;
}

// Signs the resized variant, generating it on first request for images
// uploaded before variants existed. Returns null when the variant can't be
// produced so the caller falls back to the original.
async function signVariant(filePath: string, size: ImageSize): Promise<string | null> {
	const path = variantPath(filePath, size);
	const existing = await sign(path);
	if (existing) return existing;

	try {
		await generateVariantsFromStorage(supabaseAdmin, filePath);
	} catch (err) {
		console.error('[products/images] lazy variant generation failed', {
			filePath,
			size,
			error: err instanceof Error ? err.message : err
		});
		return null;
	}
	return sign(path);
}

export const GET: RequestHandler = async ({ params, locals, url }) => {
	if (!locals.session || !locals.user) {
		return new Response('Unauthorized', { status: 401 });
	}

	// Read through the RLS-scoped client, not supabaseAdmin. `product_images`
	// already has the right policy (own-org via the products join, plus reps
	// seeing connected brands' images via org_connections — §A.3), so going
	// through RLS enforces federation instead of reimplementing it. Reading via
	// supabaseAdmin here handed any authenticated user a signed URL for any
	// brand's imagery.
	//
	// Scoped by productId too, so the path can't disagree with the row it serves.
	const { data: image } = await locals.supabase
		.from('product_images')
		.select('file_path, mime_type')
		.eq('id', params.imageId)
		.eq('product_id', params.productId)
		.maybeSingle();

	if (!image) return new Response('Not found', { status: 404 });

	// `?size=thumb|card|display` serves a resized WebP. Unknown sizes, video,
	// and GIFs get the original.
	const size = parseImageSize(url.searchParams.get('size'));
	const signedUrl =
		(size && isResizableMime(image.mime_type) ? await signVariant(image.file_path, size) : null) ??
		(await sign(image.file_path));

	if (!signedUrl) return new Response('File not found', { status: 404 });

	// Each request mints a new signature, which defeats the browser's image
	// cache. Let the browser reuse this redirect (and so the same signed URL)
	// for most of the signature's lifetime.
	return new Response(null, {
		status: 302,
		headers: {
			Location: signedUrl,
			'Cache-Control': `private, max-age=${SIGNED_URL_TTL_S - 60}`
		}
	});
};
