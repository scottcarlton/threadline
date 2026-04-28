<script lang="ts">
	import { isOnline } from '$lib/stores/pwa.js';
</script>

{#if !$isOnline}
	<div
		role="status"
		aria-live="polite"
		class="flex items-center justify-center gap-2 bg-muted px-4 py-2 text-sm text-muted-foreground"
	>
		<svg
			xmlns="http://www.w3.org/2000/svg"
			class="h-4 w-4"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
		>
			<line x1="1" y1="1" x2="23" y2="23" />
			<path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
			<path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
			<path d="M10.71 5.05A16 16 0 0 1 22.58 9" />
			<path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
			<path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
			<line x1="12" y1="20" x2="12.01" y2="20" />
		</svg>
		<span>You're offline. Showing the last loaded data.</span>
	</div>
{/if}
