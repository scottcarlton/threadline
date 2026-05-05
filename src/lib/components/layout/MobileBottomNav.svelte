<script lang="ts">
	import { page } from '$app/stores';
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { scale } from 'svelte/transition';
	import { cn } from '$lib/utils.js';
	import { unreadCount } from '$lib/stores/unread.js';
	import { orderAttentionCount } from '$lib/stores/orderAttention.js';
	import { upcomingAppointmentCount } from '$lib/stores/appointments.js';
	import { selectedProductIds } from '$lib/stores/productSelection.js';
	import type { UserRole, OrgType } from '$lib/types/database.js';

	type Props = {
		onAiToggle: () => void;
		role: UserRole | null;
		orgType?: OrgType;
		brandScope?: string[] | null;
		isBuyer?: boolean;
		isNxBlsr?: boolean;
		userInitials?: string;
		onSignOut?: () => void;
		onHelp?: () => void;
	};

	let {
		onAiToggle,
		role,
		orgType = 'rep',
		brandScope = null,
		isBuyer = false,
		isNxBlsr = false,
		userInitials = '??',
		onSignOut,
		onHelp
	}: Props = $props();

	const hasProductSelection = $derived($selectedProductIds.length > 0);

	let moreOpen = $state(false);

	const isSales = $derived(role === 'sales');
	const isBrandOrg = $derived(orgType === 'brand');
	const isBrandScoped = $derived(
		isBuyer ||
			(brandScope !== null &&
				brandScope.length > 0 &&
				(role === 'member' || role === 'sales' || role === 'guest'))
	);

	function isActive(href: string): boolean {
		if (href === '/insight' || href === '/dashboard') return $page.url.pathname === href;
		return $page.url.pathname === href || $page.url.pathname.startsWith(href + '/');
	}

	type NavItem = {
		label: string;
		href: string;
		icon: string;
		fill?: boolean;
		viewBox?: string;
		badge?: () => number;
	};

	// --- Tab bar items ---

	const defaultTabs: NavItem[] = [
		{
			label: 'Insight',
			href: '/insight',
			icon: 'M14.2458 10C14.6255 10 14.9393 10.2822 14.9889 10.6482L14.9958 10.75V12.2475C14.9958 13.7083 13.8567 14.9034 12.4177 14.9922L12.2504 14.9975L10.7513 15C10.3371 15.0007 10.0007 14.6655 10 14.2513C9.99936 13.8716 10.281 13.5573 10.647 13.507L10.7487 13.5L12.2479 13.4975C12.8943 13.4964 13.4255 13.0047 13.4893 12.3751L13.4958 12.2475V10.75C13.4958 10.3358 13.8316 10 14.2458 10ZM1.75 10C2.16421 10 2.5 10.3358 2.5 10.75V12.2475C2.5 12.937 3.05836 13.4963 3.74789 13.4975L5.24703 13.5C5.66125 13.5007 5.99646 13.8371 5.99576 14.2513C5.99506 14.6655 5.65871 15.0007 5.2445 15L3.74535 14.9975C2.22839 14.9949 1 13.7644 1 12.2475V10.75C1 10.3358 1.33579 10 1.75 10ZM8 6C9.10457 6 10 6.89543 10 8C10 9.10457 9.10457 10 8 10C6.89543 10 6 9.10457 6 8C6 6.89543 6.89543 6 8 6ZM10.7513 1L12.2504 1.00254C13.7674 1.0051 14.9958 2.23556 14.9958 3.75253V5.25C14.9958 5.66422 14.66 6 14.2458 6C13.8316 6 13.4958 5.66422 13.4958 5.25V3.75253C13.4958 3.063 12.9374 2.5037 12.2479 2.50253L10.7487 2.5C10.3345 2.4993 9.9993 2.16295 10 1.74873C10.0007 1.33452 10.3371 0.999302 10.7513 1ZM5.24873 1C5.66295 0.999303 5.9993 1.33452 6 1.74873C6.0007 2.16295 5.66548 2.4993 5.25127 2.5L3.75212 2.50253C3.06259 2.5037 2.50424 3.063 2.50424 3.75253V5.25C2.50424 5.66422 2.16845 6 1.75424 6C1.34002 6 1.00424 5.66422 1.00424 5.25V3.75253C1.00424 2.23556 2.23262 1.0051 3.74959 1.00254L5.24873 1Z',
			fill: true,
			viewBox: '0 0 16 16'
		},
		{
			label: 'Orders',
			href: '/orders',
			icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
			badge: () => $orderAttentionCount
		},
		{
			label: 'Accounts',
			href: '/accounts',
			icon: 'M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016c.896 0 1.7-.393 2.25-1.016a3.001 3.001 0 003.75.614m-16.5 0a3.004 3.004 0 01-.621-4.72L4.318 3.44A1.5 1.5 0 015.378 3h13.243a1.5 1.5 0 011.06.44l1.19 1.189a3 3 0 01-.621 4.72m-13.5 8.65h3.75a.75.75 0 00.75-.75V13.5a.75.75 0 00-.75-.75H6.75a.75.75 0 00-.75.75v3.75c0 .415.336.75.75.75z'
		}
	];

	const buyerTabs: NavItem[] = [
		{
			label: 'Home',
			href: '/dashboard',
			icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1'
		},
		{
			label: 'Shop',
			href: '/shop',
			icon: 'M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z'
		},
		{
			label: 'Orders',
			href: '/orders',
			icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
			badge: () => $orderAttentionCount
		},
		{
			label: 'Account',
			href: '/account',
			icon: 'M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21'
		}
	];

	const tabs = $derived(isBuyer ? buyerTabs : defaultTabs);

	// --- More menu: grid items (top row with backgrounds) ---

	const allGridItems: NavItem[] = [
		{
			label: 'Brands',
			href: '/brands',
			icon: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10'
		},
		{
			label: 'Products',
			href: '/products',
			icon: 'M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z'
		},
		{
			label: 'Expenses',
			href: '/expenses',
			icon: 'M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z'
		}
	];

	const gridItemLabels = $derived<string[]>(
		isNxBlsr
			? ['Brands', 'Products', 'Expenses']
			: isBrandScoped && !isSales
				? []
				: isSales
					? isBrandOrg
						? ['Products', 'Expenses']
						: ['Expenses']
					: isBrandOrg
						? ['Products', 'Expenses']
						: ['Brands', 'Products', 'Expenses']
	);

	const moreGridItems = $derived(
		allGridItems.filter((item) => gridItemLabels.includes(item.label))
	);

	// --- More menu: list items ---

	const allListItems: NavItem[] = [
		{
			label: 'Reports',
			href: '/reports',
			icon: 'M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z'
		},
		{
			label: 'Inbox',
			href: '/inbox',
			icon: 'M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75',
			badge: () => $unreadCount
		},
		{
			label: 'Appointments',
			href: '/appointments',
			icon: 'M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5',
			badge: () => $upcomingAppointmentCount
		},
		{
			label: 'Workspace',
			href: '/workspace',
			icon: 'M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z'
		},
		{
			label: 'Plan',
			href: '/plan',
			icon: 'M9 6.75V15m6-6v8.25m.503 3.498 4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 0 0-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0Z'
		},
		{
			label: 'Organization',
			href: '/organization',
			icon: 'M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21'
		}
	];

	const listItemLabels = $derived<string[]>(
		isNxBlsr
			? ['Reports', 'Inbox', 'Appointments', 'Workspace', 'Plan', 'Organization']
			: isBrandScoped && !isSales
				? ['Reports']
				: ['Reports', 'Inbox', 'Appointments', 'Workspace', 'Plan', 'Organization']
	);

	const moreListItems = $derived(
		allListItems.filter((item) => listItemLabels.includes(item.label))
	);

	const showMoreMenu = $derived(!isBuyer);
	const hasMoreItems = $derived(moreGridItems.length > 0 || moreListItems.length > 0);

	function handleNavClick() {
		moreOpen = false;
	}
