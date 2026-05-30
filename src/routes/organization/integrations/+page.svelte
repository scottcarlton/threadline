<script lang="ts">
	import { invalidateAll } from '$app/navigation';
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
						{#if integration.icon === 'sheets'}
							<!-- Google Sheets official logo -->
							<svg xmlns="http://www.w3.org/2000/svg" class="h-7 w-7" viewBox="0 0 64 88">
								<path d="M 42,0 64,22 53,24 42,22 40,11 Z" fill="#188038" />
								<path
									d="M 42,22 V 0 H 6 C 2.685,0 0,2.685 0,6 v 76 c 0,3.315 2.685,6 6,6 h 52 c 3.315,0 6,-2.685 6,-6 V 22 Z"
									fill="#34a853"
								/>
								<path
									d="M 12,34 V 63 H 52 V 34 Z M 29.5,58 H 17 v -7 h 12.5 z m 0,-12 H 17 V 39 H 29.5 Z M 47,58 H 34.5 V 51 H 47 Z M 47,46 H 34.5 V 39 H 47 Z"
									fill="#fff"
								/>
							</svg>
						{:else if integration.icon === 'slack'}
							<!-- Slack official logo -->
							<svg xmlns="http://www.w3.org/2000/svg" class="h-7 w-7" viewBox="0 0 127 127">
								<path
									d="M27.2 80c0 7.3-5.9 13.2-13.2 13.2C6.7 93.2.8 87.3.8 80c0-7.3 5.9-13.2 13.2-13.2h13.2V80zm6.6 0c0-7.3 5.9-13.2 13.2-13.2 7.3 0 13.2 5.9 13.2 13.2v33c0 7.3-5.9 13.2-13.2 13.2-7.3 0-13.2-5.9-13.2-13.2V80z"
									fill="#E01E5A"
								/>
								<path
									d="M47 27c-7.3 0-13.2-5.9-13.2-13.2C33.8 6.5 39.7.6 47 .6c7.3 0 13.2 5.9 13.2 13.2V27H47zm0 6.7c7.3 0 13.2 5.9 13.2 13.2 0 7.3-5.9 13.2-13.2 13.2H13.9C6.6 60.1.7 54.2.7 46.9c0-7.3 5.9-13.2 13.2-13.2H47z"
									fill="#36C5F0"
								/>
								<path
									d="M99.9 46.9c0-7.3 5.9-13.2 13.2-13.2 7.3 0 13.2 5.9 13.2 13.2 0 7.3-5.9 13.2-13.2 13.2H99.9V46.9zm-6.6 0c0 7.3-5.9 13.2-13.2 13.2-7.3 0-13.2-5.9-13.2-13.2V13.8C66.9 6.5 72.8.6 80.1.6c7.3 0 13.2 5.9 13.2 13.2v33.1z"
									fill="#2EB67D"
								/>
								<path
									d="M80.1 99.8c7.3 0 13.2 5.9 13.2 13.2 0 7.3-5.9 13.2-13.2 13.2-7.3 0-13.2-5.9-13.2-13.2V99.8h13.2zm0-6.6c-7.3 0-13.2-5.9-13.2-13.2 0-7.3 5.9-13.2 13.2-13.2h33.1c7.3 0 13.2 5.9 13.2 13.2 0 7.3-5.9 13.2-13.2 13.2H80.1z"
									fill="#ECB22E"
								/>
							</svg>
						{:else if integration.icon === 'discord'}
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-7 w-7 text-[#5865F2]"
								viewBox="0 0 24 24"
								fill="currentColor"
							>
								<path
									d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"
								/>
							</svg>
						{:else if integration.icon === 'notion'}
							<!-- Notion official logo -->
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-7 w-7"
								viewBox="0 0 100 100"
								fill="none"
							>
								<path
									d="M6.017 4.313l55.333 -4.087c6.797 -0.583 8.543 -0.19 12.817 2.917l17.663 12.443c2.913 2.14 3.883 2.723 3.883 5.053v68.243c0 4.277 -1.553 6.807 -6.99 7.193L24.467 99.967c-4.08 0.193 -6.023 -0.39 -8.16 -3.113L3.3 79.94c-2.333 -3.113 -3.3 -5.443 -3.3 -8.167V11.113c0 -3.497 1.553 -6.413 6.017 -6.8z"
									fill="#fff"
								/>
								<path
									fill-rule="evenodd"
									clip-rule="evenodd"
									d="M61.35 0.227l-55.333 4.087C1.553 4.7 0 7.617 0 11.113v60.66c0 2.723 0.967 5.053 3.3 8.167l13.007 16.913c2.137 2.723 4.08 3.307 8.16 3.113l64.257 -3.89c5.433 -0.387 6.99 -2.917 6.99 -7.193V20.64c0 -2.21 -0.873 -2.847 -3.443 -4.733L74.167 3.143c-4.273 -3.107 -6.02 -3.5 -12.817 -2.917zM25.92 19.523c-5.247 0.353 -6.437 0.433 -9.417 -1.99L8.927 11.507c-0.77 -0.78 -0.383 -1.753 1.557 -1.947l53.193 -3.887c4.467 -0.39 6.793 1.167 8.54 2.527l9.123 6.61c0.39 0.197 1.36 1.36 0.193 1.36l-54.933 3.307 -0.68 0.047zM19.803 88.3V30.367c0 -2.53 0.777 -3.697 3.103 -3.893L86 22.78c2.14 -0.193 3.107 1.167 3.107 3.693v57.547c0 2.53 -0.39 4.67 -3.883 4.863l-60.377 3.5c-3.493 0.193 -5.043 -0.97 -5.043 -4.083zm59.6 -54.827c0.387 1.75 0 3.5 -1.75 3.7l-2.91 0.577v42.773c-2.527 1.36 -4.853 2.137 -6.797 2.137 -3.107 0 -3.883 -0.973 -6.21 -3.887l-19.03 -29.94v28.967l6.02 1.363s0 3.5 -4.857 3.5l-13.39 0.777c-0.39 -0.78 0 -2.723 1.357 -3.11l3.497 -0.97v-38.3L30.48 40.667c-0.39 -1.75 0.58 -4.277 3.3 -4.473l14.367 -0.967 19.8 30.327v-26.83l-5.047 -0.58c-0.39 -2.143 1.163 -3.7 3.103 -3.89l13.4 -0.78z"
									fill="#000"
								/>
							</svg>
						{:else if integration.icon === 'calendar'}
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-7 w-7 text-blue-600"
								viewBox="0 0 24 24"
								fill="currentColor"
							>
								<path
									d="M9 1V3H15V1H17V3H21C21.5523 3 22 3.44772 22 4V20C22 20.5523 21.5523 21 21 21H3C2.44772 21 2 20.5523 2 20V4C2 3.44772 2.44772 3 3 3H7V1H9ZM20 11H4V19H20V11ZM7 5H4V9H20V5H17V7H15V5H9V7H7V5Z"
								/>
							</svg>
						{:else if integration.icon === 'shopify'}
							<!-- Shopify official glyph -->
							<svg xmlns="http://www.w3.org/2000/svg" class="h-7 w-7" viewBox="0 0 109.5 124.5">
								<path
									d="M95.9,23.9c-0.1-0.6-0.6-1-1.1-1c-0.5,0-9.3-0.2-9.3-0.2s-7.4-7.2-8.1-7.9c-0.7-0.7-2.2-0.5-2.7-0.3c0,0-1.4,0.4-3.7,1.1c-0.4-1.3-1-2.8-1.8-4.4c-2.6-5-6.5-7.7-11.1-7.7c0,0,0,0,0,0c-0.3,0-0.6,0-1,0.1c-0.1-0.2-0.3-0.3-0.4-0.5c-2-2.2-4.6-3.2-7.7-3.1c-6,0.2-12,4.5-16.8,12.2c-3.4,5.4-6,12.2-6.8,17.5c-6.9,2.1-11.7,3.6-11.8,3.7c-3.5,1.1-3.6,1.2-4,4.5c-0.3,2.5-9.5,73-9.5,73l76.4,13.2l33.1-8.2C109.5,115.8,96,24.5,95.9,23.9z M67.2,16.8c-1.8,0.5-3.8,1.2-5.9,1.8c0-3-0.4-7.3-1.8-10.9C64,8.6,66.2,13.7,67.2,16.8z M57.2,19.9c-4,1.2-8.4,2.6-12.8,3.9c1.2-4.7,3.6-9.4,6.4-12.5c1.1-1.1,2.6-2.4,4.3-3.2C56.9,11.6,57.3,16.5,57.2,19.9z M49.1,4c1.4,0,2.6,0.3,3.6,0.9C51.1,5.8,49.5,7,48,8.6c-3.8,4.1-6.7,10.5-7.9,16.6c-3.6,1.1-7.2,2.2-10.5,3.2C31.7,18.8,39.8,4.3,49.1,4z"
									fill="#95BF47"
								/>
								<path
									d="M94.8,22.9c-0.5,0-9.3-0.2-9.3-0.2s-7.4-7.2-8.1-7.9c-0.3-0.3-0.6-0.4-1-0.5l0,109.7l33.1-8.2c0,0-13.5-91.3-13.6-92C95.8,23.3,95.3,22.9,94.8,22.9z"
									fill="#5E8E3E"
								/>
								<path
									d="M58,39.9l-3.8,14.4c0,0-4.3-2-9.4-1.6c-7.5,0.5-7.5,5.2-7.5,6.4c0.4,6.4,17.3,7.8,18.3,22.9c0.7,11.9-6.3,20-16.4,20.6c-12.2,0.8-18.9-6.4-18.9-6.4l2.6-11c0,0,6.7,5.1,12.1,4.7c3.5-0.2,4.8-3.1,4.7-5.1c-0.5-8.4-14.3-7.9-15.2-21.7c-0.7-11.6,6.9-23.4,23.7-24.4C54.7,38.2,58,39.9,58,39.9z"
									fill="#fff"
								/>
							</svg>
						{:else if integration.icon === 'microsoft'}
							<!-- Microsoft official logo -->
							<svg xmlns="http://www.w3.org/2000/svg" class="h-7 w-7" viewBox="0 0 23 23">
								<path fill="#f35325" d="M1 1h10v10H1z" />
								<path fill="#81bc06" d="M12 1h10v10H12z" />
								<path fill="#05a6f0" d="M1 12h10v10H1z" />
								<path fill="#ffba08" d="M12 12h10v10H12z" />
							</svg>
						{:else}
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-7 w-7 text-muted-foreground"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="1.5"
							>
								<rect x="3" y="3" width="8" height="8" rx="1" />
								<rect x="13" y="3" width="8" height="8" rx="1" />
								<rect x="3" y="13" width="8" height="8" rx="1" />
								<rect x="13" y="13" width="8" height="8" rx="1" />
							</svg>
						{/if}
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
