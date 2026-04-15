<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';

	let { data } = $props();

	const reps = $derived(data.reps ?? []);
	const totalRevenue = $derived(reps.reduce((sum: number, r: any) => sum + r.revenue, 0));
	const totalOrders = $derived(reps.reduce((sum: number, r: any) => sum + r.orderCount, 0));

	function getInitials(name: string): string {
		return name
			.split(' ')
			.map((w: string) => w[0])
			.join('')
			.toUpperCase()
			.slice(0, 2);
	}

	function roleLabel(r: string): string {
		return r.charAt(0).toUpperCase() + r.slice(1);
	}

	const fmt = new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD',
		maximumFractionDigits: 0
	});

	// ── Invite form ────────────────────────────────────────────────────────
	let inviteOpen = $state(false);
	let inviteEmail = $state('');
	let inviteRole = $state<'sales' | 'member' | 'admin'>('sales');
	let sending = $state(false);
	let inviteError = $state('');
	let inviteSuccess = $state('');

	async function sendInvite() {
		if (!inviteEmail.trim()) {
			inviteError = 'Enter an email address.';
			return;
		}
		sending = true;
		inviteError = '';
		inviteSuccess = '';
		const res = await fetch('/api/invite/send', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole, brandIds: [] })
		});
		sending = false;
		if (!res.ok) {
			inviteError =
				((await res.json().catch(() => ({}))) as { error?: string }).error ??
				'Failed to send invite';
			return;
		}
		inviteSuccess = `Invite sent to ${inviteEmail.trim()}.`;
		inviteEmail = '';
		invalidateAll();
	}

	function closeInvite() {
		inviteOpen = false;
		inviteError = '';
		inviteSuccess = '';
	}
</script>

<div class="mx-auto max-w-5xl space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-bold">Reps</h1>
			<p class="mt-1 text-sm text-muted-foreground">
				{reps.length} team member{reps.length !== 1 ? 's' : ''} &middot; {totalOrders} orders &middot;
				{fmt.format(totalRevenue)} revenue
			</p>
		</div>
		<Button onclick={() => (inviteOpen = !inviteOpen)}>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-4 w-4"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="2"
			>
				<path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
			</svg>
			{inviteOpen ? 'Close' : 'Invite'}
		</Button>
	</div>

	{#if inviteOpen}
		<div class="rounded-lg border p-5">
			<h2 class="text-lg font-semibold">Invite a rep</h2>
			<p class="text-sm text-muted-foreground">
				Send an invite to join your org. They'll get an email with a signup link.
			</p>
			<div class="mt-4 grid gap-4 sm:grid-cols-[1fr_160px_auto]">
				<div>
					<Label for="invite-email">Email</Label>
					<Input
						id="invite-email"
						type="email"
						placeholder="name@example.com"
						bind:value={inviteEmail}
					/>
				</div>
				<div>
					<Label for="invite-role">Role</Label>
					<select
						id="invite-role"
						class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
						bind:value={inviteRole}
					>
						<option value="sales">Sales</option>
						<option value="member">Member</option>
						<option value="admin">Admin</option>
					</select>
				</div>
				<div class="flex items-end">
					<Button disabled={sending || !inviteEmail.trim()} onclick={sendInvite}>
						{sending ? 'Sending…' : 'Send invite'}
					</Button>
				</div>
			</div>
			{#if inviteError}
				<p class="mt-3 text-sm text-red-600">{inviteError}</p>
			{/if}
			{#if inviteSuccess}
				<div class="mt-3 flex items-center justify-between text-sm text-emerald-600">
					<span>{inviteSuccess}</span>
					<button
						type="button"
						class="text-sm text-muted-foreground underline hover:text-foreground"
						onclick={closeInvite}
					>
						Done
					</button>
				</div>
			{/if}
		</div>
	{/if}

	{#if reps.length === 0}
		<div class="flex flex-col items-center justify-center py-16">
			<div class="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-7 w-7 text-muted-foreground"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="1.5"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"
					/>
				</svg>
			</div>
			<h3 class="mt-4 text-base font-semibold">No reps yet</h3>
			<p class="mt-1 text-sm text-muted-foreground">
				Invite team members to start tracking rep performance.
			</p>
		</div>
	{:else}
		<div class="space-y-2">
			{#each reps as rep}
				<div class="flex items-center justify-between rounded-none border bg-card px-5 py-4">
					<div class="flex items-center gap-3">
						<div
							class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary"
						>
							{getInitials(rep.name)}
						</div>
						<div>
							<p class="text-sm font-medium">{rep.name}</p>
							<p class="text-sm text-muted-foreground">{roleLabel(rep.role)}</p>
						</div>
					</div>
					<div class="flex items-center gap-8 text-right">
						<div>
							<p class="text-sm font-medium">{rep.orderCount}</p>
							<p class="text-sm text-muted-foreground">Orders</p>
						</div>
						<div>
							<p class="text-sm font-medium">{fmt.format(rep.revenue)}</p>
							<p class="text-sm text-muted-foreground">Revenue</p>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>
