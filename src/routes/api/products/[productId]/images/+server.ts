import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase';

export const POST: RequestHandler = async ({ request, locals, params }) => {
	if (!locals.session || !locals.user || !locals.organization) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const productId = params.productId;
	const orgId = locals.organization.id;

	const formData = await request.formData();
	const file = formData.get('file') as File | null;
	if (!file) return json({ error: 'Missing file' }, { status: 400 });

	const timestamp = Date.now();
	const filePath = `${orgId}/products/${productId}/${timestamp}-${file.name}`;

	const arrayBuffer = await file.arrayBuffer();
	const buffer = Buffer.from(arrayBuffer);

	const { error: uploadError } = await supabaseAdmin.storage
		.from('brand-assets')
		.upload(filePath, buffer, { contentType: file.type, upsert: false });

	if (uploadError) return json({ error: 'Upload failed: ' + uploadError.message }, { status: 500 });

	// Check if this is the first image (make it primary)
	const { count } = await supabaseAdmin
		.from('product_images')
		.select('id', { count: 'exact', head: true })
		.eq('product_id', productId);

	const { error: dbError } = await supabaseAdmin.from('product_images').insert({
		product_id: productId,
		file_path: filePath,
		file_size: file.size,
		mime_type: file.type,
		sort_order: count ?? 0,
		is_primary: (count ?? 0) === 0,
		uploaded_by: locals.user.id
	});

	if (dbError) {
		await supabaseAdmin.storage.from('brand-assets').remove([filePath]);
		return json({ error: dbError.message }, { status: 500 });
	}

	return json({ success: true }, { status: 201 });
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
