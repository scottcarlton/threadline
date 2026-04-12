<script lang="ts">
	import { page } from '$app/stores';
	import { onMount } from 'svelte';

	const isAuthenticated = $derived(!!$page.data.session);
	let navScrolled = $state(false);

	onMount(() => {
		const handler = () => { navScrolled = window.scrollY > 40; };
		window.addEventListener('scroll', handler, { passive: true });
		return () => window.removeEventListener('scroll', handler);
	});
</script>

<header>
	<div class="px-8 lg:px-12 w-full">
		<nav class="fixed top-6 z-99 grid grid-cols-3 items-center py-6 bg-background transition-all duration-500 ease-in-out {navScrolled ? 'w-[calc(100vw-96px)] px-6 shadow-sm' : 'w-[calc(100vw-96px)] px-0'}">
			<a class="text-2xl font-semibold tracking-tight text-foreground" href="/">/Threadline</a>

			<div class="flex justify-center items-center gap-8 font-mono">
				<a href="/features" class="px-4 py-3 text-sm transition-colors hover:text-foreground hover:bg-neutral-100">Features</a>
				<a href="/intelligence" class="px-4 py-3 text-sm transition-colors hover:text-foreground hover:bg-neutral-100">Intelligence</a>
				<a href="/solutions" class="px-4 py-3 text-sm transition-colors hover:text-foreground hover:bg-neutral-100">Solutions</a>
				<a href="/pricing" class="px-4 py-3 text-sm transition-colors hover:text-foreground hover:bg-neutral-100">Pricing</a>
			</div>

			<div class="flex justify-end items-center gap-16">
				{#if isAuthenticated}
					<a class="bg-foreground text-primary-foreground px-5 py-2.5 text-sm font-medium" href="/insight">Insight</a>
				{:else}
					<a href="/login" class="hidden sm:block text-sm transition-colors hover:text-foreground">Log In</a>
					<a class="bg-foreground text-primary-foreground px-5 py-2.5 text-sm" href="/signup">Early Access</a>
				{/if}
			</div>
		</nav>
	</div>
</header>
