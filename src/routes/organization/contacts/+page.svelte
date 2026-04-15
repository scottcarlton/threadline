<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { supabase } from '$lib/supabase.js';
	import { cn } from '$lib/utils.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { downloadCSV } from '$lib/utils/csv.js';
	import type { DiscoveredContact } from '$lib/types/database.js';

	let { data } = $props();

	type KnownContact = {
		id: string;
		name: string | null;
		email: string;
		phone: string | null;
		source: 'account' | 'brand';
		sourceId: string;
		sourceName: string;
	};

	const knownContacts = $derived(data.knownContacts as KnownContact[]);
	const discoveredContacts = $derived(data.discoveredContacts as DiscoveredContact[]);

	type DuplicateGroup = {
		email: string;
		contacts: { id: string; name: string | null; source: string }[];
	};
	const duplicates = $derived((data.duplicates ?? []) as DuplicateGroup[]);

	let activeTab = $state<'known' | 'discovered'>('known');
	let search = $state('');
	let scanning = $state(false);
	let updatingId = $state('');

	const filteredKnown = $derived(
		knownContacts.filter((c) => {
			const q = search.toLowerCase();
			return (
				(c.name?.toLowerCase().includes(q) ?? false) ||
				c.email.toLowerCase().includes(q) ||
				c.sourceName.toLowerCase().includes(q)
			);
		})
	);

	const filteredDiscovered = $derived(
		discoveredContacts.filter((c) => {
			const q = search.toLowerCase();
			return (c.name?.toLowerCase().includes(q) ?? false) || c.email.toLowerCase().includes(q);
		})
	);

	function exportContacts() {
		const rows = filteredKnown.map((c) => ({
			name: c.name ?? '',
			email: c.email,
			phone: c.phone ?? '',
			source: c.source,
			source_name: c.sourceName
		}));
		downloadCSV(rows, 'contacts.csv');
	}

	async function scanInbox() {
		scanning = true;
		try {
			const res = await fetch('/api/contacts/discover', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' }
			});
			if (res.ok) {
				await invalidateAll();
			}
		} catch {
			// silently fail
		} finally {
			scanning = false;
		}
	}

	async function updateStatus(id: string, status: 'saved' | 'dismissed') {
		updatingId = id;
		try {
			const res = await fetch(`/api/contacts/${id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ status })
			});
			if (res.ok) {
				await invalidateAll();
			}
		} catch {
			// silently fail
		} finally {
			updatingId = '';
		}
	}

	function formatDate(dateStr: string): string {
		return new Date(dateStr).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

	// ── Drawer state ──
	type DrawerContact = {
		name: string | null;
		email: string | null;
		phone: string | null;
		source: 'account' | 'brand' | 'discovered';
		sourceId: string;
		sourceName: string | null;
		location?: string | null;
		website?: string | null;
		status?: string;
		messageCount?: number;
		firstSeenAt?: string;
		lastSeenAt?: string;
	};

	let drawerOpen = $state(false);
	let drawerContactId = $state('');
	let drawerLoading = $state(false);
	let drawerContact = $state<DrawerContact | null>(null);
	let drawerOrders = $state<any[]>([]);

	const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

	function closeDrawer() {
		drawerOpen = false;
		drawerContactId = '';
		drawerContact = null;
		drawerOrders = [];
	}

	async function openDrawer(contactId: string) {
		if (drawerContactId === contactId && drawerOpen) {
			closeDrawer();
			return;
		}
		drawerContactId = contactId;
		drawerOpen = true;
		drawerLoading = true;

		const accountPrefix = 'account-';
		const brandPrefix = 'brand-';

		if (contactId.startsWith(accountPrefix)) {
			const accId = contactId.slice(accountPrefix.length);
			const [accRes, ordersRes] = await Promise.all([
				supabase
					.from('accounts')
					.select(
						'id, business_name, contact_first_name, contact_last_name, contact_email, phone, city, state'
					)
					.eq('id', accId)
					.single(),
				supabase
					.from('orders')
					.select('id, order_number, total_amount, status, order_year, brands(name)')
					.eq('account_id', accId)
					.order('created_at', { ascending: false })
					.limit(10)
			]);
			if (accRes.data) {
				const a = accRes.data;
				drawerContact = {
					name: [a.contact_first_name, a.contact_last_name].filter(Boolean).join(' ') || null,
					email: a.contact_email,
					phone: a.phone,
					source: 'account',
					sourceId: a.id,
					sourceName: a.business_name,
					location: [a.city, a.state].filter(Boolean).join(', ') || null
				};
			}
			drawerOrders = ordersRes.data ?? [];
		} else if (contactId.startsWith(brandPrefix)) {
			const brId = contactId.slice(brandPrefix.length);
			const [brRes, ordersRes] = await Promise.all([
				supabase
					.from('brands')
					.select(
						'id, name, contact_first_name, contact_last_name, contact_email, contact_phone, website'
					)
					.eq('id', brId)
					.single(),
				supabase
					.from('orders')
					.select('id, order_number, total_amount, status, order_year, accounts(business_name)')
					.eq('brand_id', brId)
					.order('created_at', { ascending: false })
					.limit(10)
			]);
			if (brRes.data) {
				const b = brRes.data;
				drawerContact = {
					name: [b.contact_first_name, b.contact_last_name].filter(Boolean).join(' ') || null,
					email: b.contact_email,
					phone: b.contact_phone,
					source: 'brand',
					sourceId: b.id,
					sourceName: b.name,
					website: b.website,
					location: null
				};
			}
			drawerOrders = ordersRes.data ?? [];
		} else {
			const { data: disc } = await supabase
				.from('discovered_contacts')
				.select('*')
				.eq('id', contactId)
				.single();
			if (disc) {
				drawerContact = {
					name: disc.name,
					email: disc.email,
					phone: null,
					source: 'discovered',
					sourceId: disc.id,
					sourceName: null,
					status: disc.status,
					messageCount: disc.message_count,
					firstSeenAt: disc.first_seen_at,
					lastSeenAt: disc.last_seen_at
				};
			}
			drawerOrders = [];
		}
		drawerLoading = false;
	}

	const drawerSourceLabel = $derived(
		drawerContact?.source === 'account'
			? 'Account'
			: drawerContact?.source === 'brand'
				? 'Brand'
				: 'Discovered'
	);

	const drawerSourceHref = $derived(
		drawerContact?.source === 'account'
			? `/accounts/${drawerContact.sourceId}`
			: drawerContact?.source === 'brand'
				? `/brands/${drawerContact.sourceId}`
				: null
	);
</script>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h2 class="text-lg font-semibold">Contacts</h2>
			<p class="mt-0.5 text-sm text-muted-foreground">
				Account and brand contacts across your organization
			</p>
		</div>
		<div class="flex items-center gap-2">
			{#if activeTab === 'known' && filteredKnown.length > 0}
				<Button variant="outline" size="sm" onclick={exportContacts}>Export CSV</Button>
			{/if}
			{#if activeTab === 'discovered'}
				<Button variant="outline" size="sm" onclick={scanInbox} disabled={scanning}>
					{#if scanning}
						<svg
							class="mr-2 h-4 w-4 animate-spin"
							xmlns="http://www.w3.org/2000/svg"
							fill="none"
							viewBox="0 0 24 24"
						>
							<circle
								class="opacity-25"
								cx="12"
								cy="12"
								r="10"
								stroke="currentColor"
								stroke-width="4"
							></circle>
							<path
								class="opacity-75"
								fill="currentColor"
								d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
							></path>
						</svg>
						Scanning...
					{:else}
						Scan Inbox
					{/if}
				</Button>
			{/if}
		</div>
	</div>

	<!-- Search + Tabs -->
	<div class="flex items-center gap-3">
		<div class="max-w-xs flex-1">
			<Input placeholder="Search contacts..." bind:value={search} />
		</div>
		<div class="flex gap-1 rounded-lg bg-muted p-1">
			<button
				class="rounded-md px-4 py-2 text-sm font-medium transition-colors {activeTab === 'known'
					? 'bg-background text-foreground shadow-sm'
					: 'text-muted-foreground hover:text-foreground'}"
				onclick={() => (activeTab = 'known')}
			>
				Known
			</button>
			<button
				class="rounded-md px-4 py-2 text-sm font-medium transition-colors {activeTab ===
				'discovered'
					? 'bg-background text-foreground shadow-sm'
					: 'text-muted-foreground hover:text-foreground'}"
				onclick={() => (activeTab = 'discovered')}
			>
				Discovered
				{#if discoveredContacts.length > 0}
					<span
						class="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-zinc-100 px-1.5 text-[11px] font-medium text-zinc-600"
						>{discoveredContacts.length}</span
					>
				{/if}
			</button>
		</div>
	</div>

	<!-- Duplicate Alert -->
	{#if duplicates.length > 0}
		<div class="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
			<div class="flex items-center gap-2">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-5 w-5 shrink-0 text-amber-600"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="2"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
					/>
				</svg>
				<p class="text-sm font-medium text-amber-800">
					{duplicates.length} potential duplicate{duplicates.length !== 1 ? 's' : ''} found
				</p>
			</div>
			<div class="mt-2 space-y-1.5">
				{#each duplicates.slice(0, 3) as dup (dup.email)}
					<div class="flex items-center gap-2 text-sm text-amber-700">
						<span class="font-mono">{dup.email}</span>
						<span class="text-amber-600"
							>— found in {dup.contacts.map((c) => c.source).join(' & ')}</span
						>
					</div>
				{/each}
				{#if duplicates.length > 3}
					<p class="text-sm text-amber-600">and {duplicates.length - 3} more</p>
				{/if}
			</div>
		</div>
	{/if}

	<!-- Known Tab -->
	{#if activeTab === 'known'}
		{#if filteredKnown.length === 0}
			<div class="rounded-none p-12 text-center">
				{#if !search}
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="mx-auto h-16 w-16 text-foreground"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="0.4"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-1.997M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"
						/>
					</svg>
				{/if}
				<p class="mt-4 text-lg font-semibold">
					{search ? 'No contacts match your search' : 'Your contacts live here'}
				</p>
				<p class="mt-2 text-sm text-muted-foreground">
					{search
						? 'Try adjusting your search terms'
						: 'Add contacts to your accounts or brands to see them here'}
				</p>
			</div>
		{:else}
			<div class="overflow-hidden rounded-none border">
				<table class="w-full">
					<thead>
						<tr class="border-b bg-muted/40">
							<th
								class="px-4 py-2.5 text-left text-[12px] font-medium tracking-wider text-muted-foreground uppercase"
								>Contact</th
							>
							<th
								class="px-4 py-2.5 text-left text-[12px] font-medium tracking-wider text-muted-foreground uppercase"
								>Phone</th
							>
							<th
								class="px-4 py-2.5 text-left text-[12px] font-medium tracking-wider text-muted-foreground uppercase"
								>Source</th
							>
						</tr>
					</thead>
					<tbody class="divide-y">
						{#each filteredKnown as contact (`${contact.source}-${contact.sourceId}`)}
							<tr
								class="cursor-pointer transition-colors hover:bg-muted/30 {drawerContactId ===
								`${contact.source}-${contact.sourceId}`
									? 'bg-muted/30'
									: ''}"
								onclick={() => openDrawer(`${contact.source}-${contact.sourceId}`)}
							>
								<td class="px-4 py-3">
									<span class="text-base font-medium">{contact.name ?? '—'}</span>
									<p class="font-mono text-sm text-muted-foreground">{contact.email}</p>
								</td>
								<td class="px-4 py-3">
									<span class="font-mono text-sm text-muted-foreground">{contact.phone ?? '—'}</span
									>
								</td>
								<td class="px-4 py-3">
									<div class="flex items-center gap-2">
										<Badge variant={contact.source === 'brand' ? 'default' : 'secondary'}>
											{contact.source === 'brand' ? 'Brand' : 'Account'}
										</Badge>
										<span class="text-sm text-muted-foreground">{contact.sourceName}</span>
									</div>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	{/if}

	<!-- Discovered Tab -->
	{#if activeTab === 'discovered'}
		{#if filteredDiscovered.length === 0}
			<div class="rounded-none p-12 text-center">
				{#if !search}
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="mx-auto h-16 w-16 text-foreground"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="0.4"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
						/>
					</svg>
				{/if}
				<p class="mt-4 text-lg font-semibold">
					{search
						? 'No discovered contacts match your search'
						: 'Discover contacts from your inbox'}
				</p>
				<p class="mt-2 text-sm text-muted-foreground">
					{search
						? 'Try adjusting your search terms'
						: 'Click "Scan Inbox" to find contacts from your email'}
				</p>
			</div>
		{:else}
			<div class="overflow-hidden rounded-none border">
				<table class="w-full">
					<thead>
						<tr class="border-b bg-muted/40">
							<th
								class="px-4 py-2.5 text-left text-[12px] font-medium tracking-wider text-muted-foreground uppercase"
								>Contact</th
							>
							<th
								class="px-4 py-2.5 text-right text-[12px] font-medium tracking-wider text-muted-foreground uppercase"
								>Times Seen</th
							>
							<th
								class="px-4 py-2.5 text-left text-[12px] font-medium tracking-wider text-muted-foreground uppercase"
								>Last Seen</th
							>
							<th
								class="px-4 py-2.5 text-right text-[12px] font-medium tracking-wider text-muted-foreground uppercase"
								>Actions</th
							>
						</tr>
					</thead>
					<tbody class="divide-y">
						{#each filteredDiscovered as contact (contact.id)}
							<tr
								class="cursor-pointer transition-colors hover:bg-muted/30 {drawerContactId ===
								contact.id
									? 'bg-muted/30'
									: ''}"
								onclick={() => openDrawer(contact.id)}
							>
								<td class="px-4 py-3">
									<div class="flex items-center gap-2">
										<span class="text-sm font-medium">{contact.name || '—'}</span>
										{#if contact.status === 'saved'}
											<svg
												xmlns="http://www.w3.org/2000/svg"
												class="h-4 w-4 text-emerald-500"
												viewBox="0 0 20 20"
												fill="currentColor"
											>
												<path
													fill-rule="evenodd"
													d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
													clip-rule="evenodd"
												/>
											</svg>
										{/if}
									</div>
									<p class="font-mono text-sm text-muted-foreground">{contact.email}</p>
								</td>
								<td class="px-4 py-3 text-right">
									<span class="text-sm text-muted-foreground">{contact.message_count}</span>
								</td>
								<td class="px-4 py-3">
									<span class="text-sm text-muted-foreground"
										>{formatDate(contact.last_seen_at)}</span
									>
								</td>
								<td class="px-4 py-3 text-right" onclick={(e) => e.stopPropagation()}>
									<div class="flex items-center justify-end gap-1">
										{#if contact.status === 'new'}
											<Button
												variant="outline"
												size="sm"
												disabled={updatingId === contact.id}
												onclick={() => updateStatus(contact.id, 'saved')}>Save</Button
											>
											<Button
												variant="ghost"
												size="sm"
												disabled={updatingId === contact.id}
												onclick={() => updateStatus(contact.id, 'dismissed')}>Dismiss</Button
											>
										{:else if contact.status === 'saved'}
											<Button
												variant="ghost"
												size="sm"
												disabled={updatingId === contact.id}
												onclick={() => updateStatus(contact.id, 'dismissed')}>Dismiss</Button
											>
										{/if}
									</div>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	{/if}
</div>

<!-- Contact Detail Drawer -->
{#if drawerOpen}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm" onclick={closeDrawer}></div>
{/if}

<div
	class={cn(
		'fixed top-3 right-3 bottom-3 z-50 w-[calc(100vw-5rem)] overflow-hidden rounded-none border bg-background shadow-xl transition-transform duration-300 ease-in-out sm:w-[28rem]',
		drawerOpen ? 'translate-x-0' : 'translate-x-[calc(100%+1rem)]'
	)}
>
	<div class="flex h-full flex-col">
		<!-- Header -->
		<div class="flex items-center justify-between px-5 py-4">
			{#if drawerContact}
				<div class="flex min-w-0 items-center gap-3">
					<div
						class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold"
					>
						{(drawerContact.name ?? drawerContact.email ?? '?').charAt(0).toUpperCase()}
					</div>
					<div class="min-w-0">
						<h2 class="truncate text-base font-semibold">
							{drawerContact.name ?? drawerContact.email ?? 'Unknown'}
						</h2>
						{#if drawerContact.name && drawerContact.email}
							<p class="truncate font-mono text-sm text-muted-foreground">{drawerContact.email}</p>
						{/if}
					</div>
				</div>
			{:else}
				<h2 class="text-base font-semibold">Contact Details</h2>
			{/if}
			<button
				onclick={closeDrawer}
				aria-label="Close"
				class="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-5 w-5"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="1.5"
				>
					<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
				</svg>
			</button>
		</div>

		<!-- Content -->
		<div class="flex-1 space-y-6 overflow-y-auto px-5 py-5">
			{#if drawerLoading}
				<div class="flex items-center justify-center py-12">
					<div
						class="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent"
					></div>
				</div>
			{:else if drawerContact}
				<!-- Details -->
				<div class="space-y-3">
					<h3 class="text-sm font-semibold">Details</h3>
					<dl class="space-y-2.5 text-sm">
						{#if drawerContact.email}
							<div class="flex justify-between">
								<dt class="text-muted-foreground">Email</dt>
								<dd>
									<a href="mailto:{drawerContact.email}" class="font-mono hover:underline"
										>{drawerContact.email}</a
									>
								</dd>
							</div>
						{/if}
						{#if drawerContact.phone}
							<div class="flex justify-between">
								<dt class="text-muted-foreground">Phone</dt>
								<dd class="font-mono">{drawerContact.phone}</dd>
							</div>
						{/if}
						{#if drawerContact.location}
							<div class="flex justify-between">
								<dt class="text-muted-foreground">Location</dt>
								<dd>{drawerContact.location}</dd>
							</div>
						{/if}
						{#if drawerContact.website}
							<div class="flex justify-between">
								<dt class="text-muted-foreground">Website</dt>
								<dd>
									<a
										href={drawerContact.website}
										target="_blank"
										rel="external noopener noreferrer"
										class="text-primary hover:underline"
										>{drawerContact.website.replace(/^https?:\/\//, '')}</a
									>
								</dd>
							</div>
						{/if}
						{#if drawerContact.sourceName && drawerSourceHref}
							<div class="flex justify-between border-t pt-2.5">
								<dt class="text-muted-foreground">{drawerSourceLabel}</dt>
								<dd>
									<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- dynamic href computed from contact source -->
									<a href={drawerSourceHref} class="font-medium hover:underline"
										>{drawerContact.sourceName}</a
									>
								</dd>
							</div>
						{/if}
						{#if drawerContact.source === 'discovered'}
							{#if drawerContact.messageCount}
								<div class="flex justify-between">
									<dt class="text-muted-foreground">Messages seen</dt>
									<dd>{drawerContact.messageCount}</dd>
								</div>
							{/if}
							{#if drawerContact.firstSeenAt}
								<div class="flex justify-between">
									<dt class="text-muted-foreground">First seen</dt>
									<dd>{new Date(drawerContact.firstSeenAt).toLocaleDateString()}</dd>
								</div>
							{/if}
							{#if drawerContact.lastSeenAt}
								<div class="flex justify-between">
									<dt class="text-muted-foreground">Last seen</dt>
									<dd>{new Date(drawerContact.lastSeenAt).toLocaleDateString()}</dd>
								</div>
							{/if}
						{/if}
					</dl>
				</div>

				<!-- Recent Orders -->
				{#if drawerOrders.length > 0}
					<div class="h-px bg-border"></div>
					<div class="space-y-3">
						<h3 class="text-sm font-semibold">Recent Orders</h3>
						<div class="space-y-1.5">
							{#each drawerOrders as order (order.id)}
								<a
									href={resolve(`/orders/${order.id}`)}
									class="flex items-center justify-between rounded-lg border px-3 py-2 transition-colors hover:bg-muted/30"
								>
									<div>
										<span class="text-sm font-medium">{order.order_number}</span>
										<p class="text-xs text-muted-foreground">
											{drawerContact?.source === 'brand'
												? ((order.accounts as any)?.business_name ?? '')
												: ((order.brands as any)?.name ?? '')}
										</p>
									</div>
									<div class="text-right">
										<span class="text-sm font-medium">{fmt.format(Number(order.total_amount))}</span
										>
										<p class="text-xs text-muted-foreground capitalize">{order.status}</p>
									</div>
								</a>
							{/each}
						</div>
					</div>
				{/if}

				<!-- Email action -->
				{#if drawerContact.email}
					<div class="h-px bg-border"></div>
					<Button size="sm" href="mailto:{drawerContact.email}" class="w-full">
						Email {drawerContact.name ?? drawerContact.email}
					</Button>
				{/if}
			{/if}
		</div>
	</div>
</div>

<svelte:window
	onkeydown={(e) => {
		if (e.key === 'Escape' && drawerOpen) closeDrawer();
	}}
/>
