<script lang="ts">
	import { Dialog } from 'bits-ui';
	import { toast } from 'svelte-sonner';
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button/index.js';
	import type { ConnectInvite } from '$lib/server/connections.js';

	type Props = { invite: ConnectInvite; origin: string };
	let { invite, origin }: Props = $props();

	const inviteUrl = $derived(`${origin}/connect/${invite.code}`);

	let copied = $state(false);
	async function copyLink() {
		try {
			await navigator.clipboard.writeText(inviteUrl);
			copied = true;
			toast.success('Link copied');
			setTimeout(() => (copied = false), 1500);
		} catch {
			toast.error("Couldn't copy the link — try selecting it manually.");
		}
	}

	const fmtDate = new Intl.DateTimeFormat('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric'
	});
	const lastUsedLabel = $derived(
		invite.last_used_at ? fmtDate.format(new Date(invite.last_used_at)) : null
	);

	let confirmOpen = $state(false);
	let refreshing = $state(false);
</script>

<section aria-labelledby="invite-org-heading" class="space-y-4 rounded-lg border bg-card p-5">
	<div class="space-y-1">
		<h2 id="invite-org-heading" class="text-base font-semibold">Invite Organization</h2>
		<p class="text-sm text-muted-foreground">
			A shareable link for external organizations to connect with your brand.
		</p>
	</div>

	<div class="flex items-stretch gap-2 rounded-md border bg-background p-2">
		<input
			type="text"
			readonly
			value={inviteUrl}
			onclick={(e) => (e.currentTarget as HTMLInputElement).select()}
			aria-label="Invite link"
			class="min-w-0 flex-1 truncate bg-transparent font-mono text-sm focus:outline-none"
		/>
		<Button variant="outline" size="sm" onclick={copyLink}>
			{copied ? 'Copied' : 'Copy'}
		</Button>
	</div>

	{#if invite.use_count > 0}
		<p class="text-sm text-muted-foreground">
			Used {invite.use_count}
			{invite.use_count === 1 ? 'time' : 'times'}{lastUsedLabel
				? ` · Last used ${lastUsedLabel}`
				: ''}
		</p>
	{/if}

	<div class="flex flex-wrap items-center gap-2 pt-1">
		<Button variant="outline" size="sm" onclick={() => (confirmOpen = true)}>Refresh</Button>
	</div>
</section>

<Dialog.Root bind:open={confirmOpen}>
	<Dialog.Portal>
		<Dialog.Overlay
			class="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50"
		/>
		<Dialog.Content
			class="fixed top-[50%] left-[50%] z-50 w-full max-w-md translate-x-[-50%] translate-y-[-50%] rounded-lg border bg-background p-6 shadow-lg"
		>
			<Dialog.Title class="text-base font-semibold">Refresh invite link?</Dialog.Title>
			<Dialog.Description class="mt-2 text-sm text-muted-foreground">
				The current link will stop working immediately. Anyone you've already shared it with will
				need the new link.
			</Dialog.Description>
			<form
				method="POST"
				action="?/refreshInvite"
				use:enhance={() => {
					refreshing = true;
					return async ({ result, update }) => {
						refreshing = false;
						confirmOpen = false;
						await update();
						if (result.type === 'success') {
							toast.success('Invite link refreshed');
						} else if (result.type === 'failure') {
							const msg =
								(result.data as { message?: string } | undefined)?.message ??
								'Failed to refresh invite';
							toast.error(msg);
						} else if (result.type === 'error') {
							toast.error(result.error?.message ?? 'Failed to refresh invite');
						}
					};
				}}
				class="mt-5 flex justify-end gap-2"
			>
				<Button
					type="button"
					variant="outline"
					size="sm"
					onclick={() => (confirmOpen = false)}
					disabled={refreshing}
				>
					Cancel
				</Button>
				<Button type="submit" size="sm" disabled={refreshing}>
					{refreshing ? 'Refreshing…' : 'Refresh link'}
				</Button>
			</form>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
