import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase';
import { uploadProductImageFromBlob } from '$lib/server/products/upload-image';

export const POST: RequestHandler = async ({ request, locals, params }) => {
	if (!locals.session || !locals.user || !locals.organization) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const productId = params.productId;
	const orgId = locals.organization.id;

	const formData = await request.formData();
	const file = formData.get('file') as File | null;
	if (!file) return json({ error: 'Missing file' }, { status: 400 });

	const arrayBuffer = await file.arrayBuffer();

	try {
		await uploadProductImageFromBlob(supabaseAdmin, {
			productId,
			orgId,
			buffer: arrayBuffer,
			mimeType: file.type,
			fileName: file.name,
			fileSize: file.size,
			uploadedBy: locals.user.id
		});
		return json({ success: true }, { status: 201 });
	} catch (err) {
		console.error('[products/images] upload failed', {
			productId,
			orgId,
			fileSize: file.size,
			mime: file.type,
			error: err instanceof Error ? err.message : err
		});
		return json({ error: err instanceof Error ? err.message : 'Upload failed' }, { status: 500 });
	}
};

export const DELETE: RequestHandler = async ({ request, locals }) => {
	if (!locals.session || !locals.user || !locals.organization) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const { imageId } = await request.json();
	if (!imageId) return json({ error: 'Missing imageId' }, { status: 400 });

	const { data: image } = await supabaseAdmin
		.from('product_images')
		.select('*, products!inner(organization_id)')
		.eq('id', imageId)
		.single();

	type ProductJoin = { organization_id: string };
	const productsJoined = (image as { products?: ProductJoin | ProductJoin[] | null } | null)
		?.products;
	const productRef = Array.isArray(productsJoined) ? productsJoined[0] : productsJoined;
	if (!image || productRef?.organization_id !== locals.organization.id) {
		return json({ error: 'Image not found' }, { status: 404 });
	}

	await supabaseAdmin.storage.from('brand-assets').remove([image.file_path]);
	await supabaseAdmin.from('product_images').delete().eq('id', imageId);

	return json({ success: true });
};
