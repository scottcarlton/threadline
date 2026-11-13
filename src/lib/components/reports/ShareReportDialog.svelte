<script lang="ts">
	/**
	 * Share a report by public link (SCO-151). Admin and owner only; the page
	 * renders this only when the server says the viewer may share.
	 *
	 * Creating a link freezes the report as the viewer sees it now. The token
	 * comes back once, in the action result, and is never stored, so the link
	 * can only be copied here at creation time.
	 */
	import { tick } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { superForm, type SuperValidated } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { SelectField } from '$lib/components/ui/select/index.js';
	import {
		REPORT_SHARE_TTLS,
		REPORT_SHARE_TTL_LABELS,
		reportShareCreateSchema,
		reportShareRevokeSchema
	} from '$lib/schemas/report-share.js';
	import type { z } from 'zod';

	type ShareLink = {
		id: string;
		createdAt: string;
		expiresAt: string;
		createdByName: string | null;
	};

	type Props = {
		open: boolean;
		shareForm: SuperValidated<z.infer<typeof reportShareCreateSchema>>;
		revokeForm: SuperValidated<z.infer<typeof reportShareRevokeSchema>>;
		links: ShareLink[];
		/** The page's filter, carried into the snapshot. */
		year?: number;
		days?: number;
	};

	let { open = $bindable(false), shareForm, revokeForm, links, year, days }: Props = $props();

	const ttlItems = REPORT_SHARE_TTLS.map((value) => ({
		value,
		label: REPORT_SHARE_TTL_LABELS[value]
	}));

	let createdUrl = $state<string | null>(null);
	let createdExpiresAt = $state<string | null>(null);

	function failureMessage(data: unknown): string | undefined {
		return (data as { form?: { message?: string } } | undefined)?.form?.message;
	}

	// svelte-ignore state_referenced_locally
	const shareInitial = shareForm;
	const {
		form: share,
		enhance: shareEnhance,
		submitting: shareSubmitting
	} = superForm(shareInitial, {
		id: 'report-share',
		validators: zod4Client(reportShareCreateSchema),
		dataType: 'json',
		resetForm: false,
		onSubmit: () => {
			$share.year = year;
			$share.days = days;
		},
		onUpdated: ({ form }) => {
			const msg = form.message as { type?: string; url?: string; expiresAt?: string } | undefined;
			if (msg?.type === 'success' && msg.url) {
				createdUrl = msg.url;
				createdExpiresAt = msg.expiresAt ?? null;
			}
		},
		onResult: ({ result }) => {
			if (result.type === 'failure') {
				toast.error(failureMessage(result.data) ?? 'Could not create the link.');
			} else if (result.type === 'error') {
				toast.error(result.error?.message ?? 'Could not create the link.');
			}
		}
	});

	// svelte-ignore state_referenced_locally
	const revokeInitial = revokeForm;
	const { form: revoke, enhance: revokeEnhance } = superForm(revokeInitial, {
		id: 'report-share-revoke',
		validators: zod4Client(reportShareRevokeSchema),
		onResult: ({ result }) => {
			if (result.type === 'success') toast.success('Link revoked');
			else if (result.type === 'failure') {
				toast.error(failureMessage(result.data) ?? 'Could not revoke the link.');
			} else if (result.type === 'error') {
				toast.error(result.error?.message ?? 'Could not revoke the link.');
			}
		}
	});

	let revokeFormEl = $state<HTMLFormElement | null>(null);

	async function revokeLink(id: string) {
		$revoke.id = id;
		// Let the hidden input pick up the id before the form reads it.
		await tick();
		revokeFormEl?.requestSubmit();
	}

	async function copyLink() {
		if (!createdUrl) return;
		try {
			await navigator.clipboard.writeText(createdUrl);
			toast.success('Link copied');
		} catch {
			toast.error('Could not copy. Select the link and copy it instead.');
		}
	}

	function formatDate(iso: string): string {
		return new Date(iso).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

	function handleOpenChange(isOpen: boolean) {
		open = isOpen;
		// A fresh dialog starts from the form, not from the last link.
		if (!isOpen) {
			createdUrl = null;
			createdExpiresAt = null;
		}
	}
</script>

<Dialog.Root bind:open onOpenChange={handleOpenChange}>
	<Dialog.DialogContent class="max-w-lg p-6">
		<Dialog.DialogTitle class="text-lg font-semibold">Share report</Dialog.DialogTitle>
		<Dialog.DialogDescription class="mt-1 text-sm text-muted-foreground">
			Anyone with the link can view this report without signing in. The figures stay as they are
			today.
		</Dialog.DialogDescription>

		{#if createdUrl}
			<div class="mt-6 space-y-2">
				<p class="text-sm font-medium">Link</p>
				<div class="flex items-center gap-2">
					<Input value={createdUrl} readonly class="flex-1 font-mono" aria-label="Share link" />
					<Button variant="outline" onclick={copyLink}>Copy</Button>
				</div>
				{#if createdExpiresAt}
					<p class="text-sm text-muted-foreground">Expires {formatDate(createdExpiresAt)}.</p>
				{/if}
			</div>
		{:else}
			<form method="POST" action="?/share" use:shareEnhance class="mt-6 space-y-4">
				<div class="space-y-2">
					<p class="text-sm font-medium">Link expires after</p>
					<SelectField items={ttlItems} bind:value={$share.ttl} />
				</div>
				<Button type="submit" loading={$shareSubmitting} disabled={$shareSubmitting}
					>Create link</Button
				>
			</form>
		{/if}

		<div class="mt-8">
			<p class="text-sm font-medium">Active links</p>
			{#if links.length === 0}
				<p class="mt-2 text-sm text-muted-foreground">No active links.</p>
			{:else}
				<ul class="mt-2 divide-y rounded-none border">
					{#each links as link (link.id)}
						<li class="flex items-center justify-between gap-3 px-3 py-2.5">
							<div class="min-w-0">
								<p class="truncate text-sm">
									Created {formatDate(link.createdAt)}{link.createdByName
										? ` by ${link.createdByName}`
										: ''}
								</p>
								<p class="text-sm text-muted-foreground">Expires {formatDate(link.expiresAt)}</p>
							</div>
							<Button variant="outline" size="sm" onclick={() => revokeLink(link.id)}>Revoke</Button
							>
						</li>
					{/each}
				</ul>
			{/if}
		</div>

		<form
			bind:this={revokeFormEl}
			method="POST"
			action="?/revokeShare"
			use:revokeEnhance
			class="hidden"
		>
			<input type="hidden" name="id" value={$revoke.id} />
		</form>
	</Dialog.DialogContent>
</Dialog.Root>
