<script lang="ts">
	import { page } from '$app/stores';
	import { invalidateAll } from '$app/navigation';
	import { supabase } from '$lib/supabase.js';
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import Switch from '$lib/components/ui/switch.svelte';
	import { toast } from 'svelte-sonner';
	import {
		preferences,
		type Appearance,
		type Animations,
		type ChatFont
	} from '$lib/stores/preferences.js';

	let { data } = $props();

	const np = $derived(data.notificationPreferences);
	let prefOrderUpdates = $state(true);
	let prefComments = $state(true);
	let prefBuyerActivity = $state(true);
	let prefTeamActivity = $state(true);
	// eslint-disable-next-line @typescript-eslint/no-unused-vars -- preference UI not yet wired
	let prefEmailDigest = $state(false);
	let prefsSaving = $state(false);
	let prefsSaved = $state(false);

	$effect(() => {
		if (np) {
			prefOrderUpdates = np.order_updates ?? true;
			prefComments = np.comments ?? true;
			prefBuyerActivity = np.buyer_activity ?? true;
			prefTeamActivity = np.team_activity ?? true;
			prefEmailDigest = np.email_digest ?? false;
		}
	});

	const appearanceOptions: { value: Appearance; label: string }[] = [
		{ value: 'light', label: 'Light' },
		{ value: 'auto', label: 'Auto' },
		{ value: 'dark', label: 'Dark' }
	];

	const animationsOptions: { value: Animations; label: string }[] = [
		{ value: 'enabled', label: 'Enabled' },
		{ value: 'auto', label: 'Auto' },
		{ value: 'disabled', label: 'Disabled' }
	];

	const chatFontOptions: { value: ChatFont; label: string }[] = [
		{ value: 'default', label: 'Default' },
		{ value: 'sans', label: 'Serif' },
		{ value: 'system', label: 'System' }
	];

	const voiceOptions = [
		{ id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah', description: 'Soft, warm' },
		{ id: 'FGY2WhTYpPnrIDTdsKH5', name: 'Laura', description: 'Calm, clear' },
		{ id: 'IKne3meq5aSn9XLyUdCD', name: 'Charlie', description: 'Casual, friendly' },
		{ id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George', description: 'Warm, steady' },
		{ id: '9BWtsMINqrJLrRacOk9x', name: 'Aria', description: 'Expressive' },
		{ id: 'SAz9YHcvj6GT2YYXdXww', name: 'River', description: 'Neutral, clear' }
	];

	let previewingVoice = $state<string | null>(null);
	let previewAudio = $state<HTMLAudioElement | null>(null);

	async function previewVoice(voice: { id: string; name: string }) {
		if (previewingVoice === voice.id) {
			previewAudio?.pause();
			previewAudio = null;
			previewingVoice = null;
			return;
		}

		previewingVoice = voice.id;
		try {
			const res = await fetch('/api/voice', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					text: `Hi, I'm ${voice.name}. How can I help you today?`,
					voiceId: voice.id
				})
			});
			if (!res.ok) {
				previewingVoice = null;
				return;
			}
			const blob = await res.blob();
			const url = URL.createObjectURL(blob);
			const audio = new Audio(url);
			previewAudio = audio;
			audio.onended = () => {
				previewingVoice = null;
				previewAudio = null;
				URL.revokeObjectURL(url);
			};
			audio.play();
		} catch {
			previewingVoice = null;
		}
	}

	const isBrandScoped = $derived(
		data.brandScope !== null &&
			(data.brandScope?.length ?? 0) > 0 &&
			(data.membership?.role === 'member' || data.membership?.role === 'guest')
	);

	let displayName = $state('');
	let avatarUrl = $state('');
	let saving = $state(false);
	let message = $state('');
	let disconnecting = $state(false);

	// Account email — managed by Supabase Auth, not by the profiles table.
	const isGoogleManaged = $derived((data.authProviders ?? []).includes('google'));
	const isSsoManaged = $derived((data.authProviders ?? []).includes('sso'));
	const emailReadOnly = $derived(isGoogleManaged || isSsoManaged);
	let accountEmail = $state('');
	$effect(() => {
		accountEmail = data.authEmail ?? '';
	});

	const emailJustConnected = $derived($page.url.searchParams.get('email_connected') === 'true');
	const calendarJustConnected = $derived(
		$page.url.searchParams.get('calendar_connected') === 'true'
	);
	const outlookJustConnected = $derived($page.url.searchParams.get('outlook_connected') === 'true');
	const msCalendarJustConnected = $derived(
		$page.url.searchParams.get('ms_calendar_connected') === 'true'
	);

	let disconnectingCalendar = $state(false);
	let disconnectingOutlook = $state(false);
	let disconnectingMsCalendar = $state(false);

	async function handleDisconnectCalendar() {
		disconnectingCalendar = true;
		try {
			const res = await fetch('/api/integrations/google-calendar/disconnect', { method: 'POST' });
			if (res.ok) await invalidateAll();
		} finally {
			disconnectingCalendar = false;
		}
	}

	async function handleDisconnectOutlook() {
		disconnectingOutlook = true;
		try {
			const res = await fetch('/api/email-outlook/disconnect', { method: 'POST' });
			if (res.ok) await invalidateAll();
		} finally {
			disconnectingOutlook = false;
		}
	}

	async function handleDisconnectMsCalendar() {
		disconnectingMsCalendar = true;
		try {
			const res = await fetch('/api/integrations/microsoft-calendar/disconnect', {
				method: 'POST'
			});
			if (res.ok) await invalidateAll();
		} finally {
			disconnectingMsCalendar = false;
		}
	}

	$effect(() => {
		displayName = data.user?.display_name ?? '';
		avatarUrl = data.user?.avatar_url ?? '';
	});

	async function handleSave() {
		if (!data.user) return;
		saving = true;
		message = '';

		const { error } = await supabase
			.from('profiles')
			.update({
				display_name: displayName,
				avatar_url: avatarUrl || null,
				updated_at: new Date().toISOString()
			})
			.eq('id', data.user.id);

		if (error) {
			message = 'Failed to save changes.';
			saving = false;
			return;
		}

		// Email is managed by Supabase Auth — only update if it actually changed
		// and the user isn't on Google/SSO.
		const trimmedEmail = accountEmail.trim();
		const emailChanged = !emailReadOnly && trimmedEmail && trimmedEmail !== data.authEmail;
		if (emailChanged) {
			const { error: emailErr } = await supabase.auth.updateUser({ email: trimmedEmail });
			if (emailErr) {
				message = '';
				toast.error(emailErr.message);
				saving = false;
				return;
			}
			toast.success('Confirmation sent — check both inboxes to finish updating your email.');
		}

		message = 'Profile updated.';
		invalidateAll();
		saving = false;
	}

	async function handleDisconnectEmail() {
		disconnecting = true;
		try {
			const res = await fetch('/api/email/disconnect', { method: 'POST' });
			if (res.ok) {
				invalidateAll();
			}
		} catch {
			// Silently handle
		} finally {
			disconnecting = false;
		}
	}
