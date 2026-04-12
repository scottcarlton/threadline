<script lang="ts">
	import '../../app.css';
	let { children } = $props();
</script>

<div class="flex min-h-screen">
	<!-- Left: Image panel -->
	<div class="hidden lg:flex lg:w-1/2 relative bg-zinc-900">
		<img
			src="/auth-bg.jpg"
			alt=""
			class="absolute inset-0 h-full w-full object-cover opacity-80"
		/>
		<div class="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20"></div>
		<div class="relative mt-auto p-10">
			<blockquote class="space-y-3">
				<p class="text-lg font-medium text-white leading-relaxed">"Threadline changed how we manage our brands. Orders, commissions, accounts — all in one place."</p>
				<footer class="text-sm text-white/70">
					<span class="font-medium text-white">Independent Sales Rep</span>
				</footer>
			</blockquote>
		</div>
	</div>

	<!-- Right: Auth form -->
	<div class="flex w-full items-center justify-center px-6 lg:w-1/2">
		<div class="w-full max-w-sm">
			<div class="mb-10 text-center">
				<div class="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-none bg-primary text-lg font-light italic text-primary-foreground">/</div>
			</div>
			{@render children()}
		</div>
	</div>
</div>
