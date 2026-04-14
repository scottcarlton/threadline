<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/stores';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import type { ConnectedRep } from '$lib/server/federation.js';

	let { data } = $props();

	const fmtDate = new Intl.DateTimeFormat('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric'
	});
	const fmtMoney = new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD',
		maximumFractionDigits: 0
	});

	function statusClasses(status: string): string {
		switch (status) {
			case 'active':
				return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';
			case 'pending':
				return 'bg-amber-500/10 text-amber-600 dark:text-amber-400';
			case 'suspended':
				return 'bg-red-500/10 text-red-600 dark:text-red-400';
			default:
				return 'bg-zinc-500/10 text-zinc-500';
		}
	}

	// ── Brand-side state ────────────────────────────────────────────────────
	type Tab = 'active' | 'pending' | 'suspended';
	let activeTab = $state<Tab>('active');
	const tabs: { id: Tab; label: string; count: number }[] = $derived([
		{
			id: 'active',
			label: 'Active',
			count: data.connectedReps.filter((c) => c.status === 'active').length
		},
		{
			id: 'pending',
			label: 'Pending',
			count: data.connectedReps.filter((c) => c.status === 'pending').length
		},
		{
			id: 'suspended',
			label: 'Suspended',
			count: data.connectedReps.filter(
				(c) => c.status === 'suspended' || c.status === 'disconnected'
			).length
		}
	]);
	const tabReps = $derived.by(() => {
		if (activeTab === 'active') return data.connectedReps.filter((c) => c.status === 'active');
		if (activeTab === 'pending') return data.connectedReps.filter((c) => c.status === 'pending');
		return data.connectedReps.filter(
			(c) => c.status === 'suspended' || c.status === 'disconnected'
		);
	});

	let working = $state<string | null>(null);
	let errorMsg = $state<string | null>(null);

	async function post(url: string, body?: unknown) {
		const res = await fetch(url, {
			method: 'POST',
			headers: body ? { 'Content-Type': 'application/json' } : undefined,
			body: body ? JSON.stringify(body) : undefined
		});
		if (!res.ok) {
			const msg = ((await res.json().catch(() => ({}))) as { error?: string }).error ?? 'Failed';
			throw new Error(msg);
		}
		return res.json();
	}

	async function approve(connectionId: string) {
		working = connectionId;
		errorMsg = null;
		try {
			await post('/api/connections/approve', { connectionId });
			await invalidateAll();
		} catch (e) {
			errorMsg = (e as Error).message;
		} finally {
			working = null;
		}
	}
	async function suspend(connectionId: string) {
		if (!confirm('Suspend this connection? The rep will stop sharing new orders until reactivated.'))
			return;
		working = connectionId;
		errorMsg = null;
		try {
			await post('/api/connections/suspend', { connectionId });
			await invalidateAll();
		} catch (e) {
			errorMsg = (e as Error).message;
		} finally {
			working = null;
		}
	}
	async function reconnect(connectionId: string) {
		working = connectionId;
		errorMsg = null;
		try {
			await post('/api/connections/reconnect', { connectionId });
			await invalidateAll();
		} catch (e) {
			errorMsg = (e as Error).message;
		} finally {
			working = null;
		}
	}
	async function saveCommission(conn: ConnectedRep, value: string) {
		const current = conn.commission_rate === null ? '' : String(conn.commission_rate);
		if (value === current) return;
		working = conn.connection_id;
		errorMsg = null;
		try {
			await post('/api/connections/commission', {
				connectionId: conn.connection_id,
				commission_rate: value === '' ? null : value
			});
			await invalidateAll();
		} catch (e) {
			errorMsg = (e as Error).message;
		} finally {
			working = null;
		}
	}

	// ── Invite creation ─────────────────────────────────────────────────────
	let showInviteForm = $state(false);
	let inviteExpiresDays = $state(30);
	let inviteMaxUses = $state<number>(0);
	let creatingInvite = $state(false);

	async function createInvite() {
		creatingInvite = true;
		errorMsg = null;
		try {
			const body: { expires_at?: string; max_uses?: number } = {};
			if (inviteExpiresDays && inviteExpiresDays > 0) {
				const d = new Date();
				d.setDate(d.getDate() + Number(inviteExpiresDays));
				body.expires_at = d.toISOString();
			}
			if (inviteMaxUses && inviteMaxUses > 0) body.max_uses = Number(inviteMaxUses);
			await post('/api/connections/invite', body);
			showInviteForm = false;
			await invalidateAll();
		} catch (e) {
			errorMsg = (e as Error).message;
		} finally {
			creatingInvite = false;
		}
	}
	async function revokeInvite(id: string) {
		if (!confirm('Revoke this invite link? Anyone who already has the URL will get an error.')) return;
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

	// ── Rep-side state (join by code) ───────────────────────────────────────
	let joinCode = $state('');
	let repBrandId = $state('');
	let joining = $state(false);
	let joinSuccess = $state('');
	async function joinByCode() {
		if (!joinCode.trim()) return;
		joining = true;
		errorMsg = null;
		joinSuccess = '';
		try {
			const r = (await post('/api/connections/request', {
				code: joinCode.trim(),
				repBrandId: repBrandId || null
			})) as { brandName?: string };
			joinSuccess = `Request sent to ${r.brandName ?? 'the brand'}. Awaiting approval.`;
			joinCode = '';
			repBrandId = '';
			await invalidateAll();
		} catch (e) {
			errorMsg = (e as Error).message;
		} finally {
			joining = false;
		}
	}

	function territorySummary(c: ConnectedRep): string {
		if (c.account_count === 0) return 'No accounts yet';
		return `${c.account_count} account${c.account_count === 1 ? '' : 's'}`;
	}
</script>

<svelte:head><title>Connections — Threadline</title></svelte:head>

<div class="mx-auto max-w-5xl space-y-6 p-6">
	<header class="flex items-end justify-between gap-4">
		<div>
			<h1 class="text-2xl font-semibold">Connections</h1>
			<p class="text-sm text-muted-foreground">
				{#if data.orgType === 'brand'}
					Manage your rep-org network: invite, approve, configure commissions, and monitor activity.
				{:else}
					Manage the brands you carry. Join a brand using an invite link they share with you.
				{/if}
			</p>
		</div>
	</header>

	{#if errorMsg}
		<div
			class="rounded border border-red-500 bg-red-50 p-3 text-sm text-red-900 dark:bg-red-950/30 dark:text-red-200"
		>
			{errorMsg}
		</div>
	{/if}

	<!-- ── Brand side ───────────────────────────────────────────────────── -->
	{#if data.orgType === 'brand'}
		<!-- Invite block -->
		{#if data.isAdmin}
			<section class="rounded-lg border p-5">
				<div class="flex items-center justify-between">
					<div>
						<h2 class="text-lg font-semibold">Invite links</h2>
						<p class="text-sm text-muted-foreground">
							Share a link with a rep org to kick off a connection.
						</p>
					</div>
					<Button onclick={() => (showInviteForm = !showInviteForm)}>
						{showInviteForm ? 'Cancel' : '+ Generate Invite'}
					</Button>
				</div>

				{#if showInviteForm}
					<div class="mt-4 grid gap-4 sm:grid-cols-3">
						<div>
							<Label for="expires">Expires in (days)</Label>
							<Input id="expires" type="number" min="1" max="365" bind:value={inviteExpiresDays} />
						</div>
						<div>
							<Label for="maxuses">Max uses (0 = unlimited)</Label>
							<Input id="maxuses" type="number" min="0" bind:value={inviteMaxUses} />
						</div>
						<div class="flex items-end">
							<Button disabled={creatingInvite} onclick={createInvite}>
								{creatingInvite ? 'Creating…' : 'Create invite'}
							</Button>
						</div>
					</div>
				{/if}

				{#if data.invites.length > 0}
					<ul class="mt-4 divide-y">
						{#each data.invites as inv (inv.id)}
							{@const expired = new Date(inv.expires_at) < new Date()}
							{@const maxed = inv.max_uses > 0 && inv.use_count >= inv.max_uses}
							<li class="flex items-center justify-between py-3">
								<div>
									<div class="flex items-center gap-2 font-mono text-sm">
										<span>{inviteUrl(inv.code)}</span>
										<button
											type="button"
											class="text-sm underline hover:no-underline"
											onclick={() => copyLink(inv.id, inv.code)}
										>
											{copiedId === inv.id ? 'Copied!' : 'Copy'}
										</button>
									</div>
									<div class="mt-1 text-sm text-muted-foreground">
										Uses: {inv.use_count}{inv.max_uses > 0 ? ` / ${inv.max_uses}` : ''} · Expires
										{fmtDate.format(new Date(inv.expires_at))}
										{#if expired}
											· <span class="text-red-600">Expired</span>
										{:else if maxed}
											· <span class="text-red-600">Max uses reached</span>
										{/if}
									</div>
								</div>
								<Button
									variant="ghost"
									size="sm"
									disabled={working === inv.id}
									onclick={() => revokeInvite(inv.id)}
								>
									Revoke
								</Button>
							</li>
						{/each}
					</ul>
				{/if}
			</section>
		{/if}

		<!-- Tabs -->
		<section class="rounded-lg border">
			<div class="flex gap-1 border-b px-4">
				{#each tabs as t (t.id)}
					<button
						class="-mb-px px-4 py-3 text-sm font-medium transition-colors {activeTab === t.id
							? 'text-foreground'
							: 'text-muted-foreground hover:text-foreground'}"
						style="border-bottom: 1px solid {activeTab === t.id ? 'currentColor' : 'transparent'}"
						onclick={() => (activeTab = t.id)}
					>
						{t.label}
						{#if t.count > 0}
							<span class="ml-1 rounded-full bg-muted px-1.5 text-sm">{t.count}</span>
						{/if}
					</button>
				{/each}
			</div>

			{#if tabReps.length === 0}
				<div class="p-10 text-center">
					<div
						class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="1.5"
							class="h-6 w-6"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M17 20h5v-2a4 4 0 00-5-3.87M9 20H4v-2a4 4 0 015-3.87m6-8a4 4 0 11-8 0 4 4 0 018 0z"
							/>
						</svg>
					</div>
					<div class="text-base font-semibold">
						{#if activeTab === 'active'}
							No active connections
						{:else if activeTab === 'pending'}
							No pending requests
						{:else}
							No suspended connections
						{/if}
					</div>
					<p class="mt-1 text-sm text-muted-foreground">
						{#if activeTab === 'active'}
							Generate an invite link and share it with a rep agency to get started.
						{:else if activeTab === 'pending'}
							When a rep claims an invite link, their request will appear here.
						{:else}
							Suspended rep connections will live here until reactivated.
						{/if}
					</p>
				</div>
			{:else}
				<ul class="divide-y">
					{#each tabReps as conn (conn.connection_id)}
						<li class="p-4">
							<div class="flex flex-wrap items-start justify-between gap-3">
								<div class="min-w-0 flex-1">
									<div class="flex items-center gap-2">
										<span class="font-semibold">{conn.rep_org_name}</span>
										<span
											class="inline-flex rounded-full px-2 py-0.5 text-sm {statusClasses(
												conn.status
											)}"
										>
											{conn.status}
										</span>
									</div>
									<div class="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
										<span>{conn.order_count} order{conn.order_count === 1 ? '' : 's'}</span>
										<span>{fmtMoney.format(conn.revenue)}</span>
										<span>{territorySummary(conn)}</span>
										{#if conn.last_order_at}
											<span>Last order {fmtDate.format(new Date(conn.last_order_at))}</span>
										{/if}
										{#if conn.connected_at}
											<span>Connected {fmtDate.format(new Date(conn.connected_at))}</span>
										{/if}
									</div>
								</div>

								{#if data.isAdmin && conn.status === 'active'}
									<div class="flex items-center gap-2 text-sm">
										<Label for={`comm-${conn.connection_id}`} class="text-sm"
											>Commission %</Label
										>
										<input
											id={`comm-${conn.connection_id}`}
											type="number"
											min="0"
											max="100"
											step="0.01"
											class="h-9 w-24 rounded border bg-background px-2 text-right text-sm"
											value={conn.commission_rate ?? ''}
											disabled={working === conn.connection_id}
											onblur={(e) =>
												saveCommission(conn, (e.target as HTMLInputElement).value)}
										/>
										<Button
											variant="ghost"
											size="sm"
											disabled={working === conn.connection_id}
											onclick={() => suspend(conn.connection_id)}
										>
											Suspend
										</Button>
									</div>
								{:else if data.isAdmin && conn.status === 'pending'}
									<div class="flex items-center gap-2">
										<Button
											size="sm"
											disabled={working === conn.connection_id}
											onclick={() => approve(conn.connection_id)}
										>
											Approve
										</Button>
										<Button
											variant="ghost"
											size="sm"
											disabled={working === conn.connection_id}
											onclick={() => suspend(conn.connection_id)}
										>
											Reject
										</Button>
									</div>
								{:else if data.isAdmin && (conn.status === 'suspended' || conn.status === 'disconnected')}
									<Button
										size="sm"
										disabled={working === conn.connection_id}
										onclick={() => reconnect(conn.connection_id)}
									>
										Reactivate
									</Button>
								{/if}
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	{:else}
		<!-- ── Rep side ───────────────────────────────────────────────────── -->
		{#if data.isAdmin}
			<section class="rounded-lg border p-5">
				<h2 class="text-lg font-semibold">Join a brand</h2>
				<p class="text-sm text-muted-foreground">
					Paste the invite code from a brand (or use their shareable link).
				</p>
				<div class="mt-4 grid gap-4 sm:grid-cols-[1fr_1fr_auto]">
					<div>
						<Label for="code">Invite code</Label>
						<Input id="code" bind:value={joinCode} />
					</div>
					<div>
						<Label for="rep-brand">Which of your brands?</Label>
						<select
							id="rep-brand"
							class="flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm"
							bind:value={repBrandId}
						>
							<option value="">— Pick a brand —</option>
							{#each data.brands as b (b.id)}
								<option value={b.id}>{b.name}</option>
							{/each}
						</select>
					</div>
					<div class="flex items-end">
						<Button disabled={joining || !joinCode.trim()} onclick={joinByCode}>
							{joining ? 'Requesting…' : 'Request connection'}
						</Button>
					</div>
				</div>
				{#if joinSuccess}
					<p class="mt-2 text-sm text-emerald-600">{joinSuccess}</p>
				{/if}
			</section>
		{/if}

		<section class="rounded-lg border">
			<div class="border-b p-4">
				<h2 class="text-lg font-semibold">Your brand connections</h2>
			</div>
			{#if data.repConnections.length === 0}
				<div class="p-10 text-center">
					<div
						class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="1.5"
							class="h-6 w-6"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
							/>
						</svg>
					</div>
					<div class="text-base font-semibold">No brand connections yet</div>
					<p class="mt-1 text-sm text-muted-foreground">
						Join a brand with an invite code above.
					</p>
				</div>
			{:else}
				<ul class="divide-y">
					{#each data.repConnections as conn (conn.id)}
						<li class="flex items-center justify-between p-4">
							<div>
								<div class="flex items-center gap-2">
									<span class="font-semibold">{conn.brand_org?.name ?? 'Brand'}</span>
									<span
										class="inline-flex rounded-full px-2 py-0.5 text-sm {statusClasses(
											conn.status
										)}"
									>
										{conn.status}
									</span>
								</div>
								<div class="mt-1 text-sm text-muted-foreground">
									{conn.connected_at
										? `Connected ${fmtDate.format(new Date(conn.connected_at))}`
										: `Requested ${fmtDate.format(new Date(conn.created_at))}`}
									{#if conn.commission_rate !== null}
										· Commission {conn.commission_rate}%
									{/if}
								</div>
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	{/if}
</div>
