import { supabaseAdmin } from '$lib/server/supabase.js';

const VERIFICATION_MESSAGE =
	'Welcome to Threadline. To get started, reply with the email address you use to sign in.';

const MAX_ATTEMPTS = 3;

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

export function parseVerificationReply(text: string): string | null {
	const match = text.match(EMAIL_RE);
	return match ? match[0].toLowerCase() : null;
}

export function isVerificationPrompt(text: string): boolean {
	return text === VERIFICATION_MESSAGE;
}

export async function lookupByPhone(
	phone: string
): Promise<{ profileId: string; userId: string } | null> {
	const { data } = await supabaseAdmin
		.from('profiles')
		.select('id')
		.eq('messaging_phone', phone)
		.maybeSingle();

	if (!data) return null;
	return { profileId: data.id, userId: data.id };
}

export async function bindPhoneToUser(
	phone: string,
	email: string
): Promise<
	{ success: true; profileId: string; userId: string } | { success: false; message: string }
> {
	const { data: authUsers } = await supabaseAdmin.rpc('get_user_id_by_email', {
		lookup_email: email
	});

	const userId =
		Array.isArray(authUsers) && authUsers.length > 0 ? (authUsers[0] as { id: string }).id : null;

	if (!userId) {
		return {
			success: false,
			message: "I couldn't find an account with that email. Please check and try again."
		};
	}

	const { data: existing } = await supabaseAdmin
		.from('profiles')
		.select('id')
		.eq('messaging_phone', phone)
		.maybeSingle();

	if (existing && existing.id !== userId) {
		return {
			success: false,
			message: 'This phone number is already linked to a different account.'
		};
	}

	const { error } = await supabaseAdmin
		.from('profiles')
		.update({ messaging_phone: phone })
		.eq('id', userId);

	if (error) {
		return {
			success: false,
			message: 'Something went wrong linking your phone. Please try again.'
		};
	}

	return { success: true, profileId: userId, userId };
}

export function getVerificationPrompt(): string {
	return VERIFICATION_MESSAGE;
}

export function getMaxAttemptsMessage(): string {
	return 'Too many failed verification attempts. Please sign in to Threadline and add your phone number in your profile settings.';
}

export { MAX_ATTEMPTS };
