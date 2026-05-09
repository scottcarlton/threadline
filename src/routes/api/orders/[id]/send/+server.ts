import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase';
import { getGmailClient, buildRawEmail } from '$lib/server/gmail';
import { generateOrderPdf } from '$lib/server/pdf';
import { sendEmail } from '$lib/server/email';

export const POST: RequestHandler = async ({ request, locals, params }) => {
	if (!locals.session || !locals.user || !locals.organization) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const orderId = params.id;
	const { to, subject, body, assetIds } = (await request.json()) as {
		to?: string;
		subject?: string;
		body?: string;
		assetIds?: string[];
	};

	const [orderResult, linesResult] = await Promise.all([
		supabaseAdmin
			.from('orders')
			.select(
				'*, brands(name, contact_first_name, contact_last_name, contact_email, contact_phone), accounts(business_name, contact_first_name, contact_last_name, contact_email, phone, address_line1, address_line2, city, state, zip, country), seasons(name), shows(name)'
			)
			.eq('id', orderId)
			.single(),
		supabaseAdmin.from('order_lines').select('*').eq('order_id', orderId).order('sort_order')
	]);

	if (orderResult.error || !orderResult.data) {
		return json({ error: 'Order not found' }, { status: 404 });
	}

	const order = orderResult.data;
	const lines = linesResult.data ?? [];
	const account = order.accounts as {
		business_name: string;
		contact_first_name: string | null;
		contact_last_name: string | null;
		contact_email: string | null;
	};

	const recipientEmail = to?.trim() || account?.contact_email;

	if (!recipientEmail) {
		return json({ error: 'No recipient email address' }, { status: 400 });
	}

	// Generate order PDF
	const pdfBytes = await generateOrderPdf(order, lines);

	const brandName = (order.brands as { name: string })?.name ?? 'Order';
	const attachments: { filename: string; mimeType: string; content: Buffer }[] = [
		{
			filename: `order-${order.order_number}.pdf`,
			mimeType: 'application/pdf',
			content: Buffer.from(pdfBytes)
		}
	];

	// Load additional brand assets if requested
	if (assetIds && assetIds.length > 0) {
		const { data: assets } = await supabaseAdmin
			.from('brand_assets')
			.select('*')
			.in('id', assetIds)
			.eq('organization_id', locals.organization.id);

		if (assets) {
			for (const asset of assets) {
				const { data: fileData } = await supabaseAdmin.storage
					.from('brand-assets')
					.download(asset.file_path);

				if (fileData) {
					const arrayBuffer = await fileData.arrayBuffer();
					attachments.push({
						filename: asset.name,
						mimeType: asset.mime_type || 'application/octet-stream',
						content: Buffer.from(arrayBuffer)
					});
				}
			}
		}
	}

	const emailSubject = subject?.trim() || `${brandName} Order #${order.order_number}`;
	const emailBody =
		body?.trim() ||
		[
			`Hi ${[account.contact_first_name, account.contact_last_name].filter(Boolean).join(' ') || account.business_name},`,
			'',
			`Please find attached your order #${order.order_number} for ${brandName}.`,
			'',
			`Order Total: $${Number(order.total_amount).toFixed(2)}`,
			order.notes ? `\nNotes: ${order.notes}` : '',
			'',
			'Thank you for your business!',
			''
		].join('\n');

	// Try Gmail first — sends from user's own inbox
	const gmail = await getGmailClient(locals.user.id);
	const { data: connection } = gmail
		? await supabaseAdmin
				.from('email_connections')
				.select('email_address')
				.eq('profile_id', locals.user.id)
				.eq('provider', 'gmail')
				.single()
		: { data: null };

	if (gmail && connection) {
		const raw = buildRawEmail(
			connection.email_address,
			recipientEmail,
			emailSubject,
			emailBody,
			undefined,
			attachments
		);

		const sendResult = await gmail.users.messages.send({
			userId: 'me',
			requestBody: { raw }
		});

		const messageId = sendResult.data.id ?? '';

		await supabaseAdmin.from('email_log').insert({
			organization_id: locals.organization.id,
			sent_by: locals.user.id,
			to_email: recipientEmail,
			subject: emailSubject,
			body: emailBody,
			gmail_message_id: messageId,
			gmail_thread_id: sendResult.data.threadId ?? null,
			related_type: 'order',
			related_id: orderId
		});

		return json({ success: true, messageId });
	}

	// Fallback: send via Brevo with user's name + reply-to
	const { data: profile } = await supabaseAdmin
		.from('profiles')
		.select('first_name, last_name')
		.eq('id', locals.user.id)
		.single();

	const senderName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'Team';
	const userEmail =
		(await supabaseAdmin.auth.admin.getUserById(locals.user.id)).data?.user?.email ?? undefined;

	const result = await sendEmail({
		to: recipientEmail,
		subject: emailSubject,
		html: `<pre style="font-family: sans-serif; white-space: pre-wrap;">${emailBody}</pre>`,
		text: emailBody,
		from: `${senderName} via Threadline <orders@threadline.systems>`,
		replyTo: userEmail,
		attachments: attachments.map((a) => ({ filename: a.filename, content: a.content })),
		template: 'order-send',
		relatedType: 'order',
		relatedId: orderId,
		profileId: locals.user.id,
		organizationId: locals.organization.id
	});

	if (!result.ok) {
		return json({ error: result.error }, { status: 500 });
	}

	return json({ success: true, messageId: result.id });
};
