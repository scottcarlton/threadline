<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';

	let { data } = $props();

	let joinCode = $state('');
	let selectedBrandId = $state('');
	let loading = $state(false);
	let error = $state('');
	let success = $state('');

	const activeConnections = $derived(data.connections.filter((c: any) => c.status === 'active'));
	const pendingConnections = $derived(data.connections.filter((c: any) => c.status === 'pending'));

	const fmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

	function statusColor(status: string): string {
		switch (status) {
			case 'active':
				return 'bg-emerald-500/10 text-emerald-600';
			case 'pending':
				return 'bg-amber-500/10 text-amber-600';
			case 'suspended':
				return 'bg-red-500/10 text-red-600';
			case 'disconnected':
				return 'bg-zinc-500/10 text-zinc-500';
			default:
				return 'bg-zinc-500/10 text-zinc-500';
		}
	}

	function partnerName(conn: any): string {
		if (data.orgType === 'brand') return conn.rep_org?.name ?? 'Unknown rep';
		return conn.brand_org?.name ?? 'Unknown brand';
	}

	async function generateInvite() {
		loading = true;
		error = '';
		const res = await fetch('/api/connections/invite', { method: 'POST' });
		loading = false;
		if (!res.ok) {
			error = (await res.json()).error;
			return;
		}
		await invalidateAll();
	}

	async function requestConnection() {
		if (!joinCode.trim()) return;
		loading = true;
		error = '';
		success = '';

		const res = await fetch('/api/connections/request', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ code: joinCode.trim(), repBrandId: selectedBrandId || null })
		});

		loading = false;
		if (!res.ok) {
			error = (await res.json()).error;
			return;
		}

		const { brandName } = await res.json();
		success = `Connection requested to ${brandName ?? 'brand'}. Waiting for approval.`;
		joinCode = '';
		selectedBrandId = '';
		await invalidateAll();
	}

	async function approveConnection(connectionId: string) {
		loading = true;
		error = '';
		const res = await fetch('/api/connections/approve', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ connectionId })
		});
		loading = false;
		if (!res.ok) {
			error = (await res.json()).error;
			return;
		}
		await invalidateAll();
	}

	async function disconnect(connectionId: string) {
		loading = true;
		error = '';
		const res = await fetch('/api/connections/disconnect', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ connectionId })
		});
		loading = false;
		if (!res.ok) {
			error = (await res.json()).error;
			return;
		}
		await invalidateAll();
	}

	function copyCode(code: string) {
		navigator.clipboard.writeText(code);
	}
</script>

