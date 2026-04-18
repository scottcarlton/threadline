<script lang="ts">
	import { Dialog } from 'bits-ui';
	import { toast } from 'svelte-sonner';
	import { enhance } from '$app/forms';
	import { superForm, type SuperValidated } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { inviteEmailSchema, type InviteEmailInput } from '$lib/schemas/invite-email.js';
	import type { ConnectInvite } from '$lib/server/connections.js';

	type Props = {
		invite: ConnectInvite;
		origin: string;
		emailForm: SuperValidated<InviteEmailInput>;
	};
	let { invite, origin, emailForm }: Props = $props();

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

	let emailOpen = $state(false);

	// svelte-ignore state_referenced_locally
	const {
		form: emailFormData,
		errors: emailErrors,
		enhance: emailEnhance,
		submitting: emailSubmitting,
		reset: resetEmail
	} = superForm(emailForm, {
		validators: zod4Client(inviteEmailSchema),
		validationMethod: 'onblur',
		onUpdated: ({ form }) => {
			const msg = form.message as { sent?: boolean; recipient?: string } | undefined;
			if (msg?.sent && msg.recipient) {
				toast.success(`Invite sent to ${msg.recipient}`);
				emailOpen = false;
				resetEmail();
			}
		},
		onError: ({ result }) => {
			toast.error(result.error?.message ?? 'Failed to send email');
		}
	});

	function closeEmail() {
		emailOpen = false;
		resetEmail();
	}
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
		<Button variant="outline" size="sm" onclick={() => (emailOpen = true)}>Send by email</Button>
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

<Dialog.Root bind:open={emailOpen}>
	<Dialog.Portal>
		<Dialog.Overlay
			class="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50"
		/>
		<Dialog.Content
			class="fixed top-[50%] left-[50%] z-50 w-full max-w-md translate-x-[-50%] translate-y-[-50%] rounded-lg border bg-background p-6 shadow-lg"
		>
			<Dialog.Title class="text-base font-semibold">Send invite by email</Dialog.Title>
			<Dialog.Description class="mt-2 text-sm text-muted-foreground">
				We'll email this invite link to the recipient on your behalf.
			</Dialog.Description>
			<form method="POST" action="?/sendInviteEmail" use:emailEnhance class="mt-5 space-y-4">
				<div class="space-y-1.5">
					<Label for="invite-email-recipient">Recipient email</Label>
					<Input
						id="invite-email-recipient"
						name="recipient_email"
						type="email"
						placeholder="name@example.com"
						bind:value={$emailFormData.recipient_email}
						aria-invalid={$emailErrors.recipient_email ? 'true' : undefined}
					/>
					{#if $emailErrors.recipient_email}
						<p class="text-sm text-destructive">{$emailErrors.recipient_email[0]}</p>
					{/if}
				</div>
				<div class="space-y-1.5">
					<Label for="invite-email-message"
						>Personal note <span class="text-muted-foreground">(optional)</span></Label
					>
					<textarea
						id="invite-email-message"
						name="message"
						rows="4"
						maxlength="500"
						placeholder="Add a short note — appears in the email body."
						bind:value={$emailFormData.message}
						class="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
						aria-invalid={$emailErrors.message ? 'true' : undefined}
					></textarea>
					{#if $emailErrors.message}
						<p class="text-sm text-destructive">{$emailErrors.message[0]}</p>
					{/if}
				</div>
				<div class="flex justify-end gap-2 pt-2">
					<Button
						type="button"
						variant="outline"
						size="sm"
						onclick={closeEmail}
						disabled={$emailSubmitting}
					>
						Cancel
					</Button>
					<Button type="submit" size="sm" disabled={$emailSubmitting}>
						{$emailSubmitting ? 'Sending…' : 'Send invite'}
					</Button>
				</div>
			</form>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
