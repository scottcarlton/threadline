import { sendEmail, type SendEmailResult } from './email.js';
import templateIds from '../../../emails/template-ids.json';

export type InviteEmailArgs = {
	inviterName: string;
	organizationName: string;
	acceptUrl: string;
	role?: string;
	expiresInDays?: number;
};

export function inviteParams(args: InviteEmailArgs): Record<string, string | number> {
	return {
		INVITER_NAME: args.inviterName,
		ORGANIZATION_NAME: args.organizationName,
		ACCEPT_URL: args.acceptUrl,
		ROLE: args.role ?? '',
		EXPIRES_IN_DAYS: args.expiresInDays ?? 7
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
	return sendEmail({
		to: args.to,
		subject: `${args.from_org_name} invited you to connect on Threadline`,
		html: '',
		templateId: templateIds['invite-org-connect'],
		params: {
			FROM_ORG_NAME: args.from_org_name,
			FROM_USER_NAME: args.from_user_name ?? '',
			PERSONAL_MESSAGE: args.message ?? '',
			INVITE_URL: args.invite_url
		},
		template: 'invite_org_connect',
		relatedType: 'connection_invite',
		organizationId: args.organizationId,
		profileId: args.profileId
	});
}
