import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase';

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

export const POST: RequestHandler = async ({ request }) => {
	const formData = await request.formData();
	const file = formData.get('file') as File | null;
	const token = formData.get('token') as string | null;

	if (!token) {
		return json({ error: 'Missing upload token' }, { status: 400 });
	}

	if (!file) {
		return json({ error: 'Missing file' }, { status: 400 });
	}

	if (file.size > MAX_FILE_SIZE) {
		return json({ error: 'File exceeds 20MB limit' }, { status: 400 });
	}

	// Validate token
	const { data: uploadToken } = await supabaseAdmin
		.from('expense_upload_tokens')
		.select('*, brand_expenses(organization_id)')
		.eq('token', token)
		.single();

	if (!uploadToken) {
		return json({ error: 'Invalid upload token' }, { status: 404 });
	}

	if (new Date(uploadToken.expires_at) < new Date()) {
		return json({ error: 'Upload token has expired' }, { status: 410 });
	}

	const expenseId = uploadToken.expense_id;
	const orgId = uploadToken.organization_id;

	// Upload file to storage. Storage keys must avoid spaces and unsafe
	// characters or the upload silently 400s with an opaque "Invalid key" message.
	const safeName = (file.name || 'receipt')
		.normalize('NFKD')
		.replace(/[^a-zA-Z0-9.\-_]/g, '-')
		.replace(/-+/g, '-')
		.toLowerCase();
	const timestamp = Date.now();
	const filePath = `${orgId}/${expenseId}/${timestamp}-${safeName}`;

	const arrayBuffer = await file.arrayBuffer();
	const buffer = Buffer.from(arrayBuffer);

	const { error: uploadError } = await supabaseAdmin.storage
		.from('expense-receipts')
		.upload(filePath, buffer, {
			contentType: file.type,
			upsert: false
		});

	if (uploadError) {
		console.error('[upload/receipt] storage upload failed', {
			expenseId,
			orgId,
			filePath,
			fileSize: file.size,
			mime: file.type,
			error: uploadError
		});
		return json({ error: 'Upload failed: ' + uploadError.message }, { status: 500 });
	}

	// Insert receipt record
	const { data: receipt, error: dbError } = await supabaseAdmin
		.from('expense_receipts')
		.insert({
			expense_id: expenseId,
			organization_id: orgId,
			name: file.name,
			file_path: filePath,
			file_size: file.size,
			mime_type: file.type,
			uploaded_by: null
		})
		.select()
		.single();

	if (dbError) {
		console.error('[upload/receipt] db insert failed', {
			expenseId,
			orgId,
			filePath,
			error: dbError
		});
		await supabaseAdmin.storage.from('expense-receipts').remove([filePath]);
		return json({ error: 'Failed to save receipt: ' + dbError.message }, { status: 500 });
	}

	// Mark token as used (but don't invalidate — allow multiple uploads per session)
	if (!uploadToken.used_at) {
		await supabaseAdmin
			.from('expense_upload_tokens')
			.update({ used_at: new Date().toISOString() })
			.eq('id', uploadToken.id);
	}

	return json(receipt, { status: 201 });
};
