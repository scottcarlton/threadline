export type EmailTemplate = { subject: string; html: string; text: string };

const BASE_STYLES = `
	font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
	color: #111;
	line-height: 1.5;
`;

function wrap(body: string): string {
	return `<div style='${BASE_STYLES}max-width:560px;margin:0 auto;padding:24px;'>${body}</div>`;
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
