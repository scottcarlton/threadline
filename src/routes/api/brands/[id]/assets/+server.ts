import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase';

export const POST: RequestHandler = async ({ request, locals, params }) => {
	if (!locals.session || !locals.user || !locals.organization) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const brandId = params.id;
	const orgId = locals.organization.id;

	const formData = await request.formData();
	const file = formData.get('file') as File | null;
	const category = (formData.get('category') as string) || 'general';

	if (!file) {
		return json({ error: 'Missing file' }, { status: 400 });
	}

	// Storage keys must avoid spaces and unsafe characters or the upload
	// silently 400s with an opaque "Invalid key" message.
	const safeName = (file.name || 'upload')
		.normalize('NFKD')
		.replace(/[^a-zA-Z0-9.\-_]/g, '-')
		.replace(/-+/g, '-')
		.toLowerCase();
	const timestamp = Date.now();
	const filePath = `${orgId}/${brandId}/${timestamp}-${safeName}`;

	const arrayBuffer = await file.arrayBuffer();
	const buffer = Buffer.from(arrayBuffer);

	const { error: uploadError } = await supabaseAdmin.storage
		.from('brand-assets')
		.upload(filePath, buffer, {
			contentType: file.type,
			upsert: false
		});

	if (uploadError) {
		console.error('[brands/assets] storage upload failed', {
			brandId,
			orgId,
			filePath,
			fileSize: file.size,
			mime: file.type,
			error: uploadError
		});
		return json({ error: 'Upload failed: ' + uploadError.message }, { status: 500 });
	}

	const { data: asset, error: dbError } = await supabaseAdmin
		.from('brand_assets')
		.insert({
			brand_id: brandId,
			organization_id: orgId,
			name: file.name,
			file_path: filePath,
			file_size: file.size,
			mime_type: file.type,
			category,
			uploaded_by: locals.user.id
		})
		.select()
		.single();

	if (dbError) {
		console.error('[brands/assets] db insert failed', { brandId, orgId, filePath, error: dbError });
		// Clean up uploaded file on DB error
		await supabaseAdmin.storage.from('brand-assets').remove([filePath]);
		return json({ error: 'Failed to create record: ' + dbError.message }, { status: 500 });
	}

	return json(asset, { status: 201 });
};

export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.session || !locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const brandId = params.id;

	const { data: assets, error: dbError } = await supabaseAdmin
		.from('brand_assets')
		.select('*')
		.eq('brand_id', brandId)
		.order('created_at', { ascending: false });

	if (dbError) {
		return json({ error: dbError.message }, { status: 500 });
	}

	return json(assets);
};

export const DELETE: RequestHandler = async ({ request, locals }) => {
	if (!locals.session || !locals.user || !locals.organization) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const { assetId } = await request.json();

	if (!assetId) {
		return json({ error: 'Missing assetId' }, { status: 400 });
	}

	// Fetch the asset to get file_path
	const { data: asset, error: fetchError } = await supabaseAdmin
		.from('brand_assets')
		.select('*')
		.eq('id', assetId)
		.eq('organization_id', locals.organization.id)
		.single();

	if (fetchError || !asset) {
		return json({ error: 'Asset not found' }, { status: 404 });
	}

	// Delete from storage
	const { error: storageError } = await supabaseAdmin.storage
		.from('brand-assets')
		.remove([asset.file_path]);

	if (storageError) {
		return json({ error: 'Storage delete failed: ' + storageError.message }, { status: 500 });
	}

	// Delete DB record
	const { error: dbError } = await supabaseAdmin.from('brand_assets').delete().eq('id', assetId);

	if (dbError) {
		return json({ error: 'DB delete failed: ' + dbError.message }, { status: 500 });
	}

	return json({ success: true });
};
