<script lang="ts">
	import { page } from '$app/stores';
	import { resolve } from '$app/paths';

	const isAuthenticated = $derived(!!$page.data.session);
	const isBeta = $derived($page.url.hostname === 'beta.threadline.systems');
</script>

<header>
	<div class="w-full px-5 sm:px-8 lg:px-12">
		<nav
			class="fixed z-99 grid w-[calc(100vw-40px)] grid-cols-[auto_1fr_auto] items-center bg-background py-4 transition-all duration-500 ease-in-out sm:w-[calc(100vw-64px)] sm:py-6 lg:w-[calc(100vw-96px)]"
		>
			<a
				class="flex items-center text-xl font-semibold tracking-tight text-foreground sm:text-2xl"
				href={resolve('/')}><span class="-mt-0.5 flex">/</span>Threadline</a
			>

			<div></div>

			<div class="flex items-center justify-end gap-4 sm:gap-8 md:gap-16">
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
						href={resolve(isBeta ? '/beta' : '/signup')}>Join Beta</a
					>
				{/if}
			</div>
		</nav>
	</div>
</header>
