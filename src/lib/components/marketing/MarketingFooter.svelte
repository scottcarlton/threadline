<script lang="ts">
	import { resolve } from '$app/paths';
</script>

<footer class="overflow-hidden">
	<div class="px-5 pt-16 sm:px-8 sm:pt-24 lg:px-12">
		<div class="mb-10 flex h-10 w-10 items-center justify-center bg-foreground">
			<img src="/logos/mark_dark.svg" alt="Threadline" class="h-6 w-6" />
		</div>

		<p class="max-w-sm font-mono text-sm leading-relaxed text-muted-foreground">
			An agentic first systems company helping brands and multi-brand sales representatives find
			gaps and turn signals into sales.
		</p>

		<div class="mt-14 flex items-center gap-6 font-mono text-sm text-muted-foreground">
			<a
				href="https://www.linkedin.com/company/usethreadline/"
				target="_blank"
				rel="noopener noreferrer"
				class="transition-colors hover:text-foreground">linkedin</a
			>
			<a
				href="https://x.com/usethreadline"
				target="_blank"
				rel="noopener noreferrer"
				class="transition-colors hover:text-foreground">x.com</a
			>
			<a
				href="https://instagram.com"
				target="_blank"
				rel="noopener noreferrer"
				class="transition-colors hover:text-foreground">instagram</a
			>
		</div>

		<div
			class="mt-14 flex flex-wrap items-center gap-4 font-mono text-sm text-muted-foreground sm:gap-8"
		>
			<span>&copy;2026 Threadline Systems</span>
			<a href={resolve('/legal/terms')} class="transition-colors hover:text-foreground"
				>Terms of Use</a
			>
			<a href={resolve('/legal/privacy')} class="transition-colors hover:text-foreground"
				>Privacy Policy</a
			>
		</div>

		<span class="mt-16 -mb-[3%] block text-[clamp(1rem,17.5dvw,60dvw)] leading-none font-medium"
			>/Threadline</span
		>
	</div>
</footer>
