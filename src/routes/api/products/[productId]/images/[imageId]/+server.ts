import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase';

export const GET: RequestHandler = async ({ params, locals }) => {
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

	const { data: signedData } = await supabaseAdmin.storage
		.from('brand-assets')
		.createSignedUrl(image.file_path, 300);

	if (!signedData?.signedUrl) return new Response('File not found', { status: 404 });

	// Redirect to signed URL
	return new Response(null, {
		status: 302,
		headers: { Location: signedData.signedUrl }
	});
};