</script>

<!-- More menu backdrop -->
{#if moreOpen && showMoreMenu}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="fixed inset-0 z-40" onclick={() => (moreOpen = false)}></div>
{/if}

<!-- Bottom bar wrapper — shared centering for popup + bar -->
<div class="fixed right-0 bottom-0 left-0 z-40 mx-auto max-w-[480px] px-4 pb-6">
	<!-- More menu popover -->
	{#if moreOpen && showMoreMenu && hasMoreItems}
		<div
			transition:scale={{ duration: 200, start: 0.95, opacity: 0 }}
			class="mr-[4.75rem] mb-3 rounded-2xl bg-zinc-900 p-3 shadow-2xl ring-1 ring-white/10"
		>
			<!-- Utility row: help, settings, user avatar -->
			<div class="mb-2 flex items-center justify-end gap-2">
				<button
					onclick={() => {
						handleNavClick();
						onHelp?.();
					}}
					class="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 transition-colors active:bg-zinc-700"
					aria-label="Help"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-5 w-5"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="1.5"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z"
						/>
					</svg>
				</button>
				<button
					onclick={() => {
						handleNavClick();
						goto(resolve('/settings' as '/orders'));
					}}
					class="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 transition-colors active:bg-zinc-700"
					aria-label="Settings"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-5 w-5"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="1.5"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
						/>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
						/>
					</svg>
				</button>
				<div
					class="flex h-8 w-8 items-center justify-center rounded-full bg-white text-[11px] font-bold text-zinc-900"
				>
					{userInitials}
				</div>
			</div>

			{#if moreGridItems.length > 0}
				<!-- Grid items -->
				<div
					class={cn(
						'grid gap-1',
						moreGridItems.length === 1
							? 'grid-cols-1'
							: moreGridItems.length === 2
								? 'grid-cols-2'
								: 'grid-cols-3'
					)}
				>
					{#each moreGridItems as item (item.href)}
						<a
							href={resolve(item.href as '/products')}
							onclick={handleNavClick}
							class={cn(
								'flex flex-col items-center gap-1.5 rounded-xl bg-zinc-800 px-2 py-3 text-sm transition-colors',
								isActive(item.href) ? 'text-white' : 'text-zinc-300 active:bg-zinc-700'
							)}
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-5 w-5"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								stroke-width="1.5"
							>
								<path stroke-linecap="round" stroke-linejoin="round" d={item.icon} />
							</svg>
							<span>{item.label}</span>
						</a>
					{/each}
				</div>
			{/if}

			{#if moreListItems.length > 0}
				<!-- List items -->
				<div
					class={cn('space-y-1', moreGridItems.length > 0 && 'mt-2 border-t border-white/5 pt-2')}
				>
					{#each moreListItems as item (item.href)}
						<a
							href={resolve(item.href as '/plan')}
							onclick={handleNavClick}
							class={cn(
								'flex items-center gap-3 rounded-xl px-3 py-3 text-sm transition-colors',
								isActive(item.href) ? 'bg-zinc-800 text-white' : 'text-zinc-300 active:bg-zinc-800'
							)}
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-5 w-5 shrink-0"
								fill={item.fill ? 'currentColor' : 'none'}
								viewBox={item.viewBox ?? '0 0 24 24'}
								stroke={item.fill ? 'none' : 'currentColor'}
								stroke-width={item.fill ? 0 : 1.5}
							>
								{#if item.fill}
									<path d={item.icon} />
								{:else}
									<path stroke-linecap="round" stroke-linejoin="round" d={item.icon} />
								{/if}
							</svg>
							<span class="flex-1">{item.label}</span>
							{#if item.badge}
								{@const count = item.badge()}
								{#if count > 0}
									<span
										class="flex h-5 min-w-5 items-center justify-center rounded-full bg-zinc-700 px-1.5 text-[10px] font-bold text-zinc-300"
									>
										{count > 99 ? '99+' : count}
									</span>
								{/if}
							{/if}
						</a>
					{/each}
				</div>
			{/if}

			<!-- Logout — inline at bottom-right of list -->
			{#if onSignOut}
				<div class="mt-1 flex justify-end px-3">
					<button
						onclick={() => {
							onSignOut();
							handleNavClick();
						}}
						class="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 transition-colors active:bg-zinc-700"
						aria-label="Sign out"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-5 w-5"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							stroke-width="1.5"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9"
							/>
						</svg>
					</button>
				</div>
			{/if}
		</div>
	{/if}

	<div class="flex items-stretch gap-3">
		{#if hasProductSelection}
			<!-- Product selection dock -->
			<div class="flex flex-1 items-center justify-between rounded-2xl bg-zinc-900 px-4 py-3">
				<div class="flex flex-col gap-0.5">
					<span class="text-sm font-medium text-white"
						>{$selectedProductIds.length} Items Selected</span
					>
					<button
						class="flex items-center gap-1 text-xs text-zinc-400"
						onclick={() => selectedProductIds.set([])}
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-3.5 w-3.5"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
						>
							<circle cx="12" cy="12" r="10" />
							<path stroke-linecap="round" d="m15 9-6 6m0-6 6 6" />
						</svg>
						Clear Items
					</button>
				</div>
				<button
					class="rounded-xl bg-white px-5 py-2.5 text-sm font-medium text-zinc-900"
					onclick={() => goto(resolve('/products/order'))}
				>
					Start Order
				</button>
			</div>
		{:else}
			<!-- Tab bar -->
			<div class="flex flex-1 items-stretch rounded-2xl bg-zinc-900">
				{#each tabs as tab (tab.href)}
					<a
						href={resolve(tab.href as '/insight')}
						class={cn(
							'flex flex-1 flex-col items-center gap-1 py-3 text-xs transition-colors',
							isActive(tab.href) ? 'text-white' : 'text-zinc-400'
						)}
					>
						<div class="relative">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-5 w-5"
								fill={tab.fill ? 'currentColor' : 'none'}
								viewBox={tab.viewBox ?? '0 0 24 24'}
								stroke={tab.fill ? 'none' : 'currentColor'}
								stroke-width={tab.fill ? 0 : 1.5}
							>
								{#if tab.fill}
									<path d={tab.icon} />
								{:else}
									<path stroke-linecap="round" stroke-linejoin="round" d={tab.icon} />
								{/if}
							</svg>
							{#if tab.badge}
								{@const count = tab.badge()}
								{#if count > 0}
									<span
										class="absolute -top-1.5 -right-2.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-bold text-white"
									>
										{count > 99 ? '99+' : count}
									</span>
								{/if}
							{/if}
						</div>
						<span>{tab.label}</span>
					</a>
				{/each}

				{#if showMoreMenu && hasMoreItems}
					<!-- More button -->
					<button
						onclick={() => (moreOpen = !moreOpen)}
						class={cn(
							'flex flex-1 flex-col items-center gap-1 py-3 text-xs transition-colors',
							moreOpen ? 'text-white' : 'text-zinc-400'
						)}
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-5 w-5"
							fill="currentColor"
							viewBox="0 0 24 24"
						>
							<circle cx="12" cy="5" r="2" />
							<circle cx="12" cy="12" r="2" />
							<circle cx="12" cy="19" r="2" />
						</svg>
						<span>More</span>
					</button>
				{/if}
			</div>
		{/if}

		<!-- AI button -->
		<button
			onclick={onAiToggle}
			class="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-zinc-900 text-zinc-300 transition-transform active:scale-95"
			aria-label="Open Stitch"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-6 w-6"
				viewBox="0 0 24 24"
				fill="currentColor"
			>
				<path
					d="M14 4.4375C15.3462 4.4375 16.4375 3.34619 16.4375 2H17.5625C17.5625 3.34619 18.6538 4.4375 20 4.4375V5.5625C18.6538 5.5625 17.5625 6.65381 17.5625 8H16.4375C16.4375 6.65381 15.3462 5.5625 14 5.5625V4.4375ZM1 11C4.31371 11 7 8.31371 7 5H9C9 8.31371 11.6863 11 15 11V13C11.6863 13 9 15.6863 9 19H7C7 15.6863 4.31371 13 1 13V11ZM4.87601 12C6.18717 12.7276 7.27243 13.8128 8 15.124 8.72757 13.8128 9.81283 12.7276 11.124 12 9.81283 11.2724 8.72757 10.1872 8 8.87601 7.27243 10.1872 6.18717 11.2724 4.87601 12ZM17.25 14C17.25 15.7949 15.7949 17.25 14 17.25V18.75C15.7949 18.75 17.25 20.2051 17.25 22H18.75C18.75 20.2051 20.2051 18.75 22 18.75V17.25C20.2051 17.25 18.75 15.7949 18.75 14H17.25Z"
				/>
			</svg>
		</button>
	</div>
</div>
