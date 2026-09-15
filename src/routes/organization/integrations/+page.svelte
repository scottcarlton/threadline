<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import IntegrationLogo from '$lib/components/integrations/IntegrationLogo.svelte';
	import { Dialog } from 'bits-ui';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input';
	import { toast } from 'svelte-sonner';
	import type { IntegrationConnection, IntegrationProvider } from '$lib/types/database.js';

	let { data } = $props();
	const connections = $derived((data.connections ?? []) as IntegrationConnection[]);

	type IntegrationDef = {
		provider: IntegrationProvider;
		name: string;
		description: string;
		category: string;
		connectUrl: string | null;
		icon: string;
	};

	const integrations: IntegrationDef[] = [
		{
			provider: 'google_sheets',
			name: 'Google Sheets',
			description: 'Export orders, accounts, and reports to spreadsheets',
			category: 'Productivity',
			connectUrl: '/api/integrations/google-sheets/connect',
			icon: 'sheets'
		},
		{
			provider: 'slack',
			name: 'Slack',
			description: 'Get notifications for new orders, status changes, and team activity',
			category: 'Communication',
			connectUrl: '/api/integrations/slack/connect',
			icon: 'slack'
		},
		{
			provider: 'notion',
			name: 'Notion',
			description: 'Two-way sync for orders, brands, lookbooks, and docs',
			category: 'Productivity',
			connectUrl: '/api/integrations/notion/connect',
			icon: 'notion'
		},
		{
			provider: 'discord',
			name: 'Discord',
			description: 'Get notifications for orders, status changes, and team activity in your server',
			category: 'Communication',
			connectUrl: '/api/integrations/discord/connect',
			icon: 'discord'
		},
		{
			provider: 'microsoft',
			name: 'Microsoft 365',
			description: 'Outlook email, Teams notifications, and Excel exports',
			category: 'Microsoft',
			connectUrl: '/api/integrations/microsoft/connect',
			icon: 'microsoft'
		},
		{
			provider: 'shopify',
			name: 'Shopify',
			description: 'Live inventory sync from your Shopify store',
			category: 'E-commerce',
			connectUrl: null,
			icon: 'shopify'
		}
	];

	const comingSoon: { name: string; description: string; category: string }[] = [
		{
			name: 'WhatsApp',
			description: 'Place and manage orders through WhatsApp messaging',
			category: 'Messaging'
		},
		{
			name: 'iMessage',
			description: 'Place and manage orders through iMessage',
			category: 'Messaging'
		},
		{
			name: 'QuickBooks',
			description: 'Sync orders and commissions with your accounting software',
			category: 'Accounting'
		},
		{
			name: 'Xero',
			description: 'Export invoices and track payments automatically',
			category: 'Accounting'
		},
		{
			name: 'DocuSign',
			description: 'Send and sign rep agreements and buyer credit applications',
			category: 'Documents'
		},
		{
			name: 'HubSpot',
			description: 'Sync accounts and contacts with your CRM',
			category: 'CRM'
		},
		{
			name: 'Zapier',
			description: 'Connect Threadline to thousands of other apps',
			category: 'Automation'
		}
	];

	function getConnection(provider: IntegrationProvider): IntegrationConnection | undefined {
		return connections.find((c) => c.provider === provider);
	}

	let search = $state('');
	let disconnecting = $state('');
	let syncingShopify = $state(false);
	let shopifyDialogOpen = $state(false);
	let shopifyInput = $state('');

	function openShopifyDialog() {
		shopifyInput = '';
		shopifyDialogOpen = true;
	}

	function submitShopifyConnect(e: Event) {
		e.preventDefault();
		const shop = shopifyInput.trim();
		if (!shop) return;
		window.location.href = `/api/integrations/shopify/connect?shop=${encodeURIComponent(shop)}`;
	}

	const allIntegrations = $derived([
		...integrations.map((i) => ({ ...i, comingSoon: false })),
		...comingSoon.map((i) => ({
			...i,
			provider: '' as IntegrationProvider,
			connectUrl: null,
			icon: '',
			comingSoon: true
		}))
	]);

	const filtered = $derived(
		search.trim()
			? allIntegrations.filter(
					(i) =>
						i.name.toLowerCase().includes(search.trim().toLowerCase()) ||
						i.description.toLowerCase().includes(search.trim().toLowerCase()) ||
						i.category.toLowerCase().includes(search.trim().toLowerCase())
				)
			: allIntegrations
	);

	async function disconnect(provider: IntegrationProvider) {
		disconnecting = provider;
		try {
			const res = await fetch(`/api/integrations/${provider.replace('_', '-')}/disconnect`, {
				method: 'POST'
			});
			if (res.ok) {
				await invalidateAll();
			}
		} finally {
			disconnecting = '';
		}
	}

	async function syncShopify() {
		syncingShopify = true;
		try {
			const res = await fetch('/api/integrations/shopify/sync', { method: 'POST' });
			if (!res.ok) {
				const body = (await res.json().catch(() => ({}))) as { error?: string };
				throw new Error(body.error ?? 'Sync failed');
			}
			const data = (await res.json()) as {
				matched: number;
				unmatched: number;
				inventoryWrites: number;
			};
			toast.success(
				`Synced — ${data.matched} matched, ${data.unmatched} unmatched, ${data.inventoryWrites} inventory updates`
			);
			await invalidateAll();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Sync failed');
		} finally {
			syncingShopify = false;
		}
	}
