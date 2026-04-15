<script lang="ts">
	import { page } from '$app/stores';
	import { cn } from '$lib/utils.js';

	let { children, data } = $props();
	const navItems = $derived([
		{ label: 'Profile', href: '/organization' },
		{ label: 'Members', href: '/organization/members', badge: (data.teamCount as number) ?? 0 },
		{
			label: 'Contacts',
			href: '/organization/contacts',
			badge: (data.contactsCount as number) ?? 0
		},
		{ label: 'Shows', href: '/organization/shows', badge: (data.showsCount as number) ?? 0 },
		{ label: 'Seasons', href: '/organization/seasons' },
		{
			label: 'Territories',
			href: '/organization/territories',
			badge: (data.territoriesCount as number) ?? 0
		},
		{ label: 'Billing', href: '/organization/billing' },
		{ label: 'Agents (AI)', href: '/organization/agents' },
		{ label: 'Integrations', href: '/organization/integrations' },
		{ label: 'Security', href: '/organization/security' }
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
			<nav class="sticky top-0 w-48 shrink-0 self-start">
				<ul class="space-y-0.5">
					{#each navItems as item}
						<li>
							<a
								href={item.href}
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
			</nav>

			<div class="min-w-0 flex-1">
				{@render children?.()}
			</div>
		</div>
	</div>
{/if}
