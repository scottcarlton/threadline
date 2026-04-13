<script lang="ts">
	import { page } from '$app/stores';
	import { onMount } from 'svelte';

	const isAuthenticated = $derived(!!$page.data.session);
	let navScrolled = $state(false);

	onMount(() => {
		const handler = () => {
			navScrolled = window.scrollY > 40;
		};
		window.addEventListener('scroll', handler, { passive: true });
		return () => window.removeEventListener('scroll', handler);
	});
</script>

<header>
	<div class="w-full px-8 lg:px-12">
		<nav
			class="fixed top-6 z-99 grid grid-cols-3 items-center bg-background py-6 transition-all duration-500 ease-in-out {navScrolled
				? 'w-[calc(100vw-96px)] px-6 shadow-sm'
				: 'w-[calc(100vw-96px)] px-0'}"
		>
			<a class="text-2xl font-semibold tracking-tight text-foreground" href="/">/Threadline</a>

			<div class="flex items-center justify-center gap-8 font-mono">
				<a
					href="/features"
					class="px-4 py-3 text-sm transition-colors hover:bg-neutral-100 hover:text-foreground"
					>Features</a
				>
				<a
					href="/intelligence"
					class="px-4 py-3 text-sm transition-colors hover:bg-neutral-100 hover:text-foreground"
					>Intelligence</a
				>
				<a
					href="/solutions"
					class="px-4 py-3 text-sm transition-colors hover:bg-neutral-100 hover:text-foreground"
					>Solutions</a
				>
				<a
					href="/pricing"
					class="px-4 py-3 text-sm transition-colors hover:bg-neutral-100 hover:text-foreground"
					>Pricing</a
				>
			</div>

			<div class="flex items-center justify-end gap-16">
				{#if isAuthenticated}
					<a
						class="bg-foreground px-5 py-2.5 text-sm font-medium text-primary-foreground"
						href="/insight">Insight</a
					>
				{:else}
					<a href="/login" class="hidden text-sm transition-colors hover:text-foreground sm:block"
						>Log In</a
					>
					<a class="bg-foreground px-5 py-2.5 text-sm text-primary-foreground" href="/signup"
						>Early Access</a
					>
				{/if}
			</div>
		</nav>
	</div>
</header>
