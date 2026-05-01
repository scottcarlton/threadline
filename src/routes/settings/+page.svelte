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
			<p class="mt-1 text-[13px] text-muted-foreground">
				Connect your Gmail to send and receive emails from Threadline
			</p>

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

			<div class="mt-4">
				{#if data.emailConnected}
					<div class="flex items-center justify-between">
						<div class="flex items-center gap-3">
							<span class="flex h-2.5 w-2.5 rounded-full bg-emerald-500"></span>
							<div>
								<p class="text-sm font-medium">{data.emailAddress}</p>
								<p class="text-[13px] text-muted-foreground">Gmail connected</p>
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
					<Button href="/api/email/connect" class="w-full sm:w-auto">
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
								d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"
							/>
						</svg>
						Connect Gmail
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
		<p class="mt-1 text-[13px] text-muted-foreground">Choose the AI assistant's voice</p>

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
