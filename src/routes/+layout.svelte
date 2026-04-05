<script lang="ts">
	import '../app.css';
	import { page } from '$app/stores';
	import Sidebar from '$lib/components/layout/sidebar.svelte';
	import Navbar from '$lib/components/layout/navbar.svelte';
	import AssistantPanel from '$lib/components/ai/AssistantPanel.svelte';

	let { children, data } = $props();

	// Auth routes use their own layout
	const isAuthRoute = $derived(
		$page.url.pathname.startsWith('/login') ||
		$page.url.pathname.startsWith('/signup') ||
		$page.url.pathname.startsWith('/invite')
	);

	let sidebarCollapsed = $state(false);
	let assistantOpen = $state(false);
</script>

{#if isAuthRoute}
	{@render children()}
{:else}
	<div class="flex h-screen overflow-hidden">
		<Sidebar
			collapsed={sidebarCollapsed}
			ontoggle={() => (sidebarCollapsed = !sidebarCollapsed)}
			role={data.membership?.role ?? 'guest'}
		/>
		<div class="flex flex-1 flex-col overflow-hidden">
			<Navbar
				user={data.user}
				organization={data.organization}
				onsidebarToggle={() => (sidebarCollapsed = !sidebarCollapsed)}
				onassistantToggle={() => (assistantOpen = !assistantOpen)}
			/>
			<main class="flex-1 overflow-y-auto p-6">
				{@render children()}
			</main>
		</div>
	</div>

	<AssistantPanel
		open={assistantOpen}
		ontoggle={() => (assistantOpen = !assistantOpen)}
		role={data.membership?.role ?? 'guest'}
	/>
{/if}
