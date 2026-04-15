<script lang="ts">
	import { goto } from '$app/navigation';
	import { supabase } from '$lib/supabase.js';
	import { Avatar, AvatarFallback } from '$lib/components/ui/avatar/index.js';
	import { cart } from '$lib/stores/cart.js';
	import {
		notifications,
		unreadNotificationCount,
		markAsRead,
		markAllAsRead
	} from '$lib/stores/notifications.js';
	import type { Profile, Organization, UserRole } from '$lib/types/database.js';

	type Props = {
		user: Profile | null;
		organization: Organization | null;
		orgDisplayName: string;
		sidebarOpen: boolean;
		showTeam?: boolean;
		role?: UserRole | null;
		isBuyer?: boolean;
		onsidebarToggle: () => void;
	};

	let {
		user,
		organization,
		orgDisplayName,
		sidebarOpen,
		showTeam = true,
		role = null,
		isBuyer = false,
		onsidebarToggle
	}: Props = $props();
	const cartCount = $derived($cart.length);

	function roleLabel(r: UserRole): string {
		return r.charAt(0).toUpperCase() + r.slice(1);
	}
	let showUserMenu = $state(false);
	let showNotifications = $state(false);
	const notifCount = $derived($unreadNotificationCount);
	const notifItems = $derived($notifications);

	function getInitials(name: string): string {
		return name
			.split(' ')
			.map((w) => w[0])
			.join('')
			.toUpperCase()
			.slice(0, 2);
	}

	async function signOut() {
		await supabase.auth.signOut();
		goto('/login');
	}
</script>

