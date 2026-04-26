<script lang="ts">
	import { page } from '$app/stores';
	import { resolve } from '$app/paths';
	import { cn } from '$lib/utils.js';

	let { children, data } = $props();

	type OrgRoute =
		| '/organization'
		| '/organization/members'
		| '/organization/security'
		| '/organization/billing'
		| '/organization/shows'
		| '/organization/seasons'
		| '/organization/territories'
		| '/organization/orders'
		| '/organization/taxes'
		| '/organization/shipping'
		| '/organization/returns'
		| '/organization/payments'
		| '/organization/partners'
		| '/organization/contacts'
		| '/organization/agents'
		| '/organization/integrations';

	type NavItem = { label: string; href: OrgRoute; badge?: number };
	type NavGroup = { label: string; pill?: 'new'; items: NavItem[] };

	const navGroups = $derived<NavGroup[]>([
		{
			label: 'General',
			items: [
				{ label: 'Profile', href: '/organization' },
				{
					label: 'Members',
					href: '/organization/members',
					badge: (data.teamCount as number) ?? 0
				},
				{ label: 'Security', href: '/organization/security' },
				{ label: 'Billing', href: '/organization/billing' }
			]
		},
		{
			label: 'Catalog',
			items: [
				{
					label: 'Shows',
					href: '/organization/shows',
					badge: (data.showsCount as number) ?? 0
				},
				{ label: 'Seasons', href: '/organization/seasons' },
				{ label: 'Territories', href: '/organization/territories' }
			]
		},
		{
			label: 'Commerce',
			pill: 'new',
			items: [
				{ label: 'Orders', href: '/organization/orders' },
				{ label: 'Taxes', href: '/organization/taxes' },
				{ label: 'Shipping', href: '/organization/shipping' },
				{ label: 'Returns', href: '/organization/returns' },
				{ label: 'Payments', href: '/organization/payments' }
			]
		},
		{
			label: 'Network',
			items: [
				...(data.orgType === 'brand'
					? [
							{
								label: 'Partners',
								href: '/organization/partners' as const,
								badge: (data.partnersCount as number) ?? 0
							}
						]
					: []),
				{
					label: 'Contacts',
					href: '/organization/contacts' as const,
					badge: (data.contactsCount as number) ?? 0
				}
			]
		},
		{
			label: 'Automation',
			items: [
				{ label: 'Agents (AI)', href: '/organization/agents' },
				{ label: 'Integrations', href: '/organization/integrations' }
			]
		}
	]);

	function isActive(href: string): boolean {
		if (href === '/organization') {
			return $page.url.pathname === '/organization';
		}
		return $page.url.pathname.startsWith(href);
	}

	// Hide org sidebar on detail pages (e.g., /organization/team/[id])
	const detailPaths = [
		'/organization/shows/',
		'/organization/contacts/',
		'/organization/territories/'
	];
	const isDetailView = $derived(
		detailPaths.some((p) => {
			const after = $page.url.pathname.slice(p.length);
			return $page.url.pathname.startsWith(p) && after.length > 0 && !after.startsWith('new');
		})
	);
</script>

{#if isDetailView}
	{@render children?.()}
{:else}
	<div class="space-y-6">
		<div>
			<h1 class="text-3xl">Organization</h1>
			<p class="mt-1 font-mono text-sm text-muted-foreground">
				Manage your business, team, and catalog
			</p>
		</div>

		<div class="flex gap-8">
			<nav class="sticky top-0 w-48 shrink-0 space-y-5 self-start">
				{#each navGroups as group (group.label)}
					<div>
						<div class="mb-1.5 flex items-center gap-2 px-3">
							<span class="text-xs font-medium tracking-wider text-muted-foreground uppercase">
								{group.label}
							</span>
							{#if group.pill === 'new'}
								<span
									class="inline-flex items-center rounded-full bg-foreground px-2 py-0.5 text-xs font-medium text-background"
								>
									New
								</span>
							{/if}
						</div>
						<ul class="space-y-0.5">
							{#each group.items as item (item.href)}
								<li>
									<a
										href={resolve(item.href)}
										class={cn(
											'flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition-colors',
											isActive(item.href)
												? 'bg-muted text-foreground'
												: 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
										)}
									>
										{item.label}
										{#if item.badge}
											<span
												class="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-zinc-100 px-1.5 text-[11px] font-medium text-zinc-600"
												>{item.badge}</span
											>
										{/if}
									</a>
								</li>
							{/each}
						</ul>
					</div>
				{/each}
			</nav>

			<div class="min-w-0 flex-1">
				{@render children?.()}
			</div>
		</div>
	</div>
{/if}
