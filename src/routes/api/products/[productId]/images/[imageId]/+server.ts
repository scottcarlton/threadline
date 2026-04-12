import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase';

export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.session || !locals.user) {
		return new Response('Unauthorized', { status: 401 });
	}

	const { data: image } = await supabaseAdmin
		.from('product_images')
		.select('file_path, mime_type')
		.eq('id', params.imageId)
		.single();

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
