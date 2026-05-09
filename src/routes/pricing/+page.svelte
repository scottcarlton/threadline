<script lang="ts">
	import { resolve } from '$app/paths';
	import MarketingNav from '$lib/components/marketing/MarketingNav.svelte';
	import MarketingFooter from '$lib/components/marketing/MarketingFooter.svelte';
</script>

<svelte:head>
	<title>Pricing — Threadline</title>
</svelte:head>

<div>
	<MarketingNav />
	<main>
		<div>
			<section>
				<div class="px-8 pt-64 pb-24">
					<div class="mx-auto grid max-w-220 gap-8 text-center">
						<span class="font-mono">[Pricing]</span>
						<h1 class="text-6xl">Simple, transparent pricing.</h1>
						<p class="mx-auto max-w-160 text-lg text-foreground/60">
							Free to start. No credit card required. Upgrade when you're ready.
						</p>
					</div>
				</div>
			</section>
			<section>
				<div class="grid gap-8 px-8 py-24">
					<div class="mx-auto grid max-w-280 grid-cols-3 gap-8">
						<!-- Free -->
						<div class="grid gap-8 rounded-2xl bg-neutral-200 p-8">
							<div class="grid gap-4">
								<span class="font-mono text-sm">Free</span>
								<div class="flex items-baseline gap-2">
									<span class="text-5xl font-medium">$0</span>
									<span class="text-foreground/40">/month</span>
								</div>
								<p class="text-foreground/60">For individual reps getting started.</p>
							</div>
							<a
								href={resolve('/signup')}
								class="inline-flex justify-center bg-white px-5 py-3 text-sm font-medium text-primary"
								>Get Started</a
							>
							<ul class="grid gap-3">
								<li class="text-sm text-foreground/60">Up to 3 brands</li>
								<li class="text-sm text-foreground/60">25 accounts</li>
								<li class="text-sm text-foreground/60">Basic order management</li>
								<li class="text-sm text-foreground/60">Email support</li>
							</ul>
						</div>
						<!-- Pro -->
						<div class="grid gap-8 rounded-2xl bg-primary p-8 text-primary-foreground">
							<div class="grid gap-4">
								<span class="font-mono text-sm">Pro</span>
								<div class="flex items-baseline gap-2">
									<span class="text-5xl font-medium">$49</span>
									<span class="text-primary-foreground/40">/month</span>
								</div>
								<p class="text-primary-foreground/60">For serious reps who want the edge.</p>
							</div>
							<a
								href={resolve('/signup')}
								class="inline-flex justify-center bg-white px-5 py-3 text-sm font-medium text-primary"
								>Start Free Trial</a
							>
							<ul class="grid gap-3">
								<li class="text-sm text-primary-foreground/60">Unlimited brands</li>
								<li class="text-sm text-primary-foreground/60">Unlimited accounts</li>
								<li class="text-sm text-primary-foreground/60">Stitches AI briefings</li>
								<li class="text-sm text-primary-foreground/60">Account health monitoring</li>
								<li class="text-sm text-primary-foreground/60">Style velocity tracking</li>
								<li class="text-sm text-primary-foreground/60">Commission automation</li>
								<li class="text-sm text-primary-foreground/60">Built-in Workers</li>
							</ul>
						</div>
						<!-- Agency -->
						<div class="grid gap-8 rounded-2xl bg-neutral-200 p-8">
							<div class="grid gap-4">
								<span class="font-mono text-sm">Agency</span>
								<div class="flex items-baseline gap-2">
									<span class="text-5xl font-medium">$149</span>
									<span class="text-foreground/40">/month</span>
								</div>
								<p class="text-foreground/60">For showrooms and sales agencies.</p>
							</div>
							<a
								href={resolve('/signup')}
								class="inline-flex justify-center bg-primary px-5 py-3 text-sm font-medium text-primary-foreground"
								>Contact Sales</a
							>
							<ul class="grid gap-3">
								<li class="text-sm text-foreground/60">Everything in Pro</li>
								<li class="text-sm text-foreground/60">Multi-rep management</li>
								<li class="text-sm text-foreground/60">Commission splits</li>
								<li class="text-sm text-foreground/60">Agency-wide analytics</li>
								<li class="text-sm text-foreground/60">Custom Workers</li>
								<li class="text-sm text-foreground/60">Priority support</li>
							</ul>
						</div>
					</div>
				</div>
			</section>
			<section>
				<div class="grid gap-8 px-8 py-24">
					<div class="mx-auto grid max-w-220 gap-8 text-center">
						<h2 class="text-4xl">All plans include</h2>
					</div>
					<ul class="mx-auto grid max-w-280 grid-cols-4 gap-8">
						<li class="grid gap-4 p-8 text-center">
							<span class="mx-auto h-12 w-12 rounded-full bg-neutral-300"></span>
							<h3 class="text-lg font-medium">30-day free trial</h3>
							<p class="text-sm text-foreground/50">Full access, no credit card.</p>
						</li>
						<li class="grid gap-4 p-8 text-center">
							<span class="mx-auto h-12 w-12 rounded-full bg-neutral-300"></span>
							<h3 class="text-lg font-medium">No annual lock-in</h3>
							<p class="text-sm text-foreground/50">Cancel anytime, keep your data.</p>
						</li>
						<li class="grid gap-4 p-8 text-center">
							<span class="mx-auto h-12 w-12 rounded-full bg-neutral-300"></span>
							<h3 class="text-lg font-medium">Data security</h3>
							<p class="text-sm text-foreground/50">Encrypted, isolated, never shared.</p>
						</li>
						<li class="grid gap-4 p-8 text-center">
							<span class="mx-auto h-12 w-12 rounded-full bg-neutral-300"></span>
							<h3 class="text-lg font-medium">Onboarding help</h3>
							<p class="text-sm text-foreground/50">We help you get set up right.</p>
						</li>
					</ul>
				</div>
			</section>
		</div>
	</main>
	<MarketingFooter />
</div>
