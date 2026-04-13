<script lang="ts">
	import MarketingNav from '$lib/components/marketing/MarketingNav.svelte';
	import MarketingFooter from '$lib/components/marketing/MarketingFooter.svelte';
</script>

<svelte:head>
	<title>Features — Threadline</title>
</svelte:head>

<div>
	<MarketingNav />
	<main>
		<div>
			<section>
				<div class="px-8 pt-72 pb-24">
					<div class="grid max-w-220 gap-8">
						<span class="font-mono">[Features]</span>
						<h1 class="text-6xl">Everything you need to sell smarter.</h1>
						<p class="max-w-160 text-lg text-foreground/60">
							Threadline combines AI briefings, account health monitoring, style velocity tracking,
							and a full order pipeline into one platform built for wholesale reps.
						</p>
					</div>
				</div>
			</section>
			<section>
				<div class="grid gap-8 px-8 py-24">
					<div class="mx-auto grid max-w-220 gap-8 text-center">
						<span class="font-mono">Core Platform</span>
						<h2 class="text-4xl">Built for how reps actually work</h2>
					</div>
					<ul class="grid grid-cols-3 gap-4">
						<li class="grid grid-rows-[16px_1fr_16px]">
							<div class="grid grid-cols-[16px_1fr_16px] gap-4">
								<div class="h-4 w-4 border-t border-l border-foreground"></div>
								<div class="h-1 w-full border-t border-foreground"></div>
								<div class="h-4 w-4 border-t border-r border-foreground"></div>
							</div>
							<div class="grid grid-cols-[1px_1fr_1px] gap-4">
								<div class="h-[calc(100%-32px)] self-center border-l border-foreground"></div>
								<div class="grid grid-rows-[48px_auto_1fr] items-start gap-4 p-4">
									<svg
										xmlns="http://www.w3.org/2000/svg"
										viewBox="0 0 24 24"
										width="48"
										height="48"
										fill="none"
										stroke="currentColor"
										stroke-width="1.25"
										><circle cx="12" cy="12" r="10" /><path d="M12 6V12L16 14" /></svg
									>
									<h3 class="text-2xl">AI Briefings</h3>
									<p>
										Start every morning knowing which accounts need attention, what's trending, and
										where revenue is at risk.
									</p>
								</div>
								<div class="h-[calc(100%-32px)] self-center border-r border-foreground"></div>
							</div>
							<div class="grid grid-cols-[16px_1fr_16px] gap-4 self-end">
								<div class="h-4 w-4 border-b border-l border-foreground"></div>
								<div class="h-full w-full border-b border-foreground"></div>
								<div class="h-4 w-4 border-r border-b border-foreground"></div>
							</div>
						</li>
						<li class="grid grid-rows-[16px_1fr_16px]">
							<div class="grid grid-cols-[16px_1fr_16px] gap-4">
								<div class="h-4 w-4 border-t border-l border-foreground"></div>
								<div class="h-1 w-full border-t border-foreground"></div>
								<div class="h-4 w-4 border-t border-r border-foreground"></div>
							</div>
							<div class="grid grid-cols-[1px_1fr_1px] gap-4">
								<div class="h-[calc(100%-32px)] self-center border-l border-foreground"></div>
								<div class="grid grid-rows-[48px_auto_1fr] items-start gap-4 p-4">
									<svg
										xmlns="http://www.w3.org/2000/svg"
										viewBox="0 0 24 24"
										width="48"
										height="48"
										fill="none"
										stroke="currentColor"
										stroke-width="1.25"
										><path
											d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78Z"
										/></svg
									>
									<h3 class="text-2xl">Account Health</h3>
									<p>
										Health scores, reorder patterns, and churn risk — synthesized automatically from
										buyer behavior.
									</p>
								</div>
								<div class="h-[calc(100%-32px)] self-center border-r border-foreground"></div>
							</div>
							<div class="grid grid-cols-[16px_1fr_16px] gap-4 self-end">
								<div class="h-4 w-4 border-b border-l border-foreground"></div>
								<div class="h-full w-full border-b border-foreground"></div>
								<div class="h-4 w-4 border-r border-b border-foreground"></div>
							</div>
						</li>
						<li class="grid grid-rows-[16px_1fr_16px]">
							<div class="grid grid-cols-[16px_1fr_16px] gap-4">
								<div class="h-4 w-4 border-t border-l border-foreground"></div>
								<div class="h-1 w-full border-t border-foreground"></div>
								<div class="h-4 w-4 border-t border-r border-foreground"></div>
							</div>
							<div class="grid grid-cols-[1px_1fr_1px] gap-4">
								<div class="h-[calc(100%-32px)] self-center border-l border-foreground"></div>
								<div class="grid grid-rows-[48px_auto_1fr] items-start gap-4 p-4">
									<svg
										xmlns="http://www.w3.org/2000/svg"
										viewBox="0 0 24 24"
										width="48"
										height="48"
										fill="none"
										stroke="currentColor"
										stroke-width="1.25"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg
									>
									<h3 class="text-2xl">Style Velocity</h3>
									<p>
										Real-time sell-through across accounts. Spot which SKUs are accelerating before
										you stock out.
									</p>
								</div>
								<div class="h-[calc(100%-32px)] self-center border-r border-foreground"></div>
							</div>
							<div class="grid grid-cols-[16px_1fr_16px] gap-4 self-end">
								<div class="h-4 w-4 border-b border-l border-foreground"></div>
								<div class="h-full w-full border-b border-foreground"></div>
								<div class="h-4 w-4 border-r border-b border-foreground"></div>
							</div>
						</li>
						<li class="grid grid-rows-[16px_1fr_16px]">
							<div class="grid grid-cols-[16px_1fr_16px] gap-4">
								<div class="h-4 w-4 border-t border-l border-foreground"></div>
								<div class="h-1 w-full border-t border-foreground"></div>
								<div class="h-4 w-4 border-t border-r border-foreground"></div>
							</div>
							<div class="grid grid-cols-[1px_1fr_1px] gap-4">
								<div class="h-[calc(100%-32px)] self-center border-l border-foreground"></div>
								<div class="grid grid-rows-[48px_auto_1fr] items-start gap-4 p-4">
									<svg
										xmlns="http://www.w3.org/2000/svg"
										viewBox="0 0 24 24"
										width="48"
										height="48"
										fill="none"
										stroke="currentColor"
										stroke-width="1.25"
										><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M8 7H16" /><path
											d="M8 11H16"
										/><path d="M8 15H13" /></svg
									>
									<h3 class="text-2xl">Order Pipeline</h3>
									<p>
										Full pipeline from draft to delivery. Track status, commissions, and ship dates
										in one place.
									</p>
								</div>
								<div class="h-[calc(100%-32px)] self-center border-r border-foreground"></div>
							</div>
							<div class="grid grid-cols-[16px_1fr_16px] gap-4 self-end">
								<div class="h-4 w-4 border-b border-l border-foreground"></div>
								<div class="h-full w-full border-b border-foreground"></div>
								<div class="h-4 w-4 border-r border-b border-foreground"></div>
							</div>
						</li>
						<li class="grid grid-rows-[16px_1fr_16px]">
							<div class="grid grid-cols-[16px_1fr_16px] gap-4">
								<div class="h-4 w-4 border-t border-l border-foreground"></div>
								<div class="h-1 w-full border-t border-foreground"></div>
								<div class="h-4 w-4 border-t border-r border-foreground"></div>
							</div>
							<div class="grid grid-cols-[1px_1fr_1px] gap-4">
								<div class="h-[calc(100%-32px)] self-center border-l border-foreground"></div>
								<div class="grid grid-rows-[48px_auto_1fr] items-start gap-4 p-4">
									<svg
										xmlns="http://www.w3.org/2000/svg"
										viewBox="0 0 24 24"
										width="48"
										height="48"
										fill="none"
										stroke="currentColor"
										stroke-width="1.25"
										><line x1="12" y1="1" x2="12" y2="23" /><path
											d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"
										/></svg
									>
									<h3 class="text-2xl">Commission Tracking</h3>
									<p>
										Set rate structures per brand, define splits, and Threadline calculates
										everything automatically.
									</p>
								</div>
								<div class="h-[calc(100%-32px)] self-center border-r border-foreground"></div>
							</div>
							<div class="grid grid-cols-[16px_1fr_16px] gap-4 self-end">
								<div class="h-4 w-4 border-b border-l border-foreground"></div>
								<div class="h-full w-full border-b border-foreground"></div>
								<div class="h-4 w-4 border-r border-b border-foreground"></div>
							</div>
						</li>
						<li class="grid grid-rows-[16px_1fr_16px]">
							<div class="grid grid-cols-[16px_1fr_16px] gap-4">
								<div class="h-4 w-4 border-t border-l border-foreground"></div>
								<div class="h-1 w-full border-t border-foreground"></div>
								<div class="h-4 w-4 border-t border-r border-foreground"></div>
							</div>
							<div class="grid grid-cols-[1px_1fr_1px] gap-4">
								<div class="h-[calc(100%-32px)] self-center border-l border-foreground"></div>
								<div class="grid grid-rows-[48px_auto_1fr] items-start gap-4 p-4">
									<svg
										xmlns="http://www.w3.org/2000/svg"
										viewBox="0 0 24 24"
										width="48"
										height="48"
										fill="none"
										stroke="currentColor"
										stroke-width="1.25"
										><rect x="2" y="3" width="20" height="18" rx="2" /><circle
											cx="12"
											cy="10"
											r="3"
										/><path d="M7 21v-1a5 5 0 0 1 10 0v1" /></svg
									>
									<h3 class="text-2xl">Buyer Portal</h3>
									<p>
										Buyers browse products, place orders, and track deliveries on their own terms.
									</p>
								</div>
								<div class="h-[calc(100%-32px)] self-center border-r border-foreground"></div>
							</div>
							<div class="grid grid-cols-[16px_1fr_16px] gap-4 self-end">
								<div class="h-4 w-4 border-b border-l border-foreground"></div>
								<div class="h-full w-full border-b border-foreground"></div>
								<div class="h-4 w-4 border-r border-b border-foreground"></div>
							</div>
						</li>
					</ul>
				</div>
			</section>
			<section>
				<div class="grid gap-8 px-8 py-24">
					<div class="mx-auto grid max-w-220 gap-8 text-center">
						<span class="font-mono">Workers</span>
						<h2 class="text-4xl">Automation that works while you sleep</h2>
					</div>
					<div class="h-140 rounded-4xl bg-black"></div>
					<div class="grid grid-cols-2 gap-8">
						<div class="grid gap-4">
							<h3 class="text-2xl">Built-in Workers</h3>
							<p class="text-lg text-foreground/60">
								Commission tracking, reorder alerts, buyer follow-ups — handled automatically in the
								background.
							</p>
						</div>
						<div class="grid gap-4">
							<h3 class="text-2xl">Custom Workers</h3>
							<p class="text-lg text-foreground/60">
								Build your own automations for the signals only you care about. No code required.
							</p>
						</div>
					</div>
				</div>
			</section>
			<section>
				<div class="grid gap-8 px-8 py-24">
					<div class="mx-auto grid max-w-220 gap-8 text-center">
						<h2 class="text-4xl">Ready to sell smarter?</h2>
						<p class="text-lg text-foreground/60">
							Start free. No credit card required. See what Threadline can do for your book of
							business.
						</p>
						<div class="flex justify-center gap-4">
							<a
								href="/signup"
								class="bg-foreground px-8 py-3 text-base font-medium text-primary-foreground"
								>Get Early Access</a
							>
							<a href="/pricing" class="border border-foreground px-8 py-3 text-base font-medium"
								>View Pricing</a
							>
						</div>
					</div>
				</div>
			</section>
		</div>
	</main>
	<MarketingFooter />
</div>
