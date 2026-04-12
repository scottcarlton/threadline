<script lang="ts">
	import MarketingNav from '$lib/components/marketing/MarketingNav.svelte';
	import MarketingFooter from '$lib/components/marketing/MarketingFooter.svelte';
</script>

<svelte:head>
	<title>Intelligence — Threadline</title>
</svelte:head>

<div>
	<MarketingNav />
	<main>
		<div>
			<section>
				<div class="px-8 pt-72 pb-24">
					<div class="grid gap-8 max-w-220">
						<span class="font-mono">[Intelligence]</span>
						<h1 class="text-6xl">Stitches — your smartest rep never sleeps.</h1>
						<p class="text-lg text-foreground/60 max-w-160">Stitches is Threadline's AI engine. It watches your entire book of business and tells you what to do next — in plain English.</p>
					</div>
				</div>
			</section>
			<section>
				<div class="px-8 py-24 grid gap-8">
					<div class="bg-black h-140 rounded-4xl"></div>
				</div>
			</section>
			<section>
				<div class="px-8 py-24 grid gap-8">
					<div class="grid gap-8 max-w-220 text-center mx-auto">
						<span class="font-mono">What Stitches Does</span>
						<h2 class="text-4xl">Cross-brand intelligence no single platform can see</h2>
					</div>
					<ul class="grid grid-cols-3 gap-4">
						<li class="grid grid-rows-[16px_1fr_16px]">
							<div class="grid grid-cols-[16px_1fr_16px] gap-4">
								<div class="w-4 h-4 border-foreground border-t border-l"></div>
								<div class="w-full h-1 border-foreground border-t"></div>
								<div class="w-4 h-4 border-foreground border-t border-r"></div>
							</div>
							<div class="grid grid-cols-[1px_1fr_1px] gap-4">
								<div class="h-[calc(100%-32px)] border-l border-foreground self-center"></div>
								<div class="grid grid-rows-[48px_auto_1fr] gap-4 items-start p-4">
									<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.25"><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="10"/></svg>
									<h3 class="text-2xl">Pattern Recognition</h3>
									<p>Surfaces cross-brand patterns, buyer behavior, and territory opportunities unique to your portfolio.</p>
								</div>
								<div class="h-[calc(100%-32px)] border-r border-foreground self-center"></div>
							</div>
							<div class="grid grid-cols-[16px_1fr_16px] gap-4 self-end">
								<div class="w-4 h-4 border-foreground border-b border-l"></div>
								<div class="w-full h-full border-foreground border-b"></div>
								<div class="w-4 h-4 border-foreground border-b border-r"></div>
							</div>
						</li>
						<li class="grid grid-rows-[16px_1fr_16px]">
							<div class="grid grid-cols-[16px_1fr_16px] gap-4">
								<div class="w-4 h-4 border-foreground border-t border-l"></div>
								<div class="w-full h-1 border-foreground border-t"></div>
								<div class="w-4 h-4 border-foreground border-t border-r"></div>
							</div>
							<div class="grid grid-cols-[1px_1fr_1px] gap-4">
								<div class="h-[calc(100%-32px)] border-l border-foreground self-center"></div>
								<div class="grid grid-rows-[48px_auto_1fr] gap-4 items-start p-4">
									<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.25"><path d="M2 20L6 16L10 18L14 10L18 13L22 4"/><circle cx="22" cy="4" r="1.5"/><circle cx="2" cy="20" r="1.5"/></svg>
									<h3 class="text-2xl">Predictive Signals</h3>
									<p>Reorder predictions, churn risk detection, and buyer engagement scoring — before you ask.</p>
								</div>
								<div class="h-[calc(100%-32px)] border-r border-foreground self-center"></div>
							</div>
							<div class="grid grid-cols-[16px_1fr_16px] gap-4 self-end">
								<div class="w-4 h-4 border-foreground border-b border-l"></div>
								<div class="w-full h-full border-foreground border-b"></div>
								<div class="w-4 h-4 border-foreground border-b border-r"></div>
							</div>
						</li>
						<li class="grid grid-rows-[16px_1fr_16px]">
							<div class="grid grid-cols-[16px_1fr_16px] gap-4">
								<div class="w-4 h-4 border-foreground border-t border-l"></div>
								<div class="w-full h-1 border-foreground border-t"></div>
								<div class="w-4 h-4 border-foreground border-t border-r"></div>
							</div>
							<div class="grid grid-cols-[1px_1fr_1px] gap-4">
								<div class="h-[calc(100%-32px)] border-l border-foreground self-center"></div>
								<div class="grid grid-rows-[48px_auto_1fr] gap-4 items-start p-4">
									<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.25"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M8 10h.01"/><path d="M12 10h.01"/><path d="M16 10h.01"/></svg>
									<h3 class="text-2xl">Natural Language</h3>
									<p>Ask anything about your business in plain English. Revenue breakdowns, account health, follow-up suggestions.</p>
								</div>
								<div class="h-[calc(100%-32px)] border-r border-foreground self-center"></div>
							</div>
							<div class="grid grid-cols-[16px_1fr_16px] gap-4 self-end">
								<div class="w-4 h-4 border-foreground border-b border-l"></div>
								<div class="w-full h-full border-foreground border-b"></div>
								<div class="w-4 h-4 border-foreground border-b border-r"></div>
							</div>
						</li>
					</ul>
				</div>
			</section>
			<section>
				<div class="px-8 py-24 grid gap-8">
					<div class="grid gap-8 max-w-220 text-center mx-auto">
						<span class="font-mono">How It Works</span>
						<h2 class="text-4xl">From raw data to actionable decisions</h2>
					</div>
					<div class="grid grid-cols-3 gap-8">
						<div class="grid gap-4 p-8">
							<span class="font-mono text-foreground/30">01</span>
							<h3 class="text-2xl">Connect</h3>
							<p class="text-foreground/60">Link your existing platforms — JOOR, NuORDER, or direct import. Stitches starts learning immediately.</p>
						</div>
						<div class="grid gap-4 p-8">
							<span class="font-mono text-foreground/30">02</span>
							<h3 class="text-2xl">Learn</h3>
							<p class="text-foreground/60">Stitches maps your portfolio — buyer patterns, brand performance, territory gaps — across every data source.</p>
						</div>
						<div class="grid gap-4 p-8">
							<span class="font-mono text-foreground/30">03</span>
							<h3 class="text-2xl">Act</h3>
							<p class="text-foreground/60">Daily briefings, automated alerts, and contextual recommendations arrive before your first coffee.</p>
						</div>
					</div>
				</div>
			</section>
			<section>
				<div class="px-8 py-24 grid gap-8">
					<div class="grid gap-8 max-w-220 text-center mx-auto">
						<h2 class="text-4xl">Let Stitches work for you</h2>
						<p class="text-lg text-foreground/60">Connect your platforms, and Stitches starts learning your portfolio immediately. Under one hour to set up.</p>
						<div class="flex gap-4 justify-center">
							<a href="/signup" class="bg-foreground text-primary-foreground px-8 py-3 text-base font-medium">Get Early Access</a>
							<a href="/features" class="border border-foreground px-8 py-3 text-base font-medium">See All Features</a>
						</div>
					</div>
				</div>
			</section>
		</div>
	</main>
	<MarketingFooter />
</div>
