<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { supabase } from '$lib/supabase.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '$lib/components/ui/card/index.js';
	import type { Account } from '$lib/types/database.js';
	import type { AccountHealth } from '$lib/server/account-health.js';
	import { entityContext } from '$lib/stores/entityContext.js';

	let { data } = $props();
	const account = $derived(data.account as Account);

	$effect(() => {
		const a = account;
		const health = (data.accountHealth as AccountHealth | null)?.label ?? 'unknown';
		entityContext.set({
			type: 'account',
			id: a.id,
			summary: `Account: ${a.business_name} | ${[a.city, a.state].filter(Boolean).join(', ') || 'No location'} | Health: ${health} | ${data.brandSummaries?.length ?? 0} brands`
		});
		return () => entityContext.set({ type: null, id: null, summary: null });
	});
	const canEdit = $derived(data.membership?.role !== 'guest');
	const isAdmin = $derived(data.membership?.role === 'admin' || data.membership?.role === 'owner');

	// Buyer invite dialog state
	let showInviteDialog = $state(false);
	let inviteEmail = $state('');
	let inviteBrandIds = $state<string[]>([]);
	let inviteLoading = $state(false);
	let inviteError = $state('');
	let inviteSuccess = $state('');
	let copiedInviteId = $state('');

	function copyInviteLink(token: string, id: string) {
		const url = `${window.location.origin}/buyer-invite/${token}`;
		navigator.clipboard.writeText(url);
		copiedInviteId = id;
		setTimeout(() => { copiedInviteId = ''; }, 2000);
	}

	async function sendBuyerInvite() {
		inviteError = '';
		inviteSuccess = '';
		inviteLoading = true;

		try {
			const res = await fetch('/api/buyer-invite/send', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					email: inviteEmail,
					accountId: account.id,
					brandIds: inviteBrandIds
				})
			});

			if (!res.ok) {
				const result = await res.json();
				inviteError = result.error ?? 'Failed to send invitation';
				return;
			}

			const result = await res.json();
			inviteSuccess = `Invitation sent! Share this link: ${window.location.origin}/buyer-invite/${result.token}`;
			inviteEmail = '';
			inviteBrandIds = [];
			invalidateAll();
		} catch {
			inviteError = 'An unexpected error occurred';
		} finally {
			inviteLoading = false;
		}
	}

	function toggleBrandId(brandId: string) {
		if (inviteBrandIds.includes(brandId)) {
			inviteBrandIds = inviteBrandIds.filter((id) => id !== brandId);
		} else {
			inviteBrandIds = [...inviteBrandIds, brandId];
		}
	}

	async function removeBuyerUser(userId: string) {
		await supabase.from('account_users').delete().eq('id', userId);
		invalidateAll();
	}
	type BrandSummary = { id: string; name: string; orderCount: number; totalSales: number };
	const brandSummaries = $derived(data.brandSummaries as BrandSummary[]);
	const health = $derived(data.accountHealth as AccountHealth | null);

	const healthColors: Record<string, string> = {
		excellent: 'text-emerald-600',
		good: 'text-blue-600',
		fair: 'text-amber-600',
		at_risk: 'text-red-600',
		inactive: 'text-zinc-500',
		new: 'text-violet-600',
	};

	const healthBadgeColors: Record<string, string> = {
		excellent: 'bg-emerald-50 text-emerald-700',
		good: 'bg-blue-50 text-blue-700',
		fair: 'bg-amber-50 text-amber-700',
		at_risk: 'bg-red-50 text-red-700',
		inactive: 'bg-zinc-100 text-zinc-500',
		new: 'bg-violet-50 text-violet-700',
	};

	let editing = $state(false);
	let businessName = $state('');
	let contactFirstName = $state('');
	let contactLastName = $state('');
	let contactEmail = $state('');
	let phone = $state('');
	let addressLine1 = $state('');
	let addressLine2 = $state('');
	let city = $state('');
	let accountState = $state('');
	let zip = $state('');
	let notes = $state('');
	let error = $state('');
	let loading = $state(false);

	function startEdit() {
		businessName = account.business_name;
		contactFirstName = account.contact_first_name ?? '';
		contactLastName = account.contact_last_name ?? '';
		contactEmail = account.contact_email ?? '';
		phone = account.phone ?? '';
		addressLine1 = account.address_line1 ?? '';
		addressLine2 = account.address_line2 ?? '';
		city = account.city ?? '';
		accountState = account.state ?? '';
		zip = account.zip ?? '';
		notes = account.notes ?? '';
		editing = true;
	}

	async function handleSave() {
		error = '';
		loading = true;

		const { error: err } = await supabase
			.from('accounts')
			.update({
				business_name: businessName,
				contact_first_name: contactFirstName || null,
				contact_last_name: contactLastName || null,
				contact_email: contactEmail || null,
				phone: phone || null,
				address_line1: addressLine1 || null,
				address_line2: addressLine2 || null,
				city: city || null,
				state: accountState || null,
				zip: zip || null,
				notes: notes || null,
				updated_at: new Date().toISOString()
			})
			.eq('id', account.id);

		loading = false;
		if (err) {
			error = err.message;
		} else {
			editing = false;
			invalidateAll();
		}
	}

	async function toggleActive() {
		await supabase
			.from('accounts')
			.update({ is_active: !account.is_active, updated_at: new Date().toISOString() })
			.eq('id', account.id);
		invalidateAll();
	}

	function fmt(value: number): string {
		return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);
	}