</script>

<div class="space-y-8">
	<div class="flex items-center justify-between gap-4">
		<div>
			<h2 class="text-lg font-semibold">Integrations</h2>
			<p class="mt-0.5 text-sm text-muted-foreground">
				Connect Threadline with your other tools and services
			</p>
		</div>
		<div class="relative w-64 shrink-0">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="1.5"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
				/>
			</svg>
			<input
				type="text"
				placeholder="Search integrations..."
				bind:value={search}
				class="h-9 w-full rounded-md border bg-background pr-3 pl-9 text-sm placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/20 focus:outline-none"
			/>
		</div>
	</div>

	{#if filtered.length === 0}
		<div class="py-12 text-center">
			<p class="text-sm text-muted-foreground">No integrations matching "{search}"</p>
		</div>
	{/if}

	<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
		{#each filtered.filter((i) => !i.comingSoon) as integration (integration.provider)}
			{@const conn = getConnection(integration.provider)}
			<div class="relative space-y-3 rounded-lg border p-5">
				<div class="flex items-start justify-between">
					<div class="flex h-10 w-10 items-center justify-center">
						<IntegrationLogo name={integration.icon} />
					</div>
					{#if conn?.status === 'active'}
						<div class="flex items-center gap-1 text-green-600">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-4 w-4"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								stroke-width="2"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
								/>
							</svg>
							<span class="text-xs font-normal">Connected</span>
						</div>
					{/if}
				</div>

				<div>
					<p class="text-sm font-semibold">{integration.name}</p>
					<p class="mt-0.5 text-sm text-muted-foreground">{integration.description}</p>
				</div>

				{#if conn?.status === 'active'}
					{#if integration.provider === 'shopify'}
						<div class="space-y-2">
							<Button
								variant="outline"
								size="sm"
								class="w-full"
								onclick={syncShopify}
								disabled={syncingShopify}
							>
								{syncingShopify ? 'Syncing...' : 'Re-sync inventory'}
							</Button>
							<Button
								variant="outline"
								size="sm"
								class="w-full border-destructive/50! text-destructive hover:bg-destructive/5 hover:text-destructive"
								onclick={() => disconnect(integration.provider)}
								disabled={disconnecting === integration.provider}
							>
								{disconnecting === integration.provider ? 'Disconnecting...' : 'Disconnect'}
							</Button>
						</div>
					{:else}
						<Button
							variant="outline"
							size="sm"
							class="w-full border-destructive/50! text-destructive hover:bg-destructive/5 hover:text-destructive"
							onclick={() => disconnect(integration.provider)}
							disabled={disconnecting === integration.provider}
						>
							{disconnecting === integration.provider ? 'Disconnecting...' : 'Disconnect'}
						</Button>
					{/if}
				{:else if integration.provider === 'shopify'}
					<Button variant="outline" size="sm" class="w-full" onclick={openShopifyDialog}>
						Connect
					</Button>
				{:else if integration.connectUrl}
					<Button variant="outline" size="sm" class="w-full" href={integration.connectUrl}>
						Connect
					</Button>
				{/if}
			</div>
		{/each}

		{#each filtered.filter((i) => i.comingSoon) as integration (integration.name)}
			<div class="space-y-3 rounded-lg border p-5 opacity-50">
				<div class="flex h-10 w-10 items-center justify-center">
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
							d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
						/>
					</svg>
				</div>
				<div>
					<p class="text-sm font-semibold">{integration.name}</p>
					<p class="mt-0.5 text-sm text-muted-foreground">{integration.description}</p>
				</div>
				<p class="text-sm text-muted-foreground">Coming soon</p>
			</div>
		{/each}
	</div>
</div>

<Dialog.Root bind:open={shopifyDialogOpen}>
	<Dialog.Portal>
		<Dialog.Overlay
			class="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50"
		/>
		<Dialog.Content
			class="fixed top-[50%] left-[50%] z-50 w-full max-w-md translate-x-[-50%] translate-y-[-50%] rounded-lg border bg-background p-6 shadow-lg"
		>
			<Dialog.Title class="text-base font-semibold">Connect Shopify</Dialog.Title>
			<Dialog.Description class="mt-1 text-sm text-muted-foreground">
				Enter your Shopify store's handle or full .myshopify.com domain.
			</Dialog.Description>
			<form onsubmit={submitShopifyConnect} class="mt-5 space-y-3">
				<Input
					type="text"
					placeholder="acme or acme.myshopify.com"
					bind:value={shopifyInput}
					autocomplete="off"
					required
					aria-label="Shopify shop handle"
				/>
				<div class="flex justify-end gap-2">
					<Dialog.Close class="rounded-md border px-4 py-2 text-sm transition-colors hover:bg-muted"
						>Cancel</Dialog.Close
					>
					<button
						type="submit"
						class="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground transition-colors hover:bg-primary/90"
					>
						Continue
					</button>
				</div>
			</form>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
