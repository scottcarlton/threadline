<script lang="ts">
	import { page } from '$app/stores';
	import { resolve } from '$app/paths';
	import { cn } from '$lib/utils.js';
	import { isLgUp } from '$lib/utils/viewport.js';
	import { SectionSheet } from '$lib/components/ui/section-sheet/index.js';

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
		// Commerce settings only apply to Brand Orgs. Rep orgs configure
		// commerce per manual brand on /brands/[id] (the Edit Commerce
		// modal); the order resolver branches on the brand's owning
		// org_type. See migration 20260426000001 for the schema split.
		...(data.orgType === 'brand'
			? [
					{
						label: 'Commerce',
						pill: 'new' as const,
						items: [
							{ label: 'Orders', href: '/organization/orders' as const },
							{ label: 'Taxes', href: '/organization/taxes' as const },
							{ label: 'Shipping', href: '/organization/shipping' as const },
							{ label: 'Returns', href: '/organization/returns' as const },
							{ label: 'Payments', href: '/organization/payments' as const }
						]
					}
				]
			: []),
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

	let sheetOpen = $state(false);

	const activeGroupItem = $derived.by(() => {
		for (const g of navGroups) {
			for (const item of g.items) {
				if (isActive(item.href)) return item;
			}
		}
		return null;
	});
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

		{#if $isLgUp}
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
		{:else}
			<button
				onclick={() => (sheetOpen = true)}
				class="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2.5 text-sm font-medium hover:bg-muted"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-4 w-4"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
				>
					<line x1="3" y1="6" x2="21" y2="6" />
					<line x1="3" y1="12" x2="21" y2="12" />
					<line x1="3" y1="18" x2="21" y2="18" />
				</svg>
				<span>Sections{activeGroupItem ? ` · ${activeGroupItem.label}` : ''}</span>
			</button>

			<div class="mt-6">
				{@render children?.()}
			</div>

			<SectionSheet
				open={sheetOpen}
				groups={navGroups}
				activeHref={$page.url.pathname}
				onclose={() => (sheetOpen = false)}
				onnavigate={() => (sheetOpen = false)}
			/>
		{/if}
	</div>
{/if}
