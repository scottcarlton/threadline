<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Button } from '$lib/components/ui/button/index.js';

	let { data } = $props();

	let submitting = $state(false);
	let error = $state<string | null>(null);
	let success = $state(false);

	async function submit() {
		submitting = true;
		error = null;
		const res = await fetch('/api/connect/member/accept', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ token: data.token })
		});
		const json = (await res.json().catch(() => ({}))) as { error?: string };
		submitting = false;
		if (!res.ok) {
			error = json.error ?? 'Could not accept invite';
			return;
		}
		success = true;
		setTimeout(() => {
			goto(resolve('/brands'), { invalidateAll: true });
		}, 1500);
	}
</script>

<svelte:head><title>Connect — Threadline</title></svelte:head>

<div class="flex min-h-[calc(100vh-4rem)] items-center justify-center p-6">
	<div class="w-full max-w-xl rounded-lg border p-6">
		{#if data.status === 'not_found'}
			<h1 class="text-2xl font-semibold">Invite not found</h1>
			<p class="mt-2 text-sm text-muted-foreground">
				The link you followed doesn't match any active invite. Double-check with the brand that sent
				it.
			</p>
		{:else if data.status === 'expired'}
			<h1 class="text-2xl font-semibold">Invite expired</h1>
			<p class="mt-2 text-sm text-muted-foreground">
				{data.brand ? `${data.brand.name}'s invite has expired.` : 'This invite has expired.'} Ask the
				brand to send a new one.
			</p>
		{:else if data.status === 'accepted'}
			<h1 class="text-2xl font-semibold">Already accepted</h1>
			<p class="mt-2 text-sm text-muted-foreground">
				This invite has already been accepted. Head to your dashboard to see your connected brands.
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
					<h1 class="text-2xl font-semibold">You're all set</h1>
					<p class="mt-2 text-sm text-muted-foreground">
						{data.brand?.name ?? 'The brand'} has you covering
						{#if data.territories.length > 0}
							{data.territories.map((t) => t.name).join(', ')}
						{:else}
							their connection
						{/if}{data.invite?.manages_others ? ' as a manager' : ''}.
					</p>
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
			<div class="mb-4 text-sm text-muted-foreground">You're being invited by</div>
			<h1 class="text-2xl font-semibold">{data.brand?.name ?? 'a brand'}</h1>
			{#if data.repOrgName}
				<p class="mt-1 text-sm text-muted-foreground">on behalf of {data.repOrgName}</p>
			{/if}

			<dl class="mt-6 space-y-3 text-sm">
				{#if data.territories.length > 0}
					<div class="flex justify-between">
						<dt class="text-muted-foreground">Territories</dt>
						<dd class="text-right font-medium">
							{data.territories.map((t) => t.name).join(', ')}
						</dd>
					</div>
				{/if}
				<div class="flex justify-between">
					<dt class="text-muted-foreground">Manages others</dt>
					<dd class="font-medium">{data.invite?.manages_others ? 'Yes' : 'No'}</dd>
				</div>
			</dl>

			{#if !data.isLoggedIn}
				<div class="mt-6 rounded border p-4 text-sm">
					Sign in as <span class="font-mono">{data.invite?.target_email}</span> to accept.
					<div class="mt-3">
						<Button href={`/login?redirect=/connect/member/${data.token}`}>Sign in</Button>
					</div>
				</div>
			{:else if !data.viewerProfileMatchesInviteEmail}
				<div class="mt-6 rounded border p-4 text-sm">
					This invite was sent to
					<span class="font-mono">{data.invite?.target_email}</span>. Sign in with that account to
					accept.
				</div>
			{:else if !data.viewerIsMemberOfRepOrg}
				<div class="mt-6 rounded border p-4 text-sm">
					You need to be a member of {data.repOrgName ?? 'the rep organization'} before you can accept.
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
						{submitting ? 'Accepting…' : 'Accept'}
					</Button>
				</div>
			{/if}
		{/if}
	</div>
</div>
