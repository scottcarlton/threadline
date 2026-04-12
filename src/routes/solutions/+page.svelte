<script lang="ts">
	import MarketingNav from '$lib/components/marketing/MarketingNav.svelte';
	import MarketingFooter from '$lib/components/marketing/MarketingFooter.svelte';
</script>

<svelte:head>
	<title>Solutions — Threadline</title>
</svelte:head>

<div>
	<MarketingNav />
	<main>
		<div>
			<section>
				<div class="px-8 pt-72 pb-24">
					<div class="grid gap-8 max-w-220">
						<span class="font-mono">[Solutions]</span>
						<h1 class="text-6xl">Built for every role in wholesale.</h1>
						<p class="text-lg text-foreground/60 max-w-160">Whether you're a multi-brand rep, a showroom owner, or a sales agency — Threadline adapts to how you work.</p>
					</div>
				</div>
			</section>
			<section>
				<div class="px-8 py-24 grid gap-8">
					<div class="grid gap-8 max-w-220 text-center mx-auto">
						<span class="font-mono">By Role</span>
						<h2 class="text-4xl">The right tools for every seat</h2>
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
									<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.25"><circle cx="12" cy="7" r="4"/><path d="M5.5 21a6.5 6.5 0 0 1 13 0"/></svg>
									<h3 class="text-2xl">Independent Reps</h3>
									<p>Manage multiple brands, track commissions across lines, and get AI briefings tailored to your territory.</p>
									<ul class="grid gap-3">
										<li class="text-sm">Multi-brand portfolio view</li>
										<li class="text-sm">Commission automation</li>
										<li class="text-sm">Buyer follow-up alerts</li>
										<li class="text-sm">Territory intelligence</li>
									</ul>
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
									<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.25"><rect x="3" y="3" width="11" height="18" rx="1"/><path d="M14 10H20a1 1 0 0 1 1 1V21H14"/><path d="M7 7H11"/><path d="M7 11H11"/><path d="M7 15H11"/></svg>
									<h3 class="text-2xl">Showroom Owners</h3>
									<p>Run your showroom with full visibility — team performance, brand analytics, and buyer engagement in one place.</p>
									<ul class="grid gap-3">
										<li class="text-sm">Team management</li>
										<li class="text-sm">Showroom-wide analytics</li>
										<li class="text-sm">Commission splits</li>
										<li class="text-sm">Appointment scheduling</li>
									</ul>
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
									<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.25"><circle cx="9" cy="7" r="3.5"/><path d="M3 21a6 6 0 0 1 12 0"/><circle cx="18" cy="8" r="2.5"/><path d="M16 21a4.5 4.5 0 0 1 6.5 0"/></svg>
									<h3 class="text-2xl">Sales Agencies</h3>
									<p>Scale your agency with cross-rep analytics, centralized account management, and automated reporting.</p>
									<ul class="grid gap-3">
										<li class="text-sm">Multi-rep dashboards</li>
										<li class="text-sm">Centralized accounts</li>
										<li class="text-sm">Agency-wide reporting</li>
										<li class="text-sm">Custom Workers</li>
									</ul>
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
						<span class="font-mono">Integrations</span>
						<h2 class="text-4xl">Works with what you already use</h2>
					</div>
					<div class="grid grid-cols-4 gap-8">
						<div class="grid gap-4 p-8 bg-neutral-200 rounded-2xl text-center">
							<span class="w-12 h-12 bg-neutral-500 rounded-full mx-auto"></span>
							<h3 class="text-lg font-medium">JOOR</h3>
						</div>
						<div class="grid gap-4 p-8 bg-neutral-200 rounded-2xl text-center">
							<span class="w-12 h-12 bg-neutral-500 rounded-full mx-auto"></span>
							<h3 class="text-lg font-medium">NuORDER</h3>
						</div>
						<div class="grid gap-4 p-8 bg-neutral-200 rounded-2xl text-center">
							<span class="w-12 h-12 bg-neutral-500 rounded-full mx-auto"></span>
							<h3 class="text-lg font-medium">Gmail</h3>
						</div>
						<div class="grid gap-4 p-8 bg-neutral-200 rounded-2xl text-center">
							<span class="w-12 h-12 bg-neutral-500 rounded-full mx-auto"></span>
							<h3 class="text-lg font-medium">QuickBooks</h3>
						</div>
					</div>
				</div>
			</section>
			<section>
				<div class="px-8 py-24 grid gap-8">
					<div class="grid gap-8 max-w-220 text-center mx-auto">
						<h2 class="text-4xl">Find your fit</h2>
						<p class="text-lg text-foreground/60">Whether you're a solo rep or running a 20-person agency, Threadline scales with you. Start free today.</p>
						<div class="flex gap-4 justify-center">
							<a href="/signup" class="bg-foreground text-primary-foreground px-8 py-3 text-base font-medium">Get Early Access</a>
							<a href="/pricing" class="border border-foreground px-8 py-3 text-base font-medium">View Pricing</a>
						</div>
					</div>
				</div>
			</section>
		</div>
	</main>
	<MarketingFooter />
</div>
