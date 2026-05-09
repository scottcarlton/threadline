import { sendEmail, type SendEmailResult } from './email.js';

export type EmailTemplate = { subject: string; html: string; text: string };

const BASE_STYLES = `
	font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
	color: #111;
	line-height: 1.5;
`;

function wrap(body: string): string {
	return `<div style='${BASE_STYLES}max-width:560px;margin:0 auto;padding:24px;'>${body}</div>`;
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

export function invite(args: {
	inviterName: string;
	organizationName: string;
	acceptUrl: string;
}): EmailTemplate {
	const { inviterName, organizationName, acceptUrl } = args;
	return {
		subject: `${inviterName} invited you to ${organizationName} on Threadline`,
		html: wrap(`
			<h1 style='font-size:20px;margin:0 0 16px;'>You're invited to ${organizationName}</h1>
			<p>${inviterName} invited you to join <strong>${organizationName}</strong> on Threadline.</p>
			<p style='margin:24px 0;'>
				<a href='${acceptUrl}' style='background:#111;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block;'>Accept invitation</a>
			</p>
			<p style='color:#666;font-size:14px;'>Or paste this link: ${acceptUrl}</p>
		`),
		text: `${inviterName} invited you to ${organizationName} on Threadline.\n\nAccept: ${acceptUrl}`
	};
}

/**
 * Sends a connect-org invite email — the recipient gets a link that lands on
 * /connect/[code]. Used by the InviteOrgSidebar "Send by email" action.
 */
export async function sendInviteEmailFromOrg(args: {
	to: string;
	from_org_name: string;
	from_user_name: string | null;
	invite_url: string;
	message?: string;
	organizationId?: string;
	profileId?: string;
}): Promise<SendEmailResult> {
	const orgName = escapeHtml(args.from_org_name);
	const senderLine = args.from_user_name
		? `${escapeHtml(args.from_user_name)} at <strong>${orgName}</strong>`
		: `<strong>${orgName}</strong>`;
	const senderLineText = args.from_user_name
		? `${args.from_user_name} at ${args.from_org_name}`
		: args.from_org_name;

	const noteHtml = args.message
		? `<blockquote style='margin:24px 0;padding:12px 16px;border-left:3px solid #ddd;color:#444;background:#fafafa;font-size:15px;white-space:pre-wrap;'>${escapeHtml(args.message)}</blockquote>`
		: '';
	const noteText = args.message ? `\n\n"${args.message}"` : '';

	return sendEmail({
		to: args.to,
		subject: `${args.from_org_name} invited you to connect on Threadline`,
		html: wrap(`
			<h1 style='font-size:20px;margin:0 0 16px;'>You're invited to connect</h1>
			<p>${senderLine} invited your organization to connect on Threadline.</p>
			${noteHtml}
			<p style='margin:24px 0;'>
				<a href='${args.invite_url}' style='background:#111;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block;'>Open invite link</a>
			</p>
			<p style='color:#666;font-size:14px;'>Or paste this link: ${args.invite_url}</p>
		`),
		text: `${senderLineText} invited your organization to connect on Threadline.${noteText}\n\nOpen invite: ${args.invite_url}`,
		template: 'invite_org_connect',
		relatedType: 'connection_invite',
		organizationId: args.organizationId,
		profileId: args.profileId
	});
}

export function notification(args: {
	title: string;
	body: string;
	actionUrl?: string;
	actionLabel?: string;
}): EmailTemplate {
	const { title, body, actionUrl, actionLabel } = args;
	const cta = actionUrl
		? `<p style='margin:24px 0;'><a href='${actionUrl}' style='background:#111;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block;'>${actionLabel ?? 'Open in Threadline'}</a></p>`
		: '';
	return {
		subject: title,
		html: wrap(`
			<h1 style='font-size:20px;margin:0 0 16px;'>${title}</h1>
			<p>${body}</p>
			${cta}
		`),
		text: `${title}\n\n${body}${actionUrl ? `\n\n${actionUrl}` : ''}`
	};
}