<div class="mx-auto max-w-3xl space-y-8">
	<div>
		<h1 class="text-2xl font-bold">Connections</h1>
		<p class="mt-1 text-sm text-muted-foreground">
			{#if data.orgType === 'brand'}
				Manage connections with reps who sell your products.
			{:else}
				Connect with brands to share order and account data.
			{/if}
		</p>
	</div>

	{#if error}
		<div class="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
	{/if}
	{#if success}
		<div class="rounded-lg bg-emerald-500/10 p-3 text-sm text-emerald-600">{success}</div>
	{/if}

	<!-- Brand: Generate invite codes -->
	{#if data.orgType === 'brand' && data.isAdmin}
		<div class="space-y-4 rounded-none border p-5">
			<div>
				<h2 class="text-base font-semibold">Invite Codes</h2>
				<p class="mt-0.5 text-sm text-muted-foreground">
					Share an invite code with reps so they can connect their Threadline to yours.
				</p>
			</div>

			<Button onclick={generateInvite} disabled={loading}>Generate New Code</Button>

			{#if data.invites.length > 0}
				<div class="space-y-2">
					{#each data.invites as invite}
						<div class="flex items-center justify-between rounded-lg border px-4 py-3">
							<div>
								<code class="font-mono text-sm font-medium">{invite.code}</code>
								<p class="text-sm text-muted-foreground">
									Used {invite.use_count}{invite.max_uses > 0 ? `/${invite.max_uses}` : ''} times &middot;
									Expires {fmt.format(new Date(invite.expires_at))}
								</p>
							</div>
							<Button variant="outline" size="sm" onclick={() => copyCode(invite.code)}>Copy</Button
							>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	{/if}

	<!-- Rep: Join with invite code -->
	{#if data.orgType === 'rep' && data.isAdmin}
		<div class="space-y-4 rounded-none border p-5">
			<div>
				<h2 class="text-base font-semibold">Connect to a Brand</h2>
				<p class="mt-0.5 text-sm text-muted-foreground">
					Enter an invite code from a brand to request a connection.
				</p>
			</div>

			<form
				onsubmit={(e) => {
					e.preventDefault();
					requestConnection();
				}}
				class="space-y-3"
			>
				<Input bind:value={joinCode} placeholder="Enter invite code" />

				{#if data.brands.length > 0}
					<div>
						<label for="brand-select" class="text-sm font-medium"
							>Map to local brand (optional)</label
						>
						<select
							id="brand-select"
							class="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
							bind:value={selectedBrandId}
						>
							<option value="">Select a brand...</option>
							{#each data.brands as brand}
								<option value={brand.id}>{brand.name}</option>
							{/each}
						</select>
						<p class="mt-1 text-sm text-muted-foreground">
							Map this connection to one of your existing brand records for auto-federation.
						</p>
					</div>
				{/if}

				<Button type="submit" disabled={loading || !joinCode.trim()}>
					{loading ? 'Requesting...' : 'Request Connection'}
				</Button>
			</form>
		</div>
	{/if}

	<!-- Pending connections (brand side: approve) -->
	{#if pendingConnections.length > 0}
		<div class="space-y-3">
			<h2 class="text-base font-semibold">Pending</h2>
			{#each pendingConnections as conn}
				<div class="flex items-center justify-between rounded-none border bg-card px-5 py-4">
					<div>
						<p class="text-sm font-medium">{partnerName(conn)}</p>
						<p class="text-sm text-muted-foreground">
							Requested {fmt.format(new Date(conn.created_at))}
						</p>
					</div>
					<div class="flex items-center gap-2">
						{#if data.orgType === 'brand' && data.isAdmin}
							<Button size="sm" onclick={() => approveConnection(conn.id)} disabled={loading}
								>Approve</Button
							>
						{:else}
							<span class="rounded-full px-2.5 py-1 text-sm {statusColor('pending')}">Pending</span>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	{/if}

	<!-- Active connections -->
	{#if activeConnections.length > 0}
		<div class="space-y-3">
			<h2 class="text-base font-semibold">Active Connections</h2>
			{#each activeConnections as conn}
				<div class="flex items-center justify-between rounded-none border bg-card px-5 py-4">
					<div>
						<p class="text-sm font-medium">{partnerName(conn)}</p>
						<p class="text-sm text-muted-foreground">
							Connected {conn.connected_at ? fmt.format(new Date(conn.connected_at)) : ''}
							{#if conn.commission_rate}
								&middot; {conn.commission_rate}% commission
							{/if}
						</p>
					</div>
					<div class="flex items-center gap-3">
						<span class="rounded-full px-2.5 py-1 text-sm {statusColor('active')}">Active</span>
						{#if data.isAdmin}
							<Button
								variant="outline"
								size="sm"
								onclick={() => disconnect(conn.id)}
								disabled={loading}>Disconnect</Button
							>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	{/if}

	<!-- No connections state -->
	{#if data.connections.length === 0}
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
						d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.182-9.182a4.5 4.5 0 00-6.364 6.364l4.5 4.5a4.5 4.5 0 006.364-6.364l-1.757-1.757"
					/>
				</svg>
			</div>
			<h3 class="mt-4 text-base font-semibold">No connections yet</h3>
			<p class="mt-1 text-sm text-muted-foreground">
				{#if data.orgType === 'brand'}
					Generate an invite code to share with your reps.
				{:else}
					Ask a brand for their invite code to get connected.
				{/if}
			</p>
		</div>
	{/if}
</div>
