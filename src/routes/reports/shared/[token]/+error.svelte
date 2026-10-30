<script lang="ts">
	// One state for every link that cannot be shown: unknown, revoked or
	// expired look the same on purpose (SCO-151).
</script>

<svelte:head>
	<title>Link unavailable · Threadline</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-center">
	<svg
		xmlns="http://www.w3.org/2000/svg"
		class="mx-auto h-16 w-16 text-foreground"
		fill="none"
		viewBox="0 0 24 24"
		stroke="currentColor"
		stroke-width="0.4"
		aria-hidden="true"
	>
		<path
			stroke-linecap="round"
			stroke-linejoin="round"
			d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
		/>
	</svg>
	<h1 class="mt-4 text-lg font-semibold">This link is no longer available</h1>
	<p class="mt-2 text-sm text-muted-foreground">
		It may have expired or been revoked. Ask whoever shared it for a new one.
	</p>
</div>
