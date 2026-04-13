import { supabaseAdmin } from '$lib/server/supabase';

type CreateNotificationParams = {
	organizationId: string;
	userId: string;
	type: string;
	title: string;
	body?: string;
	link?: string;
};

export async function createNotification(params: CreateNotificationParams) {
	await supabaseAdmin.from('notifications').insert({
		organization_id: params.organizationId,
		user_id: params.userId,
		type: params.type,
		title: params.title,
		body: params.body ?? null,
		link: params.link ?? null
	});
}

export async function notifyOrgMembers(
	organizationId: string,
	excludeUserId: string,
	params: Omit<CreateNotificationParams, 'organizationId' | 'userId'>
) {
	const { data: members } = await supabaseAdmin
		.from('organization_members')
		.select('profile_id')
		.eq('organization_id', organizationId)
		.neq('profile_id', excludeUserId);

	if (!members || members.length === 0) return;

	await supabaseAdmin.from('notifications').insert(
		members.map((m) => ({
			organization_id: organizationId,
			user_id: m.profile_id,
			type: params.type,
			title: params.title,
			body: params.body ?? null,
			link: params.link ?? null
		}))
	);
}
