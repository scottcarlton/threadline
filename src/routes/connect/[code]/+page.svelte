<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Button } from '$lib/components/ui/button/index.js';

	let { data } = $props();

	let submitting = $state(false);
	let error = $state<string | null>(null);
	let success = $state(false);
	let autoApproved = $state(false);

	async function submit() {
		submitting = true;
		error = null;
		const res = await fetch('/api/connections/request', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ code: data.code, repBrandId: null })
		});
		const json = (await res.json().catch(() => ({}))) as {
			error?: string;
			autoApproved?: boolean;
		};
		submitting = false;
		if (!res.ok) {
			error = json.error ?? 'Request failed';
			return;
		}
		autoApproved = Boolean(json.autoApproved);
		success = true;
		// Auto-redirect to connections after a brief success flash
		setTimeout(() => {
			goto(resolve('/brands'));
		}, 1500);
	}
</script>

<svelte:head><title>Connect — Threadline</title></svelte:head>

<div class="flex min-h-[calc(100vh-4rem)] items-center justify-center p-6">
	<div class="w-full max-w-xl rounded-lg border p-6">
		{#if data.status === 'not_found'}
			<h1 class="text-2xl font-semibold">Invite not found</h1>
			<p class="mt-2 text-sm text-muted-foreground">
				The link you followed doesn't match any active invite. Double-check with the brand you're
				trying to connect with.
			</p>
		{:else if data.status === 'expired'}
			<h1 class="text-2xl font-semibold">Invite expired</h1>
			<p class="mt-2 text-sm text-muted-foreground">
				{data.brand ? `${data.brand.name}'s invite has expired.` : 'This invite has expired.'} Ask the
				brand to generate a new one.
			</p>
		{:else if data.status === 'maxed'}
			<h1 class="text-2xl font-semibold">Invite at max uses</h1>
			<p class="mt-2 text-sm text-muted-foreground">
				This invite has already been claimed the maximum number of times. Ask the brand for a new
				link.
			</p>
		{:else if success}
			<div class="flex items-start gap-3">
				<div
					class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						class="h-5 w-5"
					>
						<path d="M20 6L9 17l-5-5" stroke-linecap="round" stroke-linejoin="round" />
					</svg>
				</div>
				<div>
					{#if autoApproved}
						<h1 class="text-2xl font-semibold">You're connected!</h1>
						<p class="mt-2 text-sm text-muted-foreground">
							Your connection with {data.brand?.name ?? 'the brand'} is now active. Orders you write against
							this brand will automatically be shared.
						</p>
					{:else}
						<h1 class="text-2xl font-semibold">Request sent</h1>
						<p class="mt-2 text-sm text-muted-foreground">
							{data.brand?.name ?? 'The brand'} will review and approve your connection. You'll be notified
							when it goes live.
						</p>
					{/if}
					<Button class="mt-4" onclick={() => goto(resolve('/brands'))}>Go to Connections</Button>
				</div>
			</div>
		{:else}
			{#if data.brand?.logo_url}
				<img
					src={data.brand.logo_url}
					alt={data.brand.name}
					class="mb-4 h-16 w-16 rounded-lg object-cover"
				/>
			{/if}
			<div class="mb-4 text-sm text-muted-foreground">You're being invited to connect with</div>
			<h1 class="text-2xl font-semibold">{data.brand?.name ?? 'a brand'}</h1>
			<p class="mt-2 text-sm text-muted-foreground">
				{#if data.autoApprove}
					Accept below and you'll be connected immediately. Their products and orders will sync with
					your portal.
				{:else}
					Accept below to send a connection request. Once approved, their products and orders will
					sync with your portal.
				{/if}
			</p>

			{#if !data.isLoggedIn}
				<div class="mt-6 rounded border p-4 text-sm">
					Sign in to accept this invite.
					<div class="mt-3">
						<Button href={`/login?redirect=/connect/${data.code}`}>Sign in</Button>
					</div>
				</div>
			{:else if !data.canConnect}
				<div class="mt-6 rounded border p-4 text-sm">
					{#if data.orgType === 'brand'}
						You're signed in as a brand org. Invite codes are for rep orgs to claim.
					{:else}
						Your account needs admin or owner permission to accept this invite.
					{/if}
				</div>
			{:else}
				<div class="mt-6 space-y-3">
					{#if error}
						<div
							class="rounded border border-red-500 bg-red-50 p-3 text-sm text-red-900 dark:bg-red-950/30 dark:text-red-200"
						>
							{error}
						</div>
					{/if}

					<Button disabled={submitting} onclick={submit}>
						{#if submitting}
							Connecting…
						{:else if data.autoApprove}
							Accept & Connect
						{:else}
							Accept
						{/if}
					</Button>
				</div>
			{/if}
		{/if}
	</div>
</div>
