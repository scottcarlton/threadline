import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase';

export const POST: RequestHandler = async ({ request, locals, params }) => {
	if (!locals.session || !locals.user || !locals.organization) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const dateId = params.dateId;
	const orgId = locals.organization.id;

	const formData = await request.formData();
	const file = formData.get('file') as File | null;

	if (!file) {
		return json({ error: 'Missing file' }, { status: 400 });
	}

	const timestamp = Date.now();
	const filePath = `${orgId}/shows/${dateId}/${timestamp}-${file.name}`;

	const arrayBuffer = await file.arrayBuffer();
	const buffer = Buffer.from(arrayBuffer);

	const { error: uploadError } = await supabaseAdmin.storage
		.from('brand-assets')
		.upload(filePath, buffer, {
			contentType: file.type,
			upsert: false
		});

	if (uploadError) {
		return json({ error: 'Upload failed: ' + uploadError.message }, { status: 500 });
	}

	const { error: dbError } = await supabaseAdmin.from('show_date_documents').insert({
		show_date_id: dateId,
		organization_id: orgId,
		name: file.name,
		file_path: filePath,
		file_size: file.size,
		mime_type: file.type,
		uploaded_by: locals.user.id
	});

	if (dbError) {
		await supabaseAdmin.storage.from('brand-assets').remove([filePath]);
		return json({ error: 'Failed to create record: ' + dbError.message }, { status: 500 });
	}

	return json({ success: true }, { status: 201 });
};

export const DELETE: RequestHandler = async ({ request, locals }) => {
	if (!locals.session || !locals.user || !locals.organization) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const { documentId } = await request.json();
	if (!documentId) {
		return json({ error: 'Missing documentId' }, { status: 400 });
	}

	const { data: doc } = await supabaseAdmin
		.from('show_date_documents')
		.select('*')
		.eq('id', documentId)
		.eq('organization_id', locals.organization.id)
		.single();

	if (!doc) {
		return json({ error: 'Document not found' }, { status: 404 });
	}

	await supabaseAdmin.storage.from('brand-assets').remove([doc.file_path]);
	await supabaseAdmin.from('show_date_documents').delete().eq('id', documentId);

	return json({ success: true });
};
