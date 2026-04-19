import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase.js';
import {
	verifyWebhook,
	fetchReceivedEmail,
	extractEmailAddress
} from '$lib/server/email-intake/resend-inbound.js';
import { resolveOrgFromSender } from '$lib/server/email-intake/route.js';
import { parseInboundOrder } from '$lib/server/email-intake/parser.js';
import { resolveEntities } from '$lib/server/email-intake/resolve.js';
import { decideOutcome, executeOutcome } from '$lib/server/email-intake/outcome.js';

const RATE_LIMIT_PER_HOUR = 60;

export const POST: RequestHandler = async ({ request }) => {
	// ── 1. Verify webhook signature ──────────────────────────
	const rawBody = await request.text();
	const event = await verifyWebhook(rawBody, request.headers);

	if (!event) {
		return json({ error: 'Invalid webhook signature' }, { status: 401 });
	}

	if (event.type !== 'email.received') {
		// Acknowledge non-email events silently
		return json({ ok: true });
	}

	const { email_id: resendEmailId, from, to, subject } = event.data;
	const fromEmail = extractEmailAddress(from);

	// ── 2. Fetch full email content from Resend API ──────────
	const fullEmail = await fetchReceivedEmail(resendEmailId);
	if (!fullEmail) {
		console.error(`[email-intake] Failed to fetch email ${resendEmailId}`);
		return json({ error: 'Failed to fetch email content' }, { status: 502 });
	}

	const messageId = fullEmail.messageId;

	// ── 3. Idempotency check ─────────────────────────────────
	const { data: existing } = await supabaseAdmin
		.from('email_intakes')
		.select('id')
		.eq('message_id', messageId)
		.maybeSingle();

	if (existing) {
		return json({ ok: true, deduplicated: true });
	}

	// ── 4. Rate limiting ─────────────────────────────────────
	const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
	const { count } = await supabaseAdmin
		.from('email_intakes')
		.select('id', { count: 'exact', head: true })
		.eq('from_email', fromEmail)
		.gte('created_at', oneHourAgo);

	if ((count ?? 0) >= RATE_LIMIT_PER_HOUR) {
		return json({ error: 'Rate limit exceeded' }, { status: 429 });
	}

	// ── 5. Insert intake row ─────────────────────────────────
	const { data: intake, error: insertError } = await supabaseAdmin
		.from('email_intakes')
		.insert({
			from_email: fromEmail,
			to_email: to[0] ?? '',
			subject: subject ?? null,
			message_id: messageId,
			resend_email_id: resendEmailId,
			status: 'received'
		})
		.select('id')
		.single();

	if (insertError || !intake) {
		console.error('[email-intake] Insert failed:', insertError);
		return json({ error: 'Failed to create intake' }, { status: 500 });
	}

	const intakeId = intake.id;

	// ── 6. Process inline (route → parse → resolve → outcome) ──
	try {
		// Route: resolve sender to org
		const routeResult = await resolveOrgFromSender(fromEmail);

		if (routeResult.kind === 'none') {
			await supabaseAdmin
				.from('email_intakes')
				.update({
					status: 'rejected',
					error_reason:
						routeResult.reason === 'unknown_sender'
							? 'Email address not linked to any Threadline account'
							: 'Email ordering not enabled for this account'
				})
				.eq('id', intakeId);

			// TODO (Phase 4): send bounce email
			return json({ ok: true, intake_id: intakeId, status: 'rejected' });
		}

		// Parse: extract order from email body
		const emailBody = fullEmail.text ?? fullEmail.html ?? '';
		const parsed = await parseInboundOrder(emailBody);

		await supabaseAdmin
			.from('email_intakes')
			.update({ parsed_json: parsed, status: 'parsed' })
			.eq('id', intakeId);

		// Resolve: match entities against the database
		const orgCandidates =
			routeResult.kind === 'single'
				? [{ organizationId: routeResult.organizationId, userId: routeResult.userId }]
				: routeResult.candidates;

		const resolved = await resolveEntities(parsed, orgCandidates);

		if (resolved.kind === 'ambiguous') {
			await supabaseAdmin
				.from('email_intakes')
				.update({
					status: 'needs_routing',
					error_reason: 'Could not determine which organization this order belongs to'
				})
				.eq('id', intakeId);

			// TODO (Phase 4): send routing-ambiguity bounce email
			return json({ ok: true, intake_id: intakeId, status: 'needs_routing' });
		}

		// Update intake with the resolved org
		await supabaseAdmin
			.from('email_intakes')
			.update({ organization_id: resolved.organizationId })
			.eq('id', intakeId);

		// Outcome: decide submit vs review, create order
		const outcome = decideOutcome(resolved);
		await executeOutcome(intakeId, resolved, outcome);

		return json({ ok: true, intake_id: intakeId, status: outcome.status });
	} catch (err) {
		console.error(`[email-intake] Processing failed for ${intakeId}:`, err);
		await supabaseAdmin
			.from('email_intakes')
			.update({
				status: 'needs_review',
				error_reason: err instanceof Error ? err.message : 'Unknown processing error'
			})
			.eq('id', intakeId);

		return json({ ok: true, intake_id: intakeId, status: 'needs_review' });
	}
};
