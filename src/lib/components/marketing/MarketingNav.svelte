<script lang="ts">
	import { page } from '$app/stores';
	import { resolve } from '$app/paths';

	const isAuthenticated = $derived(!!$page.data.session);
</script>

<header>
	<div class="w-full px-8 lg:px-12">
		<nav
			class="fixed z-99 grid w-[calc(100vw-96px)] grid-cols-[auto_1fr_auto] items-center bg-background py-6 transition-all duration-500 ease-in-out"
		>
			<a
				class="flex items-center text-2xl font-semibold tracking-tight text-foreground"
				href={resolve('/')}><span class="-mt-0.5 flex">/</span>Threadline</a
			>

			<div></div>

			<div class="flex items-center justify-end gap-16">
				{#if isAuthenticated}
					<a
						class="bg-foreground px-5 py-2.5 text-sm font-medium text-primary-foreground"
						href={resolve('/insight')}>Insight</a
					>
				{:else}
					<a
						href={resolve('/login')}
						class="hidden text-sm transition-colors hover:text-foreground sm:block">Log In</a
					>
					<a
						class="rounded-lg bg-foreground px-5 py-2.5 text-sm text-primary-foreground"
						href={resolve('/signup')}>Join Beta</a
					>
				{/if}
			</div>
		</nav>
	</div>
</header>
