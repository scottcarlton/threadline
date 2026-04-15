<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { cn } from '$lib/utils.js';
	import type { Organization, OrganizationMember, OrgType } from '$lib/types/database.js';

	type MembershipWithOrg = OrganizationMember & { organizations: Organization };

	type Props = {
		currentOrg: Organization;
		allMemberships: MembershipWithOrg[];
	};

	let { currentOrg, allMemberships }: Props = $props();
	let open = $state(false);

	const hasMultipleOrgs = $derived(allMemberships.length > 1);

	function orgTypeLabel(type: OrgType): string {
		return type === 'brand' ? 'Brand' : 'Rep';
	}

	async function switchOrg(orgId: string) {
		if (orgId === currentOrg.id) {
			open = false;
			return;
		}

		await fetch('/api/org/switch', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ orgId })
		});

		open = false;
		// Full reload to pick up new org context everywhere
		window.location.href = '/insight';
	}
</script>

{#if hasMultipleOrgs}
	<div class="relative px-5 pt-5 pb-3">
		<button
			onclick={() => (open = !open)}
			class="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-accent"
		>
			<div
				class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground"
			>
				{currentOrg.name.charAt(0).toUpperCase()}
			</div>
			<div class="min-w-0 flex-1">
				<p class="truncate text-sm font-semibold">{currentOrg.name}</p>
				<p class="text-sm text-muted-foreground">{orgTypeLabel(currentOrg.org_type)}</p>
			</div>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class={cn(
					'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
					open && 'rotate-180'
				)}
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="2"
			>
				<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
			</svg>
		</button>

		{#if open}
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="fixed inset-0 z-40" onclick={() => (open = false)}></div>
			<div class="absolute right-5 left-5 z-50 mt-1 rounded-lg border bg-popover p-1 shadow-lg">
				{#each allMemberships as m (m.organizations.id)}
					<button
						onclick={() => switchOrg(m.organizations.id)}
						class={cn(
							'flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left transition-colors',
							m.organizations.id === currentOrg.id
								? 'bg-accent text-foreground'
								: 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
						)}
					>
						<div
							class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-sm font-bold text-primary"
						>
							{m.organizations.name.charAt(0).toUpperCase()}
						</div>
						<div class="min-w-0 flex-1">
							<p class="truncate text-sm font-medium">{m.organizations.name}</p>
							<p class="text-sm text-muted-foreground">{orgTypeLabel(m.organizations.org_type)}</p>
						</div>
						{#if m.organizations.id === currentOrg.id}
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-4 w-4 shrink-0 text-primary"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								stroke-width="2.5"
							>
								<path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
							</svg>
						{/if}
					</button>
				{/each}
			</div>
		{/if}
	</div>
{/if}
