<script lang="ts">
	import { onMount } from 'svelte';

	// The service worker serves this page, at the URL the user asked for, when
	// that page cannot load offline (SCO-209). Reloading on reconnect opens it.
	onMount(() => {
		const reload = () => location.reload();
		window.addEventListener('online', reload);
		return () => window.removeEventListener('online', reload);
	});
</script>

<svelte:head><title>Offline · Threadline</title></svelte:head>

<div class="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
	<svg
		xmlns="http://www.w3.org/2000/svg"
		class="mx-auto h-16 w-16 text-foreground"
		fill="none"
		viewBox="0 0 24 24"
		stroke="currentColor"
		stroke-width="0.4"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"
	>
		<line x1="1" y1="1" x2="23" y2="23" />
		<path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
		<path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
		<path d="M10.71 5.05A16 16 0 0 1 22.58 9" />
		<path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
		<path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
		<line x1="12" y1="20" x2="12.01" y2="20" />
	</svg>
	<h1 class="mt-4 text-lg font-semibold">This page needs a connection</h1>
	<p class="mt-2 text-sm text-muted-foreground">It opens on its own when you're back online.</p>
</div>