<header class="flex h-14 items-center justify-between bg-background px-5">
	<div class="flex items-center gap-3">
		<button
			onclick={onsidebarToggle}
			class="cursor-pointer rounded-lg p-1.5 text-muted-foreground transition-all duration-200 hover:bg-accent hover:text-foreground active:scale-95"
			aria-label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-5 w-5"
				viewBox="0 0 24 24"
				fill="currentColor"
			>
				{#if sidebarOpen}
					<path
						d="M21 3a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h18Zm-1 2H9v14h11V5ZM7 5H4v14h3V5Zm6 4v6l-3-3 3-3Z"
					/>
				{:else}
					<path
						d="M21 3a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h18Zm-1 2H9v14h11V5ZM7 5H4v14h3V5Zm4 4 3 3-3 3v-6Z"
					/>
				{/if}
			</svg>
		</button>
		<div class="flex items-center gap-2">
			<div
				class="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-xs font-bold text-primary-foreground"
			>
				{orgDisplayName.charAt(0).toUpperCase()}
			</div>
			<div class="hidden flex-col sm:flex">
				<span class="text-sm leading-tight font-semibold">{orgDisplayName}</span>
				<span
					class="font-mono text-[10px] text-muted-foreground text-zinc-500 dark:text-muted-foreground"
					>Powered by Threadline</span
				>
			</div>
		</div>
	</div>

	<div class="flex items-center gap-2">
		<button
			onclick={() => {
				window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }));
			}}
			class="flex items-center rounded-lg p-2 text-muted-foreground transition-all duration-200 hover:bg-accent hover:text-foreground active:scale-95"
			aria-label="Search"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-5 w-5"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="2"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
				/>
			</svg>
		</button>

		<!-- Notifications -->
		<div class="relative">
			<button
				onclick={() => (showNotifications = !showNotifications)}
				class="relative flex items-center rounded-lg p-2 text-muted-foreground transition-all duration-200 hover:bg-accent hover:text-foreground active:scale-95"
				aria-label="Notifications"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-5 w-5"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="2"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
					/>
				</svg>
				{#if notifCount > 0}
					<span
						class="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white"
						>{notifCount > 99 ? '99+' : notifCount}</span
					>
				{/if}
			</button>

			{#if showNotifications}
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div class="fixed inset-0 z-40" onclick={() => (showNotifications = false)}></div>
				<div class="absolute right-0 z-50 mt-1 w-80 rounded-lg border bg-popover shadow-lg">
					<div class="flex items-center justify-between border-b px-4 py-3">
						<span class="text-sm font-semibold">Notifications</span>
						{#if notifCount > 0}
							<button
								class="text-sm text-muted-foreground hover:text-foreground"
								onclick={() => markAllAsRead()}
							>
								Mark all read
							</button>
						{/if}
					</div>
					<div class="max-h-80 overflow-y-auto">
						{#if notifItems.length === 0}
							<div class="px-4 py-8 text-center">
								<p class="text-sm text-muted-foreground">No notifications yet</p>
							</div>
						{:else}
							{#each notifItems as notif (notif.id)}
								<a
									href={notif.link ?? '#'}
									class="flex gap-3 px-4 py-3 transition-colors hover:bg-muted/50 {notif.read_at
										? 'opacity-60'
										: ''}"
									onclick={() => {
										markAsRead(notif.id);
										showNotifications = false;
									}}
								>
									{#if !notif.read_at}
										<div class="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary"></div>
									{:else}
										<div class="mt-1.5 h-2 w-2 shrink-0"></div>
									{/if}
									<div class="min-w-0 flex-1">
										<p class="text-sm font-medium">{notif.title}</p>
										{#if notif.body}
											<p class="truncate text-sm text-muted-foreground">{notif.body}</p>
										{/if}
										<p class="mt-0.5 text-sm text-muted-foreground">
											{new Date(notif.created_at).toLocaleDateString('en-US', {
												month: 'short',
												day: 'numeric',
												hour: 'numeric',
												minute: '2-digit'
											})}
										</p>
									</div>
								</a>
							{/each}
						{/if}
					</div>
				</div>
			{/if}
		</div>

		{#if isBuyer}
			<a
				href="/shop/cart"
				class="relative flex items-center rounded-lg p-2 text-muted-foreground transition-all duration-200 hover:bg-accent hover:text-foreground active:scale-95"
				aria-label="Cart"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-5 w-5"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="2"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
					/>
				</svg>
				{#if cartCount > 0}
					<span
						class="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground"
						>{cartCount > 99 ? '99+' : cartCount}</span
					>
				{/if}
			</a>
		{/if}

		<div class="relative">
			<button
				onclick={() => (showUserMenu = !showUserMenu)}
				class="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-all duration-200 hover:bg-accent active:scale-[0.98]"
			>
				<Avatar class="h-8 w-8">
					<AvatarFallback class="bg-primary text-[11px] font-semibold text-primary-foreground">
						{user ? getInitials(user.display_name) : '??'}
					</AvatarFallback>
				</Avatar>
				{#if user}
					<div class="hidden flex-col items-start leading-tight sm:flex">
						<span class="text-sm font-medium">{user.display_name}</span>
						{#if role}
							<span class="font-mono text-[11px] text-muted-foreground">{roleLabel(role)}</span>
						{/if}
					</div>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="hidden h-4 w-4 text-muted-foreground sm:block"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="2"
					>
						<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
					</svg>
				{/if}
			</button>

			{#if showUserMenu}
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div class="fixed inset-0 z-40" onclick={() => (showUserMenu = false)}></div>
				<div
					class="animate-in absolute right-0 z-50 mt-1 w-64 rounded-none border bg-popover p-1.5 shadow-lg"
				>
					<a
						href="/settings"
						class="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-accent"
						onclick={() => (showUserMenu = false)}
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-5 w-5 text-muted-foreground"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							stroke-width="1.5"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
							/>
						</svg>
						<div>
							<p class="text-sm font-medium">Profile</p>
							<p class="text-xs text-muted-foreground">View and edit your information</p>
						</div>
					</a>
					{#if showTeam}
						<a
							href="/organization/members"
							class="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-accent"
							onclick={() => (showUserMenu = false)}
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-5 w-5 text-muted-foreground"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								stroke-width="1.5"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z"
								/>
							</svg>
							<div>
								<p class="text-sm font-medium">Members</p>
								<p class="text-xs text-muted-foreground">Manage members</p>
							</div>
						</a>
					{/if}
					<div class="mx-2 my-1.5 h-px bg-border"></div>
					<button
						class="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-accent"
						onclick={signOut}
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-5 w-5 text-red-500"
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
						<span class="text-sm font-medium text-red-500">Sign out</span>
					</button>
				</div>
			{/if}
		</div>
	</div>
</header>