</script>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-3">
			<Button variant="ghost" size="sm" href="/accounts">← Back</Button>
			<h1 class="text-3xl">{account.business_name}</h1>
			<Badge variant={account.is_active ? 'success' : 'secondary'}>
				{account.is_active ? 'Active' : 'Inactive'}
			</Badge>
		</div>
		{#if canEdit && !editing}
			<div class="flex gap-2">
				<Button variant="outline" size="sm" onclick={toggleActive}>
					{account.is_active ? 'Deactivate' : 'Activate'}
				</Button>
				<Button size="sm" onclick={startEdit}>Edit</Button>
			</div>
		{/if}
	</div>

	<div class="grid gap-6 lg:grid-cols-[1fr_400px]">
	<!-- Left column: Details -->
	<div class="space-y-6">
	<Card>
		<CardContent class="pt-6">
			{#if error}
				<div class="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
			{/if}

			{#if editing}
				<form id="edit-form" onsubmit={(e) => { e.preventDefault(); handleSave(); }} class="space-y-4">
					<div class="space-y-2">
						<Label for="business-name">Business name *</Label>
						<Input id="business-name" bind:value={businessName} required />
					</div>
					<div class="grid gap-4 sm:grid-cols-3">
						<div class="space-y-2">
							<Label for="contact-first-name">First name</Label>
							<Input id="contact-first-name" bind:value={contactFirstName} />
						</div>
						<div class="space-y-2">
							<Label for="contact-last-name">Last name</Label>
							<Input id="contact-last-name" bind:value={contactLastName} />
						</div>
						<div class="space-y-2">
							<Label for="contact-email">Email</Label>
							<Input id="contact-email" type="email" bind:value={contactEmail} />
						</div>
					</div>
					<div class="space-y-2">
						<Label for="phone">Phone</Label>
						<Input id="phone" bind:value={phone} />
					</div>
					<div class="space-y-2">
						<Label for="address1">Address line 1</Label>
						<Input id="address1" bind:value={addressLine1} />
					</div>
					<div class="space-y-2">
						<Label for="address2">Address line 2</Label>
						<Input id="address2" bind:value={addressLine2} />
					</div>
					<div class="grid gap-4 sm:grid-cols-3">
						<div class="space-y-2">
							<Label for="city">City</Label>
							<Input id="city" bind:value={city} />
						</div>
						<div class="space-y-2">
							<Label for="state">State</Label>
							<Input id="state" bind:value={accountState} />
						</div>
						<div class="space-y-2">
							<Label for="zip">ZIP</Label>
							<Input id="zip" bind:value={zip} />
						</div>
					</div>
					<div class="space-y-2">
						<Label for="notes">Notes</Label>
						<textarea
							id="notes"
							bind:value={notes}
							rows="3"
							class="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
						></textarea>
					</div>
				</form>
			{:else}
				<dl class="space-y-4">
					<div class="grid gap-4 sm:grid-cols-2">
						<div>
							<dt class="text-sm font-medium text-muted-foreground">Contact Name</dt>
							<dd class="mt-1">{[account.contact_first_name, account.contact_last_name].filter(Boolean).join(' ') || '—'}</dd>
						</div>
						<div>
							<dt class="text-sm font-medium text-muted-foreground">Email</dt>
							<dd class="mt-1">{account.contact_email ?? '—'}</dd>
						</div>
					</div>
					<div>
						<dt class="text-sm font-medium text-muted-foreground">Phone</dt>
						<dd class="mt-1">{account.phone ?? '—'}</dd>
					</div>
					<div>
						<dt class="text-sm font-medium text-muted-foreground">Address</dt>
						<dd class="mt-1">
							{#if account.address_line1}
								{account.address_line1}<br />
								{#if account.address_line2}{account.address_line2}<br />{/if}
								{[account.city, account.state].filter(Boolean).join(', ')}
								{#if account.zip} {account.zip}{/if}
							{:else}
								—
							{/if}
						</dd>
					</div>
					{#if account.notes}
						<div>
							<dt class="text-sm font-medium text-muted-foreground">Notes</dt>
							<dd class="mt-1 whitespace-pre-wrap">{account.notes}</dd>
						</div>
					{/if}
				</dl>
			{/if}
		</CardContent>
		{#if editing}
			<CardFooter class="justify-between">
				<Button variant="outline" onclick={() => (editing = false)}>Cancel</Button>
				<Button type="submit" form="edit-form" disabled={loading}>
					{loading ? 'Saving...' : 'Save Changes'}
				</Button>
			</CardFooter>
		{/if}
	</Card>

	<!-- Buyer Portal Access -->
	{#if isAdmin}
		<Card>
			<CardHeader>
				<div class="flex items-center justify-between">
					<CardTitle class="text-base">Buyer Portal</CardTitle>
					<Button size="sm" onclick={() => (showInviteDialog = !showInviteDialog)}>
						{showInviteDialog ? 'Cancel' : 'Invite Buyer'}
					</Button>
				</div>
			</CardHeader>
			<CardContent>
				{#if showInviteDialog}
					<div class="space-y-3 mb-4 rounded-lg border bg-muted/30 p-4">
						{#if inviteError}
							<div class="rounded-md bg-destructive/10 p-2 text-xs text-destructive">{inviteError}</div>
						{/if}
						{#if inviteSuccess}
							<div class="rounded-md bg-emerald-50 p-2 text-xs text-emerald-700 break-all">{inviteSuccess}</div>
						{/if}
						<div class="space-y-1.5">
							<Label for="buyer-email">Email</Label>
							<Input id="buyer-email" type="email" placeholder="buyer@store.com" bind:value={inviteEmail} />
						</div>
						{#if data.allBrands.length > 0}
							<div class="space-y-1.5">
								<Label>Brand Access</Label>
								<div class="flex flex-wrap gap-1.5">
									{#each data.allBrands as brand}
										<button
											class="rounded-full px-2.5 py-1 text-xs border transition-colors {inviteBrandIds.includes(brand.id) ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-accent'}"
											onclick={() => toggleBrandId(brand.id)}
										>
											{brand.name}
										</button>
									{/each}
								</div>
							</div>
						{/if}
						<Button size="sm" onclick={sendBuyerInvite} disabled={inviteLoading || !inviteEmail}>
							{inviteLoading ? 'Sending...' : 'Send Invite'}
						</Button>
					</div>
				{/if}

				{#if data.buyerUsers.length > 0}
					<div class="space-y-2">
						{#each data.buyerUsers as bu}
							<div class="flex items-center justify-between rounded-lg border px-3 py-2.5">
								<div>
									<p class="text-sm font-medium">{bu.profiles?.display_name ?? 'Unknown'}</p>
									<p class="text-xs text-muted-foreground capitalize">{bu.role}</p>
								</div>
								<button
									class="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
									onclick={() => removeBuyerUser(bu.id)}
									title="Remove buyer access"
								>
									<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
										<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
									</svg>
								</button>
							</div>
						{/each}
					</div>
				{:else if !showInviteDialog}
					<p class="text-sm text-muted-foreground">No buyer users yet. Invite a buyer to give them portal access.</p>
				{/if}

				{#if data.buyerInvitations.length > 0}
					<div class="mt-3 space-y-1.5">
						<p class="text-xs font-medium text-muted-foreground">Pending Invitations</p>
						{#each data.buyerInvitations as inv}
							<div class="flex items-center justify-between rounded-lg border border-dashed px-3 py-2">
								<span class="text-xs text-muted-foreground">{inv.email}</span>
								<div class="flex items-center gap-2">
									<button
										class="text-xs text-muted-foreground hover:text-foreground transition-colors"
										onclick={() => copyInviteLink(inv.token, inv.id)}
									>
										{copiedInviteId === inv.id ? 'Copied!' : 'Copy Link'}
									</button>
									<Badge class="bg-amber-500/10 text-amber-500">Pending</Badge>
								</div>
							</div>
						{/each}
					</div>
				{/if}

				{#if data.buyerBrandAccess.length > 0}
					<div class="mt-3 space-y-1.5">
						<p class="text-xs font-medium text-muted-foreground">Brand Access</p>
						<div class="flex flex-wrap gap-1.5">
							{#each data.buyerBrandAccess as ba}
								<Badge>{ba.brands?.name ?? 'Unknown'}</Badge>
							{/each}
						</div>
					</div>
				{/if}
			</CardContent>
		</Card>
	{/if}
	</div>

	<!-- Right sidebar: Health Score + Brands -->
	<div class="space-y-6">
	<!-- Health Score -->
	{#if health}
		<Card>
			<CardContent class="pt-5 pb-5">
				<div class="flex items-center gap-3">
					<div class="flex h-12 w-12 items-center justify-center rounded-none {healthBadgeColors[health.label]}">
						<span class="text-lg font-bold">{health.score}</span>
					</div>
					<div>
						<p class="text-sm font-medium capitalize {healthColors[health.label]}">{health.label === 'at_risk' ? 'At Risk' : health.label}</p>
						<p class="text-sm text-muted-foreground">Account Health Score</p>
					</div>
				</div>
				<div class="mt-4 grid grid-cols-2 gap-3">
					<div class="rounded-lg bg-muted/50 px-3 py-2">
						<p class="text-lg font-semibold">{health.totalOrders}</p>
						<p class="text-xs text-muted-foreground">Total Orders</p>
					</div>
					<div class="rounded-lg bg-muted/50 px-3 py-2">
						<p class="text-lg font-semibold">{fmt(health.lifetimeRevenue)}</p>
						<p class="text-xs text-muted-foreground">Lifetime Revenue</p>
					</div>
					<div class="rounded-lg bg-muted/50 px-3 py-2">
						<p class="text-lg font-semibold">{health.ytdOrders}</p>
						<p class="text-xs text-muted-foreground">YTD Orders</p>
					</div>
					<div class="rounded-lg bg-muted/50 px-3 py-2">
						<p class="text-lg font-semibold">{fmt(health.ytdRevenue)}</p>
						<p class="text-xs text-muted-foreground">YTD Revenue</p>
					</div>
				</div>
				{#if health.yoyGrowth !== null}
					<div class="mt-3 text-center">
						<span class="text-sm font-medium {health.yoyGrowth >= 0 ? 'text-emerald-600' : 'text-red-600'}">{health.yoyGrowth >= 0 ? '+' : ''}{Math.round(health.yoyGrowth)}% YoY Growth</span>
					</div>
				{/if}
				{#if health.signals.length > 0}
					<div class="mt-3 flex flex-wrap gap-2">
						{#each health.signals as signal}
							<span class="rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{signal}</span>
						{/each}
					</div>
				{/if}
			</CardContent>
		</Card>
	{/if}

	<!-- Brands -->
	<Card>
		<CardHeader>
			<CardTitle class="text-base">Brands</CardTitle>
		</CardHeader>
		<CardContent>
			{#if brandSummaries.length === 0}
				<p class="text-sm text-muted-foreground">No orders yet. Brands will appear here once orders are created.</p>
			{:else}
				<div class="space-y-2">
					{#each brandSummaries as brand}
						<a href="/brands/{brand.id}" class="flex items-center justify-between rounded-lg border px-4 py-3 transition-colors hover:bg-muted/50">
							<span class="text-sm font-medium">{brand.name}</span>
							<div class="text-right">
								<p class="text-sm font-medium">{fmt(brand.totalSales)}</p>
								<p class="text-xs text-muted-foreground">{brand.orderCount} {brand.orderCount === 1 ? 'order' : 'orders'}</p>
							</div>
						</a>
					{/each}
				</div>
			{/if}
		</CardContent>
	</Card>

	</div>
	</div>
</div>
