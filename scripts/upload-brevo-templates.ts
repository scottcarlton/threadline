/**
 * Uploads all transactional email templates in emails/brevo/ to Brevo
 * and writes the slug → templateId mapping to emails/template-ids.json.
 *
 * Re-running is safe — existing templates are updated by ID, new ones are created.
 *
 * Required env: BREVO_API_KEY (full access, NOT sending-only).
 *
 * Usage:
 *   BREVO_API_KEY=<key> bun run scripts/upload-brevo-templates.ts
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { BrevoClient } from '@getbrevo/brevo';

const TEMPLATES_DIR = join(import.meta.dir, '..', 'emails');
const IDS_FILE = join(TEMPLATES_DIR, 'template-ids.json');

const SENDER = { name: 'Threadline', email: 'noreply@threadline.systems' };

type TemplateSpec = {
	slug: string;
	subject: string;
};

const TEMPLATES: TemplateSpec[] = [
	{
		slug: 'order-submitted',
		subject: 'New order: {{params.ORDER_NUMBER}} for {{params.ACCOUNT_NAME}}'
	},
	{ slug: 'order-created', subject: 'Draft saved: {{params.ORDER_NUMBER}}' },
	{ slug: 'order-confirmed', subject: 'Order confirmed: {{params.ORDER_NUMBER}}' },
	{
		slug: 'order-shipped',
		subject: 'Order shipped: {{params.ORDER_NUMBER}}'
	},
	{ slug: 'order-delivered', subject: 'Order delivered: {{params.ORDER_NUMBER}}' },
	{
		slug: 'invite-org-member',
		subject: '{{params.INVITER_NAME}} invited you to {{params.ORGANIZATION_NAME}} on /Threadline'
	},
	{
		slug: 'invite-buyer-team',
		subject: '{{params.INVITER_NAME}} added you to {{params.ORGANIZATION_NAME}} on /Threadline'
	},
	{
		slug: 'invite-connection-member',
		subject: '{{params.INVITER_NAME}} added you to {{params.ORGANIZATION_NAME}} on /Threadline'
	},
	{
		slug: 'invite-org-connect',
		subject: '{{params.FROM_ORG_NAME}} invited your org to connect on /Threadline'
	}
];

async function loadExistingIds(): Promise<Record<string, number>> {
	try {
		const raw = await readFile(IDS_FILE, 'utf8');
		return JSON.parse(raw);
	} catch {
		return {};
	}
}

async function main() {
	const apiKey = process.env.BREVO_API_KEY;
	if (!apiKey) throw new Error('BREVO_API_KEY not set');

	const client = new BrevoClient({ apiKey });
	const existingIds = await loadExistingIds();
	const idMap: Record<string, number> = {};

	for (const spec of TEMPLATES) {
		// Brevo API limit is 10 req/sec — 250ms spacing keeps us comfortably under.
		await new Promise((resolve) => setTimeout(resolve, 250));

		try {
			const html = await readFile(join(TEMPLATES_DIR, 'brevo', `${spec.slug}.html`), 'utf8');

			const payload = {
				templateName: spec.slug,
				subject: spec.subject,
				htmlContent: html,
				sender: SENDER,
				isActive: true
			};

			const knownId = existingIds[spec.slug];

			if (knownId) {
				await client.transactionalEmails.updateSmtpTemplate({
					templateId: knownId,
					...payload
				});
				idMap[spec.slug] = knownId;
			} else {
				// Check if template already exists in Brevo by listing and matching name
				const list = await client.transactionalEmails.getSmtpTemplates({ limit: 1000 });
				const match = list.templates?.find((t) => t.name === spec.slug);

				if (match) {
					await client.transactionalEmails.updateSmtpTemplate({
						templateId: match.id,
						...payload
					});
					idMap[spec.slug] = match.id;
				} else {
					const created = await client.transactionalEmails.createSmtpTemplate(payload);
					idMap[spec.slug] = created.id;
				}
			}

			console.log(`  ${spec.slug.padEnd(28)} ${idMap[spec.slug]}`);
		} catch (err) {
			console.error(`  ${spec.slug}: ${(err as Error).message}`);
			process.exitCode = 1;
		}
	}

	await writeFile(IDS_FILE, JSON.stringify(idMap, null, '\t') + '\n');
	console.log(`\nDone: ${Object.keys(idMap).length}/${TEMPLATES.length} uploaded.`);
	console.log(`IDs written to ${IDS_FILE}`);
}

main();
