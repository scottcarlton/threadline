<script lang="ts">
	// import { resolve } from '$app/paths';
	import MarketingNav from '$lib/components/marketing/MarketingNav.svelte';
	import MarketingFooter from '$lib/components/marketing/MarketingFooter.svelte';

	let faqOpen = $state<number | null>(null);

	function toggleFaq(index: number) {
		faqOpen = faqOpen === index ? null : index;
	}
</script>

<svelte:head>
	<title>Intelligence — Threadline</title>
</svelte:head>

<div>
	<MarketingNav />
	<main>
		<div>
			<section data-section="hero">
				<div class="grid grid-cols-12 gap-6 px-12 pt-32">
					<div class="col-span-6 grid pt-42">
						<div>
							<div class="mb-8 space-y-2">
								<h1 class="h-reveal text-5xl leading-14 text-balance">
									Intelligence built for partnership.
								</h1>
								<p class="h-reveal max-w-xl text-neutral-700">
									Stitch, Threadline's AI engine. It watches your entire business and tells you what
									you need.
								</p>
							</div>
							<form
								class="grid max-w-lg grid-cols-[1fr_auto] rounded-lg border border-neutral-300 p-1.5 focus-within:border-foreground"
							>
								<input
									class="border-0 px-4 py-2 text-base outline-none"
									type="email"
									placeholder="Enter your email"
								/>
								<button class="ml-2 rounded-md bg-accent px-5 py-3"> Request Access </button>
							</form>
						</div>
					</div>
					<div class="col-span-7 col-start-7 h-100 min-h-140 rounded-lg bg-neutral-200 p-12"></div>
				</div>
			</section>
			<section>
				<div class="grid grid-cols-12 gap-12 px-12 pt-32">
					<div class="col-span-12 text-center">
						<h2 class="text-4xl">Intelligence no single platform can see</h2>
					</div>
					<ul class="col-span-12 grid grid-cols-12 gap-6">
						<li class="col-span-12 h-48 rounded-lg bg-neutral-200 p-4">
							<div>
								<h3 class="text-xl">Predictive Signals</h3>
								<p class="text-balance text-foreground/60">
									Reorder predictions, churn risk detection, and buyer engagement scoring — before
									you ask.
								</p>
							</div>
						</li>
						<li class="col-span-6 rounded-lg bg-neutral-200 p-4">
							<div>
								<h3 class="text-xl">Pattern Recognition</h3>
								<p class="text-balance text-foreground/60">
									Surfaces cross-brand patterns, buyer behavior, and territory opportunities unique
									to your portfolio.
								</p>
							</div>
						</li>
						<li class="col-span-6 h-48 rounded-lg bg-neutral-200 p-4">
							<div>
								<h3 class="text-xl">Natural Language</h3>
								<p class="text-balance text-foreground/60">
									Ask anything about your business in plain English. Revenue breakdowns, account
									health, follow-up suggestions.
								</p>
							</div>
						</li>
					</ul>
				</div>
			</section>

			<section>
				<div class="grid grid-cols-12 gap-12 px-12 py-24">
					<div class="col-span-12 text-center">
						<h2 class="text-4xl">From raw data to actionable decisions</h2>
					</div>
					<ul class="col-span-12 grid grid-cols-12 gap-6">
						<li class="col-span-4 grid gap-6">
							<div class="aspect-square rounded-xl bg-neutral-200"></div>
							<div>
								<h3 class="text-xl">Connect</h3>
								<p class="text-balance text-foreground/60">
									Link your existing platforms — JOOR, NuORDER, or direct import. Stitches starts
									learning immediately.
								</p>
							</div>
						</li>
						<li class="col-span-4 grid gap-6">
							<div class="aspect-square rounded-xl bg-neutral-200"></div>
							<div>
								<h3 class="text-xl">Learn</h3>
								<p class="text-balance text-foreground/60">
									Stitches maps your portfolio — buyer patterns, brand performance, territory gaps —
									across every data source.
								</p>
							</div>
						</li>
						<li class="col-span-4 grid gap-6">
							<div class="aspect-square rounded-xl bg-neutral-200"></div>
							<div>
								<h3 class="text-xl">Insight</h3>
								<p class="text-balance text-foreground/60">
									Get actionable insights and recommendations tailored to your business needs.
								</p>
							</div>
						</li>
					</ul>
				</div>
			</section>
			<section data-section="faq">
				<div class="grid gap-24 px-12 py-24">
					<div class="mx-auto grid max-w-220 gap-2 text-center">
						<h2 class="text-4xl">
							Common Questions, <span class="text-muted-foreground">Clear Answers</span>
						</h2>
					</div>
					<div class="mx-auto grid w-full max-w-280 grid-cols-2 items-start gap-8">
						<ul class="grid items-start">
							{#each [{ q: 'What types of reps does Threadline work with?', a: 'Independent multi-brand reps, showroom owners, and sales agencies carrying fashion and apparel lines across any combination of wholesale platforms.' }, { q: 'Do brands need to switch to Threadline?', a: 'No. Threadline layers on top of existing platforms. Brands keep using JOOR, NuORDER, or whatever they prefer. Nothing changes for them.' }, { q: 'What makes Stitches different from analytics?', a: 'Analytics show what happened. Stitches shows what to do next \u2014 cross-brand patterns, buyer predictions, and contextual actions that arrive before you ask.' }, { q: 'How long does setup take?', a: 'Under one hour. Connect your existing platforms, import your buyer contacts, and Stitches starts learning your portfolio immediately.' }] as item, i (i)}
								<li class="grid w-full items-start border-t border-foreground p-6">
									<button
										class="flex w-full items-center justify-between gap-4 text-left"
										onclick={() => toggleFaq(i)}
									>
										<h3 class="text-xl">{item.q}</h3>
										<span class="shrink-0 text-2xl leading-none">{faqOpen === i ? '−' : '+'}</span>
									</button>
									{#if faqOpen === i}
										<p class="mt-4 text-lg text-foreground/60">{item.a}</p>
									{/if}
								</li>
							{/each}
						</ul>
						<ul class="grid items-start">
							{#each [{ q: 'What are Workers?', a: 'Workers are automated agents that handle repetitive tasks \u2014 commission tracking, reorder alerts, buyer follow-ups. Custom Workers let you build your own for the signals only you care about.' }, { q: 'How does commission automation work?', a: 'Set rate structures per brand, define splits between showroom owners and sub-reps, and Threadline calculates everything automatically \u2014 reconciled in real time, no spreadsheets.' }, { q: 'How does pricing work?', a: 'Free for individual reps to start. Premium tiers unlock Stitches AI, Workers, multi-brand analytics, and commission automation. Transparent pricing \u2014 no annual lock-in.' }, { q: 'Is my data shared between brands?', a: 'Never. Brand data stays siloed. Stitches generates cross-brand insights from your own portfolio data \u2014 no brand sees another brand\u2019s information.' }] as item, i (i)}
								<li class="grid w-full items-start border-t border-foreground p-6">
									<button
										class="flex w-full items-center justify-between gap-4 text-left"
										onclick={() => toggleFaq(i + 4)}
									>
										<h3 class="text-xl">{item.q}</h3>
										<span class="shrink-0 text-2xl leading-none"
											>{faqOpen === i + 4 ? '−' : '+'}</span
										>
									</button>
									{#if faqOpen === i + 4}
										<p class="mt-4 text-lg text-foreground/60">{item.a}</p>
									{/if}
								</li>
							{/each}
						</ul>
					</div>
				</div>
			</section>
			<section data-section="cta">
				<div class="grid justify-center space-y-6 px-12 py-24">
					<h2 class="text-4xl">Get early access to Threadline</h2>
					<form
						class="grid max-w-lg grid-cols-[1fr_auto] rounded-lg border border-neutral-300 p-1.5 focus-within:border-foreground"
					>
						<input
							class="border-0 px-4 py-2 text-base outline-none"
							type="email"
							placeholder="Enter your email"
						/>
						<button class="ml-2 rounded-md bg-accent px-5 py-3"> Request Access </button>
					</form>
				</div>
			</section>
		</div>
	</main>
	<MarketingFooter />
</div>
