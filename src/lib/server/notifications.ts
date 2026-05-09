import { supabaseAdmin } from '$lib/server/supabase';

type CreateNotificationParams = {
	organizationId: string;
	userId: string;
	type: string;
	title: string;
	body?: string;
	link?: string;
	actorName?: string | null;
	actorUserId?: string | null;
};

export async function createNotification(params: CreateNotificationParams) {
	const actorName = params.actorName ?? (await resolveActorName(params.actorUserId));
	await supabaseAdmin.from('notifications').insert({
		organization_id: params.organizationId,
		user_id: params.userId,
		type: params.type,
		title: params.title,
		body: params.body ?? null,
		link: params.link ?? null,
		actor_name: actorName
	});
}

async function resolveActorName(userId: string | null | undefined): Promise<string | null> {
	if (!userId) return null;
	const { data } = await supabaseAdmin
		.from('profiles')
		.select('display_name')
		.eq('id', userId)
		.maybeSingle();
	return data?.display_name ?? null;
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

	const actorName = params.actorName ?? (await resolveActorName(excludeUserId));

	await supabaseAdmin.from('notifications').insert(
		members.map((m) => ({
			organization_id: organizationId,
			user_id: m.profile_id,
			type: params.type,
			title: params.title,
			body: params.body ?? null,
			link: params.link ?? null,
			actor_name: actorName
		}))
	);
}

export async function notifyOrgAdmins(
	organizationId: string,
	excludeUserId: string,
	params: Omit<CreateNotificationParams, 'organizationId' | 'userId'>
) {
	const { data: admins } = await supabaseAdmin
		.from('organization_members')
		.select('profile_id')
		.eq('organization_id', organizationId)
		.in('role', ['admin', 'owner'])
		.neq('profile_id', excludeUserId);

	if (!admins || admins.length === 0) return;

	const actorName = params.actorName ?? (await resolveActorName(excludeUserId));

	await supabaseAdmin.from('notifications').insert(
		admins.map((m) => ({
			organization_id: organizationId,
			user_id: m.profile_id,
			type: params.type,
			title: params.title,
			body: params.body ?? null,
			link: params.link ?? null,
			actor_name: actorName
		}))
	);
}

export async function notifyBrandAdmins(
	brandId: string,
	excludeUserId: string,
	params: Omit<CreateNotificationParams, 'organizationId' | 'userId'>
) {
	const { data: brand } = await supabaseAdmin
		.from('brands')
		.select('organization_id')
		.eq('id', brandId)
		.single();
	if (!brand) return;

	const { data: admins } = await supabaseAdmin
		.from('organization_members')
		.select('profile_id')
		.eq('organization_id', brand.organization_id)
		.in('role', ['admin', 'owner'])
		.neq('profile_id', excludeUserId);

	if (!admins || admins.length === 0) return;

	const actorName = params.actorName ?? (await resolveActorName(excludeUserId));

	await supabaseAdmin.from('notifications').insert(
		admins.map((m) => ({
			organization_id: brand.organization_id,
			user_id: m.profile_id,
			type: params.type,
			title: params.title,
			body: params.body ?? null,
			link: params.link ?? null,
			actor_name: actorName
		}))
	);
}
