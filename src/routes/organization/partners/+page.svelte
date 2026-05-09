<script lang="ts">
	import AddPartnerModal from '$lib/components/partners/AddPartnerModal.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import type { ConnectedRep } from '$lib/server/federation.js';

	let { data } = $props();

	const connectedReps = $derived((data.connectedReps ?? []) as ConnectedRep[]);
	const activeConnectedReps = $derived(connectedReps.filter((c) => c.status === 'active'));

	let showAddPartner = $state(false);

	const fmt = new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD',
		maximumFractionDigits: 0
	});
</script>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h2 class="text-lg font-semibold">Partners</h2>
			<p class="mt-0.5 text-sm text-muted-foreground">
				Connect to independent sales reps across Threadline Systems.
			</p>
		</div>
		{#if data.isAdmin}
			<Button size="sm" onclick={() => (showAddPartner = true)}>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="-ml-1 h-4 w-4"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="2"
				>
					<path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
				</svg>
				Add Partner
			</Button>
		{/if}
	</div>

	<div class="min-w-0 space-y-6">
		{#if activeConnectedReps.length === 0}
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
				<h3 class="mt-4 text-base font-semibold">Partner with independent sales reps</h3>
				<p class="mt-1 text-sm text-muted-foreground">
					Send an invite link to connect with rep agencies who sell your brand.
				</p>
			</div>
		{:else}
			<div class="space-y-2">
				{#each activeConnectedReps as conn (conn.connection_id)}
					<div class="flex items-center justify-between rounded-none border bg-card px-5 py-4">
						<div class="flex items-center gap-3">
							<div
								class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-500/10 text-sm font-bold text-blue-600"
							>
								{conn.rep_org_name.charAt(0).toUpperCase()}
							</div>
							<div>
								<p class="text-sm font-medium">{conn.rep_org_name}</p>
								<p class="text-sm text-muted-foreground">
									{conn.order_count} order{conn.order_count !== 1 ? 's' : ''} · {fmt.format(
										conn.revenue
									)}
									{#if conn.commission_rate}
										· {conn.commission_rate}% commission
									{/if}
									{#if conn.connected_at}
										· Connected {new Date(conn.connected_at).toLocaleDateString()}
									{/if}
								</p>
							</div>
						</div>
						<span
							class="inline-flex rounded-full bg-blue-500/10 px-1.5 py-0.5 text-sm font-normal text-blue-600 dark:text-blue-400"
							>Connected</span
						>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>

{#if data.isAdmin}
	<AddPartnerModal
		bind:open={showAddPartner}
		emailForm={data.inviteEmailForm}
		defaultCommissionRate={data.defaultCommissionRate}
		territories={data.territories ?? []}
		onOpenChange={(v) => (showAddPartner = v)}
	/>
{/if}
