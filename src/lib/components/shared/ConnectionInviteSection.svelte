<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/stores';
	import { Dialog } from 'bits-ui';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import Switch from '$lib/components/ui/switch.svelte';

	type ConnectionInvite = {
		id: string;
		code: string;
		expires_at: string;
		max_uses: number;
		use_count: number;
		auto_approve: boolean;
		created_at: string;
	};

	let { invites = [] }: { invites: ConnectionInvite[] } = $props();

	const fmtDate = new Intl.DateTimeFormat('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric'
	});

	let showForm = $state(false);
	let expiresDays = $state(30);
	let maxUses = $state<number>(0);
	let autoApprove = $state(false);
	let creating = $state(false);
	let errorMsg = $state<string | null>(null);
	let working = $state<string | null>(null);

	async function createInvite() {
		creating = true;
		errorMsg = null;
		try {
			const body: { expires_at?: string; max_uses?: number; auto_approve?: boolean } = {};
			if (expiresDays && expiresDays > 0) {
				// eslint-disable-next-line svelte/prefer-svelte-reactivity -- non-reactive transient computation
				const d = new Date();
				d.setDate(d.getDate() + Number(expiresDays));
				body.expires_at = d.toISOString();
			}
			if (maxUses && maxUses > 0) body.max_uses = Number(maxUses);
			if (autoApprove) body.auto_approve = true;
			const res = await fetch('/api/connections/invite', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});
			if (!res.ok) {
				const json = (await res.json().catch(() => ({}))) as { error?: string };
				throw new Error(json.error ?? 'Failed');
			}
			showForm = false;
			autoApprove = false;
			await invalidateAll();
		} catch (e) {
			errorMsg = (e as Error).message;
		} finally {
			creating = false;
		}
	}

	async function revokeInvite(id: string) {
		if (!confirm('Revoke this invite link? Anyone who already has the URL will get an error.'))
			return;
		working = id;
		errorMsg = null;
		try {
			const res = await fetch(`/api/connections/invite/${id}`, { method: 'DELETE' });
			if (!res.ok) throw new Error('Failed to revoke');
			await invalidateAll();
		} catch (e) {
			errorMsg = (e as Error).message;
		} finally {
			working = null;
		}
	}

	function inviteUrl(code: string): string {
		return `${$page.url.origin}/connect/${code}`;
	}

	let copiedId = $state<string | null>(null);
	async function copyLink(id: string, code: string) {
		await navigator.clipboard.writeText(inviteUrl(code));
		copiedId = id;
		setTimeout(() => {
			if (copiedId === id) copiedId = null;
		}, 1500);
	}

	// ── QR code dialog ─────────────────────────────────────────────────────
	let qrDialogOpen = $state(false);
	let qrDataUrl = $state('');

	async function showQR(code: string) {
		const QRCode = (await import('qrcode')).default;
		qrDataUrl = await QRCode.toDataURL(inviteUrl(code), { width: 256, margin: 2 });
		qrDialogOpen = true;
	}

	function downloadQR() {
		const a = document.createElement('a');
		a.href = qrDataUrl;
		a.download = 'invite-qr.png';
		a.click();
	}

	function emailInvite(code: string) {
		const url = inviteUrl(code);
		const subject = encodeURIComponent('Connect with us on Threadline');
		const body = encodeURIComponent(
			`We'd like to connect with your agency on Threadline.\n\nUse this link to get started:\n${url}`
		);
		window.open(`mailto:?subject=${subject}&body=${body}`, '_self');
	}
