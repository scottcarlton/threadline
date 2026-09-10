import { MAILPIT_URL } from './env.js';

type MailpitMessage = { ID: string; Subject: string; Created?: string; Date?: string };

async function search(email: string): Promise<MailpitMessage[]> {
	const url = `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}&limit=50`;
	const res = await fetch(url);
	if (!res.ok) {
		throw new Error(
			`e2e mail: Mailpit search failed (${res.status}). Is local Supabase running? ` +
				`Expected the mail catcher at ${MAILPIT_URL}.`
		);
	}
	const body = (await res.json()) as { messages?: MailpitMessage[] };
	return body.messages ?? [];
}

/**
 * Drops every message addressed to one fixture mailbox. Called before each
 * sign-in so the code we read back is unambiguously the one this run asked
 * for. Scoped to the address, so a developer's other local mail survives.
 */
export async function clearMailbox(email: string): Promise<void> {
	const ids = (await search(email)).map((m) => m.ID);
	if (ids.length === 0) return;
	await fetch(`${MAILPIT_URL}/api/v1/messages`, {
		method: 'DELETE',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ IDs: ids })
	});
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Polls the fixture mailbox for the sign-in email and pulls the six-digit
 * one-time code out of it. GoTrue's stock magic-link template carries both a
 * verify link and "Alternatively, enter the code: 123456"; the login UI takes
 * the code, so that is what we read.
 */
export async function waitForSignInCode(email: string, timeoutMs = 20_000): Promise<string> {
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		const messages = await search(email);
		if (messages.length > 0) {
			const res = await fetch(`${MAILPIT_URL}/api/v1/message/${messages[0].ID}`);
			const body = (await res.json()) as { Text?: string; HTML?: string };
			const text = `${body.Text ?? ''}\n${body.HTML ?? ''}`;
			const match = text.match(/enter the code:\s*(\d{6})/i) ?? text.match(/\b(\d{6})\b/);
			if (match) return match[1];
		}
		if (Date.now() > deadline) {
			throw new Error(
				`e2e mail: no sign-in code for ${email} within ${timeoutMs}ms. ` +
					'Check the local auth server and the Mailpit rate limit ([auth.rate_limit] email_sent).'
			);
		}
		await sleep(250);
	}
}
