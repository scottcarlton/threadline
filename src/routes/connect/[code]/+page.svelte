<script lang="ts">
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Label } from '$lib/components/ui/label/index.js';

	let { data } = $props();

	let selectedBrandId = $state('');
	let submitting = $state(false);
	let error = $state<string | null>(null);
	let success = $state(false);

	async function submit() {
		if (!selectedBrandId) {
			error = 'Pick which of your brands this connection applies to.';
			return;
		}
		submitting = true;
		error = null;
		const res = await fetch('/api/connections/request', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ code: data.code, repBrandId: selectedBrandId })
		});
		const json = await res.json().catch(() => ({}));
		submitting = false;
		if (!res.ok) {
			error = (json as { error?: string }).error ?? 'Request failed';
			return;
		}
		success = true;
	}
</script>

<svelte:head><title>Connect — Threadline</title></svelte:head>

<div class="mx-auto max-w-xl p-6">
	<div class="rounded-lg border p-6">
		{#if data.status === 'not_found'}
			<h1 class="text-2xl font-semibold">Invite not found</h1>
			<p class="mt-2 text-sm text-muted-foreground">
				The link you followed doesn't match any active invite. Double-check with the brand you're trying
				to connect with.
			</p>
		{:else if data.status === 'expired'}
			<h1 class="text-2xl font-semibold">Invite expired</h1>
			<p class="mt-2 text-sm text-muted-foreground">
				{data.brand
					? `${data.brand.name}'s invite has expired.`
					: 'This invite has expired.'} Ask the brand to generate a new one.
			</p>
		{:else if data.status === 'maxed'}
			<h1 class="text-2xl font-semibold">Invite at max uses</h1>
			<p class="mt-2 text-sm text-muted-foreground">
				This invite has already been claimed the maximum number of times. Ask the brand for a new link.
			</p>
		{:else if success}
			<div class="flex items-start gap-3">
				<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
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
					<h1 class="text-2xl font-semibold">Request sent</h1>
					<p class="mt-2 text-sm text-muted-foreground">
						{data.brand?.name ?? 'The brand'} will review and approve your connection. You'll be notified
						when it goes live.
					</p>
					<Button class="mt-4" onclick={() => goto('/settings/connections')}>Go to Connections</Button>
				</div>
			</div>
		{:else}
			<div class="mb-4 text-sm text-muted-foreground">You're being invited to connect with</div>
			<h1 class="text-2xl font-semibold">{data.brand?.name ?? 'a brand'}</h1>
			<p class="mt-2 text-sm text-muted-foreground">
				Once you confirm and the brand approves the request, their orders and accounts you place will
				automatically be shared with them.
			</p>

			{#if !data.isLoggedIn}
				<div class="mt-6 rounded border p-4 text-sm">
					Sign in as a rep-org admin to accept this invite.
					<div class="mt-3 flex gap-2">
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
					<Label for="rep-brand">Which of your brands does this connection cover?</Label>
					<select
						id="rep-brand"
						class="flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm"
						bind:value={selectedBrandId}
					>
						<option value="">— Pick a brand —</option>
						{#each data.repBrands as b (b.id)}
							<option value={b.id}>{b.name}</option>
						{/each}
					</select>
					<p class="text-sm text-muted-foreground">
						Orders you write against this brand will federate to {data.brand?.name ?? 'the brand'}.
					</p>

					{#if error}
						<div class="rounded border border-red-500 bg-red-50 p-3 text-sm text-red-900 dark:bg-red-950/30 dark:text-red-200">
							{error}
						</div>
					{/if}

					<Button disabled={submitting || !selectedBrandId} onclick={submit}>
						{submitting ? 'Requesting…' : 'Request Connection'}
					</Button>
				</div>
			{/if}
		{/if}
	</div>
</div>