</script>

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<div>
			<p class="text-sm text-muted-foreground">
				Generate a shareable link for an external rep agency to connect with your brand.
			</p>
		</div>
		<Button variant="outline" size="sm" onclick={() => (showForm = !showForm)}>
			{showForm ? 'Cancel' : '+ New link'}
		</Button>
	</div>

	{#if errorMsg}
		<div
			class="rounded border border-red-500 bg-red-50 p-3 text-sm text-red-900 dark:bg-red-950/30 dark:text-red-200"
		>
			{errorMsg}
		</div>
	{/if}

	{#if showForm}
		<div class="space-y-4 rounded-lg border p-4">
			<div class="grid gap-4 sm:grid-cols-2">
				<div>
					<Label for="conn-expires">Expires in (days)</Label>
					<Input id="conn-expires" type="number" min="1" max="365" bind:value={expiresDays} />
				</div>
				<div>
					<Label for="conn-maxuses">Max uses (0 = unlimited)</Label>
					<Input id="conn-maxuses" type="number" min="0" bind:value={maxUses} />
				</div>
			</div>
			<div class="flex items-center gap-3">
				<Switch id="conn-auto-approve" bind:checked={autoApprove} />
				<div>
					<Label for="conn-auto-approve" class="cursor-pointer">Auto-approve</Label>
					<p class="text-sm text-muted-foreground">
						Reps who claim this link are connected immediately, no review needed.
					</p>
				</div>
			</div>
			<Button disabled={creating} onclick={createInvite}>
				{creating ? 'Creating…' : 'Create link'}
			</Button>
		</div>
	{/if}

	{#if invites.length > 0}
		<ul class="divide-y rounded-lg border">
			{#each invites as inv (inv.id)}
				{@const expired = new Date(inv.expires_at) < new Date()}
				{@const maxed = inv.max_uses > 0 && inv.use_count >= inv.max_uses}
				<li class="px-4 py-3">
					<div class="flex items-start justify-between gap-3">
						<div class="min-w-0 flex-1">
							<div class="flex flex-wrap items-center gap-2">
								<span class="truncate font-mono text-sm">{inviteUrl(inv.code)}</span>
								{#if inv.auto_approve}
									<span
										class="inline-flex rounded-full bg-blue-500/10 px-2 py-0.5 text-sm text-blue-600 dark:text-blue-400"
									>
										Auto-approve
									</span>
								{/if}
								{#if expired}
									<span
										class="inline-flex rounded-full bg-red-500/10 px-2 py-0.5 text-sm text-red-600 dark:text-red-400"
									>
										Expired
									</span>
								{:else if maxed}
									<span
										class="inline-flex rounded-full bg-red-500/10 px-2 py-0.5 text-sm text-red-600 dark:text-red-400"
									>
										Max uses reached
									</span>
								{/if}
							</div>
							<div class="mt-1 text-sm text-muted-foreground">
								Uses: {inv.use_count}{inv.max_uses > 0 ? ` / ${inv.max_uses}` : ''} · Expires
								{fmtDate.format(new Date(inv.expires_at))}
							</div>
						</div>
						<div class="flex shrink-0 items-center gap-1">
							<button
								type="button"
								class="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
								onclick={() => copyLink(inv.id, inv.code)}
								aria-label="Copy invite link"
							>
								{#if copiedId === inv.id}
									<svg
										xmlns="http://www.w3.org/2000/svg"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										class="h-4 w-4 text-emerald-600"
									>
										<path d="M20 6L9 17l-5-5" stroke-linecap="round" stroke-linejoin="round" />
									</svg>
								{:else}
									<svg
										xmlns="http://www.w3.org/2000/svg"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										class="h-4 w-4"
									>
										<rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
										<path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
									</svg>
								{/if}
							</button>
							<button
								type="button"
								class="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
								onclick={() => emailInvite(inv.code)}
								aria-label="Share via email"
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									class="h-4 w-4"
								>
									<rect x="2" y="4" width="20" height="16" rx="2" />
									<path d="m22 7-8.97 5.7a1.94 1.94 0 01-2.06 0L2 7" />
								</svg>
							</button>
							<button
								type="button"
								class="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
								onclick={() => showQR(inv.code)}
								aria-label="Show QR code"
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									class="h-4 w-4"
								>
									<rect x="2" y="2" width="8" height="8" rx="1" />
									<rect x="14" y="2" width="8" height="8" rx="1" />
									<rect x="2" y="14" width="8" height="8" rx="1" />
									<path d="M14 14h2v2h-2zm4 0h2v2h-2zm-4 4h2v2h-2zm4 0h2v2h-2z" />
								</svg>
							</button>
							<Button
								variant="ghost"
								size="sm"
								disabled={working === inv.id}
								onclick={() => revokeInvite(inv.id)}
							>
								Revoke
							</Button>
						</div>
					</div>
				</li>
			{/each}
		</ul>
	{:else if !showForm}
		<p class="py-4 text-center text-sm text-muted-foreground">
			No connection links yet. Create one to share with an external rep agency.
		</p>
	{/if}
</div>

<!-- QR Code Dialog -->
<Dialog.Root bind:open={qrDialogOpen}>
	<Dialog.Portal>
		<Dialog.Overlay class="fixed inset-0 z-50 bg-black/50" />
		<Dialog.Content
			class="fixed top-1/2 left-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-background p-6 shadow-lg"
		>
			<Dialog.Title class="text-lg font-semibold">QR Code</Dialog.Title>
			<Dialog.Description class="mt-1 text-sm text-muted-foreground">
				Scan this code to open the invite link.
			</Dialog.Description>
			{#if qrDataUrl}
				<div class="mt-4 flex justify-center">
					<img src={qrDataUrl} alt="Invite QR code" class="rounded" />
				</div>
			{/if}
			<div class="mt-4 flex justify-end gap-2">
				<Button variant="outline" onclick={downloadQR}>Download</Button>
				<Button onclick={() => (qrDialogOpen = false)}>Close</Button>
			</div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
