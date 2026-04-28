/**
 * Uploads all transactional email templates in emails/resend/ to Resend
 * and publishes each. Run with `bun run scripts/upload-resend-templates.ts`.
 *
 * Re-running is safe — Resend dedupes by alias, so existing templates get
 * a new draft revision rather than a duplicate.
 *
 * Required env: RESEND_API_KEY (full_access permission, NOT sending_access).
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const API = 'https://api.resend.com';
const TEMPLATES_DIR = join(import.meta.dir, '..', 'emails');

type Var = { key: string; type: 'string' | 'number'; fallbackValue?: string | number };

type TemplateSpec = {
	slug: string;
	subject: string;
	variables: Var[];
};

const SHARED_ORDER_VARS: Var[] = [
	{ key: 'ORDER_NUMBER', type: 'string' },
	{ key: 'ACCOUNT_NAME', type: 'string' },
	{ key: 'BRAND_NAME', type: 'string' },
	{ key: 'TOTAL', type: 'string' },
	{ key: 'ORDER_URL', type: 'string' },
	{ key: 'LINE_COUNT', type: 'number', fallbackValue: 0 }
];

const SHARED_INVITE_VARS: Var[] = [
	{ key: 'INVITER_NAME', type: 'string' },
	{ key: 'ORGANIZATION_NAME', type: 'string' },
	{ key: 'ROLE', type: 'string', fallbackValue: '' },
	{ key: 'ACCEPT_URL', type: 'string' },
	{ key: 'EXPIRES_IN_DAYS', type: 'number', fallbackValue: 7 }
];

const TEMPLATES: TemplateSpec[] = [
	{
		slug: 'order-submitted',
		subject: 'New order: {{{ORDER_NUMBER}}} for {{{ACCOUNT_NAME}}}',
		variables: SHARED_ORDER_VARS
	},
	{
		slug: 'order-created',
		subject: 'Draft saved: {{{ORDER_NUMBER}}}',
		variables: SHARED_ORDER_VARS
	},
	{
		slug: 'order-confirmed',
		subject: 'Order confirmed: {{{ORDER_NUMBER}}}',
		variables: SHARED_ORDER_VARS
	},
	{
		slug: 'order-shipped',
		subject: 'Order shipped: {{{ORDER_NUMBER}}}',
		variables: [
			...SHARED_ORDER_VARS,
			{ key: 'TRACKING_NUMBER', type: 'string', fallbackValue: '' },
			{ key: 'TRACKING_URL', type: 'string', fallbackValue: '' }
		]
	},
	{
		slug: 'order-delivered',
		subject: 'Order delivered: {{{ORDER_NUMBER}}}',
		variables: SHARED_ORDER_VARS
	},
	{
		slug: 'invite-org-member',
		subject: '{{{INVITER_NAME}}} invited you to {{{ORGANIZATION_NAME}}} on /Threadline',
		variables: SHARED_INVITE_VARS
	},
	{
		slug: 'invite-buyer-team',
		subject: '{{{INVITER_NAME}}} added you to {{{ORGANIZATION_NAME}}} on /Threadline',
		variables: SHARED_INVITE_VARS
	},
	{
		slug: 'invite-connection-member',
		subject: '{{{INVITER_NAME}}} added you to {{{ORGANIZATION_NAME}}} on /Threadline',
		variables: SHARED_INVITE_VARS
	},
	{
		slug: 'invite-org-connect',
		subject: '{{{FROM_ORG_NAME}}} invited your org to connect on /Threadline',
		variables: [
			{ key: 'FROM_ORG_NAME', type: 'string' },
			{ key: 'FROM_USER_NAME', type: 'string', fallbackValue: '' },
			{ key: 'PERSONAL_MESSAGE', type: 'string', fallbackValue: '' },
			{ key: 'INVITE_URL', type: 'string' }
		]
	}
];

async function rest<T>(method: string, path: string, body?: unknown): Promise<T> {
	const apiKey = process.env.RESEND_API_KEY;
	if (!apiKey) throw new Error('RESEND_API_KEY not set');

	// Resend caps at 5 req/sec — keep us comfortably under by spacing calls.
	await new Promise((resolve) => setTimeout(resolve, 250));

	const res = await fetch(`${API}${path}`, {
		method,
		headers: {
			Authorization: `Bearer ${apiKey}`,
			'Content-Type': 'application/json'
		},
		body: body ? JSON.stringify(body) : undefined
	});

	const text = await res.text();
	if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text}`);
	return text ? JSON.parse(text) : ({} as T);
}

async function findExisting(alias: string): Promise<string | null> {
	const list = await rest<{ data: { id: string; alias?: string; name?: string }[] }>(
		'GET',
		'/templates?limit=100'
	);
	const match = list.data?.find((t) => t.alias === alias || t.name === alias);
	return match?.id ?? null;
}

async function upsert(spec: TemplateSpec): Promise<{ slug: string; id: string }> {
	const html = await readFile(join(TEMPLATES_DIR, 'resend', `${spec.slug}.html`), 'utf8');
	const text = await readFile(join(TEMPLATES_DIR, 'text', `${spec.slug}.txt`), 'utf8');

	const payload = {
		name: spec.slug,
		alias: spec.slug,
		subject: spec.subject,
		html,
		text,
		variables: spec.variables
	};

	const existing = await findExisting(spec.slug);
	let id: string;

	if (existing) {
		await rest('PATCH', `/templates/${existing}`, payload);
		id = existing;
	} else {
		const created = await rest<{ id: string }>('POST', '/templates', payload);
		id = created.id;
	}

	await rest('POST', `/templates/${id}/publish`);
	return { slug: spec.slug, id };
}

async function main() {
	const results: Array<{ slug: string; id: string }> = [];
	for (const spec of TEMPLATES) {
		try {
			const result = await upsert(spec);
			console.log(`✓ ${result.slug.padEnd(28)} ${result.id}`);
			results.push(result);
		} catch (err) {
			console.error(`✗ ${spec.slug}: ${(err as Error).message}`);
			process.exitCode = 1;
		}
	}
	console.log(`\nDone: ${results.length}/${TEMPLATES.length} uploaded.`);
}

main();
