<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { Dialog } from 'bits-ui';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input';
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
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-7 w-7 text-green-600"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="1.5"
							>
								<rect x="3" y="3" width="18" height="18" rx="2" />
								<path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
							</svg>
						{:else if integration.icon === 'slack'}
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-7 w-7 text-muted-foreground"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="1.5"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M14.5 2a2.5 2.5 0 00-2.5 2.5V9h4.5A2.5 2.5 0 0014.5 2zM9.5 2A2.5 2.5 0 007 4.5V9h4.5V4.5A2.5 2.5 0 009.5 2z"
								/>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M22 9.5a2.5 2.5 0 00-2.5-2.5H15v4.5a2.5 2.5 0 002.5 2.5H22V9.5zM22 14.5a2.5 2.5 0 01-2.5 2.5H15v-4.5a2.5 2.5 0 012.5-2.5H22v4.5z"
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
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-7 w-7 text-foreground"
								viewBox="0 0 100 100"
								fill="currentColor"
							>
								<path
									d="M6.017 4.313l55.333-4.087c6.797-.583 8.543-.19 12.817 2.917l17.663 12.443c2.913 2.14 3.883 2.723 3.883 5.053v68.243c0 4.277-1.553 6.807-6.99 7.193L24.467 99.967c-4.08.193-6.023-.39-8.16-3.113L3.3 79.94c-2.333-3.113-3.3-5.443-3.3-8.167V11.113c0-3.497 1.553-6.413 6.017-6.8z"
									fill-rule="evenodd"
								/>
								<path
									d="M61.35.227l-55.333 4.087C1.553 4.7 0 7.617 0 11.113v60.66c0 2.723.967 5.053 3.3 8.167l13.007 16.913c2.137 2.723 4.08 3.307 8.16 3.113l64.257-3.89c5.433-.387 6.99-2.917 6.99-7.193V17.64c0-2.21-.873-2.847-3.443-4.733L75.5 1.313C71.233-1.787 69.49-1.173 62.693-.393L61.35.227z"
									fill="#fff"
								/>
								<path
									d="M28.45 16.093c-5.24.307-6.44.377-9.43-1.907L10.54 7.747c-1.55-1.17-2.14-1.557-2.14-2.917 0-1.557 1.36-2.917 4.273-3.113L65.833.637c5.44-.39 8.17 1.557 10.31 3.307l9.7 7c.583.39 2.14 2.723.39 2.723l-56.437 3.25v-.82l-1.35-.003z"
									fill="currentColor"
								/>
								<path
									d="M22.277 87.46V26.327c0-2.723 1.167-4.083 3.693-4.277l61.333-3.5c2.333-.193 3.5 1.36 3.5 4.083v60.74c0 2.723-.39 5.053-3.887 5.247l-58.807 3.5c-3.5.193-5.833-1.167-5.833-4.66zm59.357-56.66c.39 1.75 0 3.5-1.75 3.697l-2.917.583v44.333c-2.527 1.36-4.857 2.14-6.797 2.14-3.11 0-3.887-.973-6.217-3.887l-19.03-29.94v28.967l6.02 1.363s0 3.5-4.857 3.5l-13.39.777c-.39-.78 0-2.723 1.36-3.11l3.497-.943V38.503l-4.857-.39c-.39-1.75.583-4.277 3.307-4.473l14.357-.97 19.803 30.327V35.197l-5.053-.583c-.39-2.143 1.167-3.7 3.113-3.89l14.36-.923z"
									fill="currentColor"
								/>
							</svg>
						{:else if integration.icon === 'shopify'}
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-7 w-7 text-[#95BF47]"
								viewBox="0 0 24 24"
								fill="currentColor"
							>
								<path
									d="M15.337 3.54a.2.2 0 00-.14-.06c-.086 0-1.61.046-1.61.046s-1.268 1.232-1.408 1.37c-.141.141-.417.1-.523.068-.016-.005-.273-.083-.692-.21-.4-1.232-1.112-2.37-2.406-2.37h-.107C7.93 1.796 7.467 1.5 7.07 1.5c-3.06 0-4.52 3.83-4.98 5.78-1.188.367-2.032.63-2.135.66-.664.21-.685.23-.77.854-.065.475-1.802 14.02-1.802 14.02L12.116 24l7.803-1.688S15.36 3.62 15.338 3.54zM9.69 4.87c-.337.104-.72.222-1.137.353 0-.6-.082-1.435-.36-2.15.895.17 1.49 1.19 1.497 1.797zm-1.79-.55c.35.82.43 1.81.43 2.44-.63.19-1.3.4-1.98.61.38-1.46 1.1-2.17 1.55-2.47-.001 0-.001 0 0-.58zm-.72-.68c.08.2.04.57.04.57s-.01 0-.03.01c-.07.02-.17.05-.3.09-.03.01-.05.02-.08.03.1-.38.28-.7.37-.7zM2.72 23.34l-.88-.83L6.82 7.98s1.17-.36 2.78-.85c-.04 3.39.48 8.34 2.73 14.56l-9.61 1.65zm12.21-1.68s-2.57-6.12-2.3-13.58l1.87-.57.84 14.08-.41.07z"
								/>
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
					<Button
						variant="outline"
						size="sm"
						class="w-full border-destructive/50! text-destructive hover:bg-destructive/5 hover:text-destructive"
						onclick={() => disconnect(integration.provider)}
						disabled={disconnecting === integration.provider}
					>
						{disconnecting === integration.provider ? 'Disconnecting...' : 'Disconnect'}
					</Button>
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