</script>

<div class="max-w-4xl space-y-10">
	<!-- Profile -->
	<div class="border-b pb-8">
		<h3 class="text-[14px] font-semibold">Profile</h3>
		<p class="mt-1 text-[13px] text-muted-foreground">Your personal information</p>

		<div class="mt-6 space-y-4">
			<div class="space-y-2">
				<Label for="display-name">Display name</Label>
				<Input id="display-name" bind:value={displayName} placeholder="Your name" />
			</div>
			<div class="space-y-2">
				<Label for="account-email">Email</Label>
				<Input
					id="account-email"
					type="email"
					autocomplete="email"
					bind:value={accountEmail}
					disabled={emailReadOnly}
					placeholder="you@company.com"
				/>
				{#if isGoogleManaged}
					<p class="text-[13px] text-muted-foreground">Managed by Google.</p>
				{:else if isSsoManaged}
					<p class="text-[13px] text-muted-foreground">Managed by your identity provider.</p>
				{:else if data.authPendingEmail}
					<p class="text-[13px] text-amber-600 dark:text-amber-500">
						Pending: <span class="font-medium">{data.authPendingEmail}</span> — confirm in both inboxes.
					</p>
				{/if}
			</div>
			<div class="space-y-2">
				<Label for="avatar-url">Avatar URL</Label>
				<Input
					id="avatar-url"
					bind:value={avatarUrl}
					placeholder="https://example.com/avatar.jpg"
				/>
			</div>
			{#if avatarUrl}
				<div>
					<p class="mb-2 text-[13px] font-medium text-muted-foreground">Preview</p>
					<img src={avatarUrl} alt="Avatar" class="h-14 w-14 rounded-full object-cover" />
				</div>
			{/if}
		</div>

		<div class="mt-6 flex items-center gap-3">
			<Button onclick={handleSave} loading={saving} class="w-full sm:w-auto">Save changes</Button>
			{#if message}
				<p class="text-[13px] text-muted-foreground">{message}</p>
			{/if}
		</div>
	</div>

	<!-- Connected Email -->
	{#if !isBrandScoped && !data.isBuyer}
		<div class="border-b pb-8">
			<h3 class="text-[14px] font-semibold">Connected Email</h3>
			<p class="mt-1 text-sm text-muted-foreground">Send and receive emails from Threadline</p>

			{#if emailJustConnected}
				<div
					class="mt-4 flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-4 w-4"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="2"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
						/>
					</svg>
					Gmail connected successfully!
				</div>
			{/if}

			{#if outlookJustConnected}
				<div
					class="mt-4 flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-4 w-4"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="2"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
						/>
					</svg>
					Outlook connected successfully!
				</div>
			{/if}

			<div class="mt-4 flex gap-4">
				<!-- Gmail -->
				{#if data.emailConnected}
					<div class="flex items-center justify-between">
						<div class="flex items-center gap-3">
							<span class="flex h-2.5 w-2.5 rounded-full bg-emerald-500"></span>
							<div>
								<p class="text-sm font-medium">{data.emailAddress}</p>
								<p class="text-sm text-muted-foreground">Gmail</p>
							</div>
						</div>
						<Button
							variant="outline"
							size="sm"
							onclick={handleDisconnectEmail}
							loading={disconnecting}
						>
							Disconnect
						</Button>
					</div>
				{:else}
					<Button
						href="/api/email/connect"
						variant="outline"
						class="w-full sm:w-auto sm:min-w-[200px]"
					>
						<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 -31.5 256 256">
							<path
								d="M58.182 192.05V93.14L27.507 65.077 0 49.504v125.091c0 9.658 7.825 17.455 17.455 17.455h40.727z"
								fill="#4285F4"
							/>
							<path
								d="M197.818 192.05h40.727c9.659 0 17.455-7.826 17.455-17.455V49.504l-31.156 17.838-27.026 25.798v98.91z"
								fill="#34A853"
							/>
							<polygon
								fill="#EA4335"
								points="58.182 93.14 54.008 54.493 58.182 17.504 128 69.868 197.818 17.504 202.487 52.496 197.818 93.14 128 145.504"
							/>
							<path
								d="M197.818 17.504V93.14L256 49.504V26.231C256 4.646 231.36-7.66 214.109 5.286l-16.291 12.218z"
								fill="#FBBC04"
							/>
							<path
								d="M0 49.504l26.759 20.07L58.182 93.14V17.504L41.891 5.286C24.611-7.66 0 4.646 0 26.231v23.273z"
								fill="#C5221F"
							/>
						</svg>
						Gmail
					</Button>
				{/if}

				<!-- Outlook -->
				{#if data.outlookConnected}
					<div class="flex items-center justify-between">
						<div class="flex items-center gap-3">
							<span class="flex h-2.5 w-2.5 rounded-full bg-emerald-500"></span>
							<div>
								<p class="text-sm font-medium">{data.outlookEmail}</p>
								<p class="text-sm text-muted-foreground">Outlook</p>
							</div>
						</div>
						<Button
							variant="outline"
							size="sm"
							onclick={handleDisconnectOutlook}
							loading={disconnectingOutlook}
						>
							Disconnect
						</Button>
					</div>
				{:else}
					<Button
						href="/api/email-outlook/connect"
						variant="outline"
						class="w-full sm:w-auto sm:min-w-[200px]"
					>
						<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 48 48" fill="none">
							<defs>
								<linearGradient
									id="outlook-g1"
									x1="9.99"
									y1="22.36"
									x2="30.93"
									y2="9.37"
									gradientUnits="userSpaceOnUse"
									><stop stop-color="#20A7FA" /><stop offset=".4" stop-color="#3BD5FF" /><stop
										offset="1"
										stop-color="#C4B0FF"
									/></linearGradient
								>
								<linearGradient
									id="outlook-g2"
									x1="17.2"
									y1="26.79"
									x2="28.86"
									y2="8.13"
									gradientUnits="userSpaceOnUse"
									><stop stop-color="#165AD9" /><stop offset=".5" stop-color="#1880E5" /><stop
										offset="1"
										stop-color="#8587FF"
									/></linearGradient
								>
								<linearGradient
									id="outlook-g3"
									x1="24.05"
									y1="31.11"
									x2="44.51"
									y2="18.02"
									gradientUnits="userSpaceOnUse"
									><stop stop-color="#1A43A6" /><stop offset=".49" stop-color="#2052CB" /><stop
										offset="1"
										stop-color="#5F20CB"
									/></linearGradient
								>
								<linearGradient
									id="outlook-g4"
									x1="42"
									y1="29.94"
									x2="23.85"
									y2="29.94"
									gradientUnits="userSpaceOnUse"
									><stop stop-color="#4DC4FF" /><stop
										offset=".2"
										stop-color="#0FAFFF"
									/></linearGradient
								>
								<radialGradient
									id="outlook-r1"
									cx="0"
									cy="0"
									r="1"
									gradientTransform="translate(18.57 27.53) rotate(123.3) scale(20.73 53.79)"
									><stop stop-color="#49DEFF" /><stop
										offset=".72"
										stop-color="#29C3FF"
									/></radialGradient
								>
								<radialGradient
									id="outlook-r2"
									cx="0"
									cy="0"
									r="1"
									gradientTransform="translate(3.94 23.62) rotate(46.9) scale(21.06)"
									><stop offset=".04" stop-color="#0091FF" /><stop
										offset=".92"
										stop-color="#183DAD"
									/></radialGradient
								>
							</defs>
							<path
								d="M30.93 9.34L7.98 23.89 6 20.78v-2.68c0-.98.5-1.89 1.32-2.42L20.66 7.02c2.03-1.32 4.65-1.32 6.69 0l4.58 2.32z"
								fill="url(#outlook-g1)"
							/>
							<path
								d="M27.14 6.89l.21.13 10.41 6.76-25.82 16.37-3.96-6.25L26.93 11.85c1.8-1.14 1.87-3.7.21-4.96z"
								fill="url(#outlook-g2)"
							/>
							<path
								d="M22.24 33.27l-10.3-3.13 21.9-13.88c1.85-1.17 1.84-3.86.01-5.03l-.1-.06.28.18 6.67 4.32c.82.53 1.32 1.44 1.32 2.42v2.6L22.24 33.27z"
								fill="url(#outlook-g3)"
							/>
							<path
								d="M27.35 7.02c-2.03-1.32-4.65-1.32-6.69 0L7.32 15.68A2.68 2.68 0 0 0 6 18.1v.13c.03.98.55 1.88 1.38 2.41l16.6 10.46 16.63-10.45a2.68 2.68 0 0 0 1.39-2.55v2.55l-.01-2.6c0-.98-.5-1.89-1.31-2.42L27.35 7.02z"
								fill="url(#outlook-r1)"
								opacity=".6"
							/>
							<path
								d="M21.05 42h14.7c3.45 0 6.25-2.8 6.25-6.25V18.14a2.68 2.68 0 0 1-1.39 2.51L18.75 34.38a3.58 3.58 0 0 0-1.9 3.43c0 2.32 1.88 4.2 4.2 4.2z"
								fill="url(#outlook-g4)"
							/>
							<path
								d="M27.03 42H12.25A6.25 6.25 0 0 1 6 35.75V18.13c0 1.02.52 1.97 1.38 2.51l21.84 15.77a3.58 3.58 0 0 1 1.92 3.48c0 2.27-1.84 4.11-4.11 4.11z"
								fill="url(#outlook-r1)"
							/>
							<path
								d="M16.75 23h-9.5A3.25 3.25 0 0 0 4 26.25v9.5A3.25 3.25 0 0 0 7.25 39h9.5A3.25 3.25 0 0 0 20 35.75v-9.5A3.25 3.25 0 0 0 16.75 23z"
								fill="url(#outlook-r2)"
							/>
							<path
								d="M11.96 35.6c-1.32 0-2.41-.41-3.26-1.24-.85-.83-1.27-1.91-1.27-3.24 0-1.41.43-2.55 1.29-3.41.86-.87 1.99-1.3 3.39-1.3 1.32 0 2.39.42 3.22 1.25.83.83 1.25 1.93 1.25 3.29 0 1.4-.43 2.53-1.3 3.38-.86.86-1.97 1.28-3.32 1.28zm.04-1.76c.72 0 1.3-.25 1.74-.74.44-.49.66-1.18.66-2.06 0-.91-.21-1.63-.64-2.14-.43-.5-1-.76-1.71-.76-.73 0-1.32.26-1.77.79-.45.52-.67 1.21-.67 2.07 0 .87.22 1.56.67 2.07.45.5 1.02.76 1.72.76z"
								fill="white"
							/>
						</svg>
						Outlook
					</Button>
				{/if}
			</div>
		</div>
	{/if}

	<!-- Connected Calendar -->
	{#if !isBrandScoped && !data.isBuyer}
		<div class="border-b pb-8">
			<h3 class="text-[14px] font-semibold">Connected Calendar</h3>
			<p class="mt-1 text-sm text-muted-foreground">Auto-sync appointments and market dates</p>

			{#if calendarJustConnected}
				<div
					class="mt-4 flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-4 w-4"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="2"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
						/>
					</svg>
					Google Calendar connected successfully!
				</div>
			{/if}

			{#if msCalendarJustConnected}
				<div
					class="mt-4 flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-4 w-4"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="2"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
						/>
					</svg>
					Microsoft Calendar connected successfully!
				</div>
			{/if}

			<div class="mt-4 flex gap-4">
				<!-- Google Calendar -->
				{#if data.calendarConnected}
					<div class="flex items-center justify-between">
						<div class="flex items-center gap-3">
							<span class="flex h-2.5 w-2.5 rounded-full bg-emerald-500"></span>
							<div>
								<p class="text-sm font-medium">{data.calendarEmail}</p>
								<p class="text-sm text-muted-foreground">Google Calendar</p>
							</div>
						</div>
						<Button
							variant="outline"
							size="sm"
							onclick={handleDisconnectCalendar}
							loading={disconnectingCalendar}
						>
							Disconnect
						</Button>
					</div>
				{:else}
					<Button
						href="/api/integrations/google-calendar/connect"
						variant="outline"
						class="w-full sm:w-auto sm:min-w-[200px]"
					>
						<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 256 256">
							<polygon
								fill="#FFFFFF"
								points="195.368 60.632 60.632 60.632 60.632 195.368 195.368 195.368"
							/>
							<polygon
								fill="#EA4335"
								points="195.368 256 256 195.368 225.684 190.196 195.368 195.368 189.835 223.098"
							/>
							<path
								d="M0 195.368v40.421C0 246.956 9.044 256 20.211 256h40.421l6.225-30.316-6.225-30.316H27.599L0 195.368z"
								fill="#188038"
							/>
							<path
								d="M256 60.632V20.211C256 9.044 246.956 0 235.789 0h-40.421c-3.689 15.036-5.533 26.101-5.533 33.196 0 7.094 1.844 16.24 5.533 27.436 13.41 3.84 23.515 5.76 30.316 5.76 6.801 0 16.906-1.92 30.316-5.76z"
								fill="#1967D2"
							/>
							<polygon
								fill="#FBBC04"
								points="256 60.632 195.368 60.632 195.368 195.368 256 195.368"
							/>
							<polygon
								fill="#34A853"
								points="195.368 195.368 60.632 195.368 60.632 256 195.368 256"
							/>
							<path
								d="M195.368 0H20.211C9.044 0 0 9.044 0 20.211v175.158h60.632V60.632h134.737V0z"
								fill="#4285F4"
							/>
							<path
								d="M88.27 165.154c-5.036-3.402-8.522-8.37-10.425-14.939l11.688-4.817c1.061 4.042 2.914 7.175 5.558 9.398 2.627 2.223 5.827 3.318 9.566 3.318 3.824 0 7.108-1.162 9.853-3.487 2.745-2.324 4.126-5.288 4.126-8.876 0-3.671-1.448-6.669-4.345-8.993-2.897-2.324-6.535-3.487-10.88-3.487h-6.754v-11.57h6.063c3.739 0 6.888-1.011 9.448-3.032 2.56-2.021 3.84-4.783 3.84-8.303 0-3.133-1.145-5.625-3.436-7.495-2.29-1.87-5.187-2.813-8.707-2.813-3.436 0-6.164.91-8.186 2.746a12.123 12.123 0 0 0-4.412 6.753l-11.57-4.816c1.532-4.345 4.345-8.186 8.471-11.504 4.126-3.318 9.398-4.985 15.798-4.985 4.733 0 8.994.91 12.766 2.745 3.773 1.836 6.737 4.379 8.876 7.613 2.139 3.25 3.2 6.888 3.2 10.93 0 4.127-.994 7.613-2.981 10.476-1.987 2.863-4.429 5.053-7.326 6.585v.69c3.74 1.543 6.99 4.076 9.398 7.327 2.442 3.284 3.671 7.208 3.671 11.789 0 4.581-1.162 8.674-3.486 12.261-2.324 3.587-5.541 6.417-9.617 8.471-4.092 2.055-8.69 3.099-13.793 3.099-5.912.017-11.369-1.684-16.405-5.086zm71.798-58.004L147.234 116.43l-6.417-9.735 23.024-16.606h9.46V168.42h-12.598l-.635-61.27z"
								fill="#4285F4"
							/>
						</svg>
						Google Calendar
					</Button>
				{/if}

				<!-- Microsoft Calendar -->
				{#if data.msCalendarConnected}
					<div class="flex items-center justify-between">
						<div class="flex items-center gap-3">
							<span class="flex h-2.5 w-2.5 rounded-full bg-emerald-500"></span>
							<div>
								<p class="text-sm font-medium">{data.msCalendarEmail}</p>
								<p class="text-sm text-muted-foreground">Microsoft Calendar</p>
							</div>
						</div>
						<Button
							variant="outline"
							size="sm"
							onclick={handleDisconnectMsCalendar}
							loading={disconnectingMsCalendar}
						>
							Disconnect
						</Button>
					</div>
				{:else}
					<Button
						href="/api/integrations/microsoft-calendar/connect"
						variant="outline"
						class="w-full sm:w-auto sm:min-w-[200px]"
					>
						<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 48 48" fill="none">
							<defs>
								<linearGradient
									id="mscal-g1"
									x1="9.99"
									y1="22.36"
									x2="30.93"
									y2="9.37"
									gradientUnits="userSpaceOnUse"
									><stop stop-color="#20A7FA" /><stop offset=".4" stop-color="#3BD5FF" /><stop
										offset="1"
										stop-color="#C4B0FF"
									/></linearGradient
								>
								<linearGradient
									id="mscal-g2"
									x1="17.2"
									y1="26.79"
									x2="28.86"
									y2="8.13"
									gradientUnits="userSpaceOnUse"
									><stop stop-color="#165AD9" /><stop offset=".5" stop-color="#1880E5" /><stop
										offset="1"
										stop-color="#8587FF"
									/></linearGradient
								>
								<linearGradient
									id="mscal-g3"
									x1="24.05"
									y1="31.11"
									x2="44.51"
									y2="18.02"
									gradientUnits="userSpaceOnUse"
									><stop stop-color="#1A43A6" /><stop offset=".49" stop-color="#2052CB" /><stop
										offset="1"
										stop-color="#5F20CB"
									/></linearGradient
								>
								<linearGradient
									id="mscal-g4"
									x1="42"
									y1="29.94"
									x2="23.85"
									y2="29.94"
									gradientUnits="userSpaceOnUse"
									><stop stop-color="#4DC4FF" /><stop
										offset=".2"
										stop-color="#0FAFFF"
									/></linearGradient
								>
								<radialGradient
									id="mscal-r1"
									cx="0"
									cy="0"
									r="1"
									gradientTransform="translate(18.57 27.53) rotate(123.3) scale(20.73 53.79)"
									><stop stop-color="#49DEFF" /><stop
										offset=".72"
										stop-color="#29C3FF"
									/></radialGradient
								>
								<radialGradient
									id="mscal-r2"
									cx="0"
									cy="0"
									r="1"
									gradientTransform="translate(3.94 23.62) rotate(46.9) scale(21.06)"
									><stop offset=".04" stop-color="#0091FF" /><stop
										offset=".92"
										stop-color="#183DAD"
									/></radialGradient
								>
							</defs>
							<path
								d="M30.93 9.34L7.98 23.89 6 20.78v-2.68c0-.98.5-1.89 1.32-2.42L20.66 7.02c2.03-1.32 4.65-1.32 6.69 0l4.58 2.32z"
								fill="url(#mscal-g1)"
							/>
							<path
								d="M27.14 6.89l.21.13 10.41 6.76-25.82 16.37-3.96-6.25L26.93 11.85c1.8-1.14 1.87-3.7.21-4.96z"
								fill="url(#mscal-g2)"
							/>
							<path
								d="M22.24 33.27l-10.3-3.13 21.9-13.88c1.85-1.17 1.84-3.86.01-5.03l-.1-.06.28.18 6.67 4.32c.82.53 1.32 1.44 1.32 2.42v2.6L22.24 33.27z"
								fill="url(#mscal-g3)"
							/>
							<path
								d="M27.35 7.02c-2.03-1.32-4.65-1.32-6.69 0L7.32 15.68A2.68 2.68 0 0 0 6 18.1v.13c.03.98.55 1.88 1.38 2.41l16.6 10.46 16.63-10.45a2.68 2.68 0 0 0 1.39-2.55v2.55l-.01-2.6c0-.98-.5-1.89-1.31-2.42L27.35 7.02z"
								fill="url(#mscal-r1)"
								opacity=".6"
							/>
							<path
								d="M21.05 42h14.7c3.45 0 6.25-2.8 6.25-6.25V18.14a2.68 2.68 0 0 1-1.39 2.51L18.75 34.38a3.58 3.58 0 0 0-1.9 3.43c0 2.32 1.88 4.2 4.2 4.2z"
								fill="url(#mscal-g4)"
							/>
							<path
								d="M27.03 42H12.25A6.25 6.25 0 0 1 6 35.75V18.13c0 1.02.52 1.97 1.38 2.51l21.84 15.77a3.58 3.58 0 0 1 1.92 3.48c0 2.27-1.84 4.11-4.11 4.11z"
								fill="url(#mscal-r1)"
							/>
							<path
								d="M16.75 23h-9.5A3.25 3.25 0 0 0 4 26.25v9.5A3.25 3.25 0 0 0 7.25 39h9.5A3.25 3.25 0 0 0 20 35.75v-9.5A3.25 3.25 0 0 0 16.75 23z"
								fill="url(#mscal-r2)"
							/>
							<path
								d="M11.96 35.6c-1.32 0-2.41-.41-3.26-1.24-.85-.83-1.27-1.91-1.27-3.24 0-1.41.43-2.55 1.29-3.41.86-.87 1.99-1.3 3.39-1.3 1.32 0 2.39.42 3.22 1.25.83.83 1.25 1.93 1.25 3.29 0 1.4-.43 2.53-1.3 3.38-.86.86-1.97 1.28-3.32 1.28zm.04-1.76c.72 0 1.3-.25 1.74-.74.44-.49.66-1.18.66-2.06 0-.91-.21-1.63-.64-2.14-.43-.5-1-.76-1.71-.76-.73 0-1.32.26-1.77.79-.45.52-.67 1.21-.67 2.07 0 .87.22 1.56.67 2.07.45.5 1.02.76 1.72.76z"
								fill="white"
							/>
						</svg>
						Microsoft Calendar
					</Button>
				{/if}
			</div>
		</div>
	{/if}

	<!-- Notifications -->
	<div class="border-b pb-8">
		<h3 class="text-sm font-semibold">Notifications</h3>
		<p class="mt-1 text-sm text-muted-foreground">Choose which email notifications you receive</p>

		<form
			method="POST"
			action="?/updateNotificationPreferences"
			use:enhance={() => {
				prefsSaving = true;
				prefsSaved = false;
				return async ({ update }) => {
					prefsSaving = false;
					prefsSaved = true;
					setTimeout(() => (prefsSaved = false), 2000);
					await update({ reset: false });
				};
			}}
			class="mt-6 space-y-5"
		>
			<label class="flex items-center justify-between">
				<div>
					<p class="text-sm font-medium">Order Updates</p>
					<p class="text-sm text-muted-foreground">Order submitted, confirmed, and shipped</p>
				</div>
				<input type="hidden" name="order_updates" value="off" />
				<Switch
					bind:checked={prefOrderUpdates}
					name="order_updates"
					value="on"
					aria-label="Order updates"
				/>
			</label>

			<label class="flex items-center justify-between">
				<div>
					<p class="text-sm font-medium">Comments</p>
					<p class="text-sm text-muted-foreground">New comments on orders and accounts</p>
				</div>
				<input type="hidden" name="comments" value="off" />
				<Switch bind:checked={prefComments} name="comments" value="on" aria-label="Comments" />
			</label>

			<label class="flex items-center justify-between">
				<div>
					<p class="text-sm font-medium">Buyer Activity</p>
					<p class="text-sm text-muted-foreground">Buyer portal orders and account changes</p>
				</div>
				<input type="hidden" name="buyer_activity" value="off" />
				<Switch
					bind:checked={prefBuyerActivity}
					name="buyer_activity"
					value="on"
					aria-label="Buyer activity"
				/>
			</label>

			<label class="flex items-center justify-between">
				<div>
					<p class="text-sm font-medium">Team Activity</p>
					<p class="text-sm text-muted-foreground">New members, connection requests, expenses</p>
				</div>
				<input type="hidden" name="team_activity" value="off" />
				<Switch
					bind:checked={prefTeamActivity}
					name="team_activity"
					value="on"
					aria-label="Team activity"
				/>
			</label>

			<label class="flex items-center justify-between opacity-50">
				<div>
					<p class="text-sm font-medium">Daily Digest</p>
					<p class="text-sm text-muted-foreground">Summary email — coming soon</p>
				</div>
				<Switch checked={false} disabled aria-label="Daily digest" />
			</label>

			<div class="flex items-center gap-3 pt-2">
				<Button type="submit" loading={prefsSaving} class="w-full sm:w-auto"
					>Save Preferences</Button
				>
				{#if prefsSaved}
					<span class="text-sm text-emerald-600">Saved</span>
				{/if}
			</div>
		</form>
	</div>

	<!-- Appearance -->
	<div class="border-b pb-8">
		<h3 class="text-[14px] font-semibold">Appearance</h3>
		<p class="mt-1 text-[13px] text-muted-foreground">Customize the look and feel</p>

		<div class="mt-6 space-y-6">
			<!-- Color Mode -->
			<div>
				<p class="text-sm font-medium">Color mode</p>
				<p class="text-[13px] text-muted-foreground">Choose your preferred theme</p>
				<div class="mt-3 flex w-full rounded-lg border p-1 sm:inline-flex sm:w-auto">
					{#each appearanceOptions as opt (opt.value)}
						<button
							class="flex-1 rounded-md px-4 py-1.5 text-sm font-medium transition-colors sm:flex-initial {$preferences.appearance ===
							opt.value
								? 'bg-primary text-primary-foreground'
								: 'text-muted-foreground hover:text-foreground'}"
							onclick={() => preferences.setAppearance(opt.value)}
						>
							{opt.label}
						</button>
					{/each}
				</div>
			</div>

			<!-- Chat font -->
			<div>
				<p class="text-sm font-medium">Chat font</p>
				<div class="mt-3 grid max-w-md grid-cols-3 gap-3">
					{#each chatFontOptions as opt (opt.value)}
						{@const fontStyle =
							opt.value === 'sans'
								? 'font-family: Georgia, serif'
								: opt.value === 'system'
									? 'font-family: system-ui, sans-serif'
									: ''}
						<button
							class="group flex flex-col items-center gap-2"
							onclick={() => preferences.setChatFont(opt.value)}
						>
							<div
								class="flex h-20 w-full items-center justify-center rounded-xl border-2 transition-colors {$preferences.chatFont ===
								opt.value
									? 'bg-muted/50'
									: 'border-muted bg-muted/30 hover:border-muted-foreground/30'}"
								style="border-color: {$preferences.chatFont === opt.value
									? 'hsl(var(--foreground))'
									: ''}"
							>
								<span class="text-2xl text-foreground" style={fontStyle}>Aa</span>
							</div>
							<span class="text-sm text-muted-foreground">{opt.label}</span>
						</button>
					{/each}
				</div>
			</div>

			<!-- Animations -->
			<div>
				<p class="text-sm font-medium">Animations</p>
				<div class="mt-3 grid max-w-md grid-cols-3 gap-3">
					{#each animationsOptions as opt (opt.value)}
						<button
							class="group flex flex-col items-center gap-2"
							onclick={() => preferences.setAnimations(opt.value)}
						>
							<div
								class="flex h-20 w-full items-center justify-center rounded-xl border-2 transition-colors {$preferences.animations ===
								opt.value
									? 'bg-muted/50'
									: 'border-muted bg-muted/30 hover:border-muted-foreground/30'}"
								style="border-color: {$preferences.animations === opt.value
									? 'hsl(var(--foreground))'
									: ''}"
							>
								<div class="flex items-center gap-1.5">
									{#if opt.value === 'enabled'}
										<span
											class="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/50"
											style="animation-duration: 0.8s"
										></span>
										<span
											class="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/50"
											style="animation-duration: 0.8s; animation-delay: 0.15s"
										></span>
										<span
											class="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/50"
											style="animation-duration: 0.8s; animation-delay: 0.3s"
										></span>
									{:else if opt.value === 'auto'}
										<span class="h-2 w-2 rounded-full bg-muted-foreground/50"></span>
										<span class="h-5 w-px bg-muted-foreground/30"></span>
										<span class="h-2 w-2 rounded-full bg-muted-foreground/50"></span>
									{:else}
										<span class="h-2 w-2 rounded-full bg-muted-foreground/30"></span>
										<span class="h-2 w-2 rounded-full bg-muted-foreground/30"></span>
										<span class="h-2 w-2 rounded-full bg-muted-foreground/30"></span>
									{/if}
								</div>
							</div>
							<span class="text-sm text-muted-foreground">{opt.label}</span>
						</button>
					{/each}
				</div>
			</div>

			<!-- Auto-hide dock -->
			<div class="flex items-center justify-between">
				<div>
					<p class="text-sm font-medium">Auto-hide dock</p>
					<p class="text-[13px] text-muted-foreground">
						Hide the AI dock until you hover near the bottom
					</p>
				</div>
				<button
					class="relative h-6 w-11 rounded-full transition-colors {$preferences.autoHideDock
						? 'bg-primary'
						: 'bg-input'}"
					onclick={() => preferences.setAutoHideDock(!$preferences.autoHideDock)}
					role="switch"
					aria-checked={$preferences.autoHideDock}
					aria-label="Auto-hide dock"
				>
					<span
						class="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform {$preferences.autoHideDock
							? 'translate-x-5 dark:bg-zinc-900'
							: 'translate-x-0'}"
					></span>
				</button>
			</div>
		</div>
	</div>

	<!-- Voice settings -->
	<div class="pb-8">
		<h3 class="text-[14px] font-semibold">Voice</h3>
		<p class="mt-1 text-[13px] text-muted-foreground">Choose Stitch's voice</p>

		<div class="mt-4 grid max-w-md grid-cols-2 gap-3 sm:grid-cols-3">
			{#each voiceOptions as voice (voice.id)}
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="group flex cursor-pointer flex-col items-center gap-2"
					onclick={() => {
						preferences.setVoiceId(voice.id);
						previewVoice(voice);
					}}
				>
					<div
						class="flex h-20 w-full flex-col items-center justify-center rounded-xl border-2 transition-colors {$preferences.voiceId ===
						voice.id
							? 'bg-muted/50'
							: 'border-muted bg-muted/30 hover:border-muted-foreground/30'}"
						style="border-color: {$preferences.voiceId === voice.id
							? 'hsl(var(--foreground))'
							: ''}"
					>
						<span class="text-sm font-medium text-foreground">{voice.name}</span>
					</div>
				</div>
			{/each}
		</div>
	</div>
</div>
