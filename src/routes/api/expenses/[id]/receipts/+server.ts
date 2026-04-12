import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase';

export const POST: RequestHandler = async ({ request, locals, params }) => {
	if (!locals.session || !locals.user || !locals.organization) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const expenseId = params.id;
	const orgId = locals.organization.id;

	const formData = await request.formData();
	const file = formData.get('file') as File | null;

	if (!file) {
		return json({ error: 'Missing file' }, { status: 400 });
	}

	const timestamp = Date.now();
	const filePath = `${orgId}/${expenseId}/${timestamp}-${file.name}`;

	const arrayBuffer = await file.arrayBuffer();
	const buffer = Buffer.from(arrayBuffer);

	const { error: uploadError } = await supabaseAdmin.storage
		.from('expense-receipts')
		.upload(filePath, buffer, {
			contentType: file.type,
			upsert: false
		});

	if (uploadError) {
		return json({ error: 'Upload failed: ' + uploadError.message }, { status: 500 });
	}

	const { data: receipt, error: dbError } = await supabaseAdmin
		.from('expense_receipts')
		.insert({
			expense_id: expenseId,
			organization_id: orgId,
			name: file.name,
			file_path: filePath,
			file_size: file.size,
			mime_type: file.type,
			uploaded_by: locals.user.id
		})
		.select()
		.single();

	if (dbError) {
		await supabaseAdmin.storage.from('expense-receipts').remove([filePath]);
		return json({ error: 'Failed to create record: ' + dbError.message }, { status: 500 });
	}

	return json(receipt, { status: 201 });
};

export const DELETE: RequestHandler = async ({ request, locals }) => {
	if (!locals.session || !locals.user || !locals.organization) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const { receiptId } = await request.json();

	if (!receiptId) {
		return json({ error: 'Missing receiptId' }, { status: 400 });
	}

	const { data: receipt, error: fetchError } = await supabaseAdmin
		.from('expense_receipts')
		.select('*')
		.eq('id', receiptId)
		.eq('organization_id', locals.organization.id)
		.single();

	if (fetchError || !receipt) {
		return json({ error: 'Receipt not found' }, { status: 404 });
	}

	const { error: storageError } = await supabaseAdmin.storage
		.from('expense-receipts')
		.remove([receipt.file_path]);

	if (storageError) {
		return json({ error: 'Storage delete failed: ' + storageError.message }, { status: 500 });
	}

	const { error: dbError } = await supabaseAdmin
		.from('expense_receipts')
		.delete()
		.eq('id', receiptId);

	if (dbError) {
		return json({ error: 'DB delete failed: ' + dbError.message }, { status: 500 });
	}

	return json({ success: true });
};
