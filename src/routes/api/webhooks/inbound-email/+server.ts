import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase.js';
import {
	verifyWebhook,
	parseInboundItem,
	extractEmailAddress
} from '$lib/server/email-intake/brevo-inbound.js';
import type { ReceivedEmail } from '$lib/server/email-intake/brevo-inbound.js';
import { resolveOrgFromSender } from '$lib/server/email-intake/route.js';
import { parseInboundOrder } from '$lib/server/email-intake/parser.js';
import { resolveEntities } from '$lib/server/email-intake/resolve.js';
import { decideOutcome, executeOutcome } from '$lib/server/email-intake/outcome.js';

const RATE_LIMIT_PER_HOUR = 60;

export const POST: RequestHandler = async ({ request }) => {
	// ── 1. Verify webhook signature ──────────────────────────
	const rawBody = await request.text();
	const payload = verifyWebhook(rawBody, request.headers);

	if (!payload) {
		return json({ error: 'Invalid webhook signature' }, { status: 401 });
	}

	// Brevo delivers parsed emails in items[] — process each independently
	const results: Array<{ intake_id: string; status: string }> = [];

	for (const item of payload.items) {
		const result = await processItem(parseInboundItem(item));
		results.push(result);
	}

	return json({ ok: true, results });
};

async function processItem(
	fullEmail: ReceivedEmail
): Promise<{ intake_id: string; status: string }> {
	const fromEmail = extractEmailAddress(fullEmail.from);
	const messageId = fullEmail.messageId;

	// ── 2. Idempotency check ─────────────────────────────────
	const { data: existing } = await supabaseAdmin
		.from('email_intakes')
		.select('id')
		.eq('message_id', messageId)
		.maybeSingle();

	if (existing) {
		return { intake_id: existing.id, status: 'deduplicated' };
	}

	// ── 3. Rate limiting ─────────────────────────────────────
	const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
	const { count } = await supabaseAdmin
		.from('email_intakes')
		.select('id', { count: 'exact', head: true })
		.eq('from_email', fromEmail)
		.gte('created_at', oneHourAgo);

	if ((count ?? 0) >= RATE_LIMIT_PER_HOUR) {
		return { intake_id: '', status: 'rate_limited' };
	}

	// ── 4. Insert intake row ─────────────────────────────────
	const { data: intake, error: insertError } = await supabaseAdmin
		.from('email_intakes')
		.insert({
			from_email: fromEmail,
			to_email: fullEmail.to[0] ?? '',
			subject: fullEmail.subject ?? null,
			message_id: messageId,
			provider_email_id: fullEmail.id,
			status: 'received'
		})
		.select('id')
		.single();

	if (insertError || !intake) {
		console.error('[email-intake] Insert failed:', insertError);
		return { intake_id: '', status: 'insert_failed' };
	}

	const intakeId = intake.id;

	// ── 5. Process inline (route → parse → resolve → outcome) ──
	try {
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

			return { intake_id: intakeId, status: 'rejected' };
		}

		const emailBody = fullEmail.text ?? fullEmail.html ?? '';
		const parsed = await parseInboundOrder(emailBody);

		await supabaseAdmin
			.from('email_intakes')
			.update({ parsed_json: parsed, status: 'parsed' })
			.eq('id', intakeId);

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

			return { intake_id: intakeId, status: 'needs_routing' };
		}

		await supabaseAdmin
			.from('email_intakes')
			.update({ organization_id: resolved.organizationId })
			.eq('id', intakeId);

		const outcome = decideOutcome(resolved);
		await executeOutcome(intakeId, resolved, outcome);

		return { intake_id: intakeId, status: outcome.status };
	} catch (err) {
		console.error(`[email-intake] Processing failed for ${intakeId}:`, err);
		await supabaseAdmin
			.from('email_intakes')
			.update({
				status: 'needs_review',
				error_reason: err instanceof Error ? err.message : 'Unknown processing error'
			})
			.eq('id', intakeId);

		return { intake_id: intakeId, status: 'needs_review' };
	}
}
