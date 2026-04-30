<script lang="ts">
	type Props = { title: string; subtitle: string };
	let { title, subtitle }: Props = $props();
</script>

<div class="mx-auto max-w-3xl px-4 py-10">
	<header class="mb-8">
		<p class="font-mono text-sm text-muted-foreground">System</p>
		<h1 class="mt-1 text-3xl font-semibold">{title}</h1>
	</header>

	<div class="p-12 text-center">
		<svg
			xmlns="http://www.w3.org/2000/svg"
			class="mx-auto h-16 w-16 text-foreground"
			fill="none"
			viewBox="0 0 24 24"
			stroke="currentColor"
			stroke-width="0.4"
		>
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
			/>
		</svg>
		<p class="mt-4 text-lg font-semibold">{title} coming soon</p>
		<p class="mt-2 text-sm text-muted-foreground">{subtitle}</p>
	</div>
</div>
