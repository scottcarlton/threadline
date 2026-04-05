<script lang="ts">
	import { goto } from '$app/navigation';
	import { supabase } from '$lib/supabase.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Avatar, AvatarFallback } from '$lib/components/ui/avatar/index.js';
	import type { Profile, Organization } from '$lib/types/database.js';

	type Props = {
		user: Profile | null;
		organization: Organization | null;
		onsidebarToggle: () => void;
	};

	let { user, organization, onsidebarToggle }: Props = $props();
	let showUserMenu = $state(false);

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

<header class="flex h-16 items-center justify-between border-b bg-background px-4">
	<div class="flex items-center gap-4">
		<!-- Mobile sidebar toggle -->
		<button onclick={onsidebarToggle} class="lg:hidden" aria-label="Toggle sidebar">
			<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
				<path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h16" />
			</svg>
		</button>
		{#if organization}
			<span class="text-sm font-medium text-muted-foreground">{organization.name}</span>
		{/if}
	</div>

	<div class="flex items-center gap-3">
		<!-- AI Assistant toggle (placeholder) -->
		<Button variant="outline" size="sm">
			<svg xmlns="http://www.w3.org/2000/svg" class="mr-1 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
				<path stroke-linecap="round" stroke-linejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
			</svg>
			AI Assistant
		</Button>

		<!-- User menu -->
		<div class="relative">
			<button
				onclick={() => (showUserMenu = !showUserMenu)}
				class="flex items-center gap-2 rounded-md p-1 hover:bg-accent"
			>
				<Avatar class="h-8 w-8">
					<AvatarFallback class="text-xs">
						{user ? getInitials(user.display_name) : '??'}
					</AvatarFallback>
				</Avatar>
			</button>

			{#if showUserMenu}
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="fixed inset-0 z-40"
					onclick={() => (showUserMenu = false)}
				></div>
				<div class="absolute right-0 z-50 mt-2 w-56 rounded-md border bg-popover p-1 shadow-lg">
					<div class="px-3 py-2 text-sm">
						<p class="font-medium">{user?.display_name}</p>
						<p class="text-muted-foreground">
							{user?.display_name}
						</p>
					</div>
					<div class="my-1 h-px bg-border"></div>
					<button
						class="flex w-full items-center rounded-sm px-3 py-2 text-sm hover:bg-accent"
						onclick={signOut}
					>
						Sign out
					</button>
				</div>
			{/if}
		</div>
	</div>
</header>
