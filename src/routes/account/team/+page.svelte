<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { Card, CardHeader, CardTitle, CardContent } from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { toast } from 'svelte-sonner';

	let { data } = $props();
	const members = $derived(data.members);
	const pendingInvites = $derived(data.pendingInvites);

	let inviteEmail = $state('');
	let inviting = $state(false);
	let removingProfileId = $state<string | null>(null);

	async function handleInvite(e: Event) {
		e.preventDefault();
		if (!inviteEmail.trim()) return;
		inviting = true;
		try {
			const res = await fetch('/api/buyer-team/invite', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email: inviteEmail.trim() })
			});
			const body = (await res.json()) as { success?: boolean; autoAdded?: boolean; error?: string };
			if (!res.ok) {
				toast.error(body.error ?? 'Failed to send invitation.');
				return;
			}
			toast.success(body.autoAdded ? 'Teammate added to your account.' : 'Invitation sent.');
			inviteEmail = '';
			await invalidateAll();
		} catch {
			toast.error('Network error. Try again.');
		} finally {
			inviting = false;
		}
	}

	async function handleRemove(profileId: string, name: string) {
		if (!confirm(`Remove ${name} from your account?`)) return;
		removingProfileId = profileId;
		try {
			const res = await fetch(`/api/buyer-team/${profileId}`, { method: 'DELETE' });
			const body = (await res.json()) as { error?: string };
			if (!res.ok) {
				toast.error(body.error ?? 'Failed to remove teammate.');
				return;
			}
			toast.success(`${name} removed.`);
			await invalidateAll();
		} catch {
			toast.error('Network error. Try again.');
		} finally {
			removingProfileId = null;
		}
	}
</script>

<div class="mx-auto max-w-3xl space-y-6">
	<div>
		<h1 class="text-3xl">Team</h1>
		<p class="mt-1 text-sm text-muted-foreground">
			Invite teammates so multiple people at your business can place and track orders.
		</p>
	</div>

	<Card>
		<CardHeader>
			<CardTitle>Invite a teammate</CardTitle>
		</CardHeader>
		<CardContent>
			<form onsubmit={handleInvite} class="flex flex-col gap-3 sm:flex-row sm:items-end">
				<div class="flex-1 space-y-1.5">
					<Label for="inviteEmail">Email address</Label>
					<Input
						id="inviteEmail"
						name="email"
						type="email"
						placeholder="teammate@yourbusiness.com"
						bind:value={inviteEmail}
						disabled={inviting}
					/>
				</div>
				<Button type="submit" disabled={inviting || !inviteEmail.trim()}>
					{inviting ? 'Sending…' : 'Send invite'}
				</Button>
			</form>
		</CardContent>
	</Card>

	<Card>
		<CardHeader>
			<CardTitle>Active teammates</CardTitle>
		</CardHeader>
		<CardContent>
			<ul class="divide-y divide-border">
				{#each members as m (m.profileId)}
					<li class="flex items-center justify-between py-3">
						<div class="min-w-0">
							<p class="text-base font-medium">
								{m.displayName}
								{#if m.isSelf}
									<span class="ml-1 text-sm text-muted-foreground">(you)</span>
								{/if}
							</p>
							<p class="truncate text-sm text-muted-foreground">{m.email ?? '—'}</p>
						</div>
						<div class="flex shrink-0 items-center gap-2">
							<Badge variant={m.role === 'buyer_admin' ? 'default' : 'outline'}>
								{m.role === 'buyer_admin' ? 'Admin' : 'Buyer'}
							</Badge>
							{#if !m.isSelf}
								<Button
									variant="ghost"
									size="sm"
									disabled={removingProfileId === m.profileId}
									onclick={() => handleRemove(m.profileId, m.displayName)}
								>
									{removingProfileId === m.profileId ? 'Removing…' : 'Remove'}
								</Button>
							{/if}
						</div>
					</li>
				{/each}
			</ul>
		</CardContent>
	</Card>

	{#if pendingInvites.length > 0}
		<Card>
			<CardHeader>
				<CardTitle>Pending invitations</CardTitle>
			</CardHeader>
			<CardContent>
				<ul class="divide-y divide-border">
					{#each pendingInvites as inv (inv.id)}
						<li class="flex items-center justify-between py-3">
							<div class="min-w-0">
								<p class="text-base font-medium">{inv.email}</p>
								<p class="text-sm text-muted-foreground">
									Invited {new Date(inv.invitedAt).toLocaleDateString()}
								</p>
							</div>
							<Badge variant="outline">Pending</Badge>
						</li>
					{/each}
				</ul>
			</CardContent>
		</Card>
	{/if}
</div>
