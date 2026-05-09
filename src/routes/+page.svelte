<script lang="ts">
	import { onMount } from 'svelte';
	import MarketingNav from '$lib/components/marketing/MarketingNav.svelte';
	// import { resolve } from '$app/paths';
	import MarketingFooter from '$lib/components/marketing/MarketingFooter.svelte';
	import InstallCta from '$lib/components/pwa/InstallCta.svelte';

	let faqOpen = $state<number | null>(null);

	function toggleFaq(index: number) {
		faqOpen = faqOpen === index ? null : index;
	}

	onMount(async () => {
		const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		const { animate, inView } = await import('motion');

		const ease = [0.16, 1, 0.3, 1] as const;

		if (reduced) return;

		document.querySelectorAll<HTMLElement>('.h-reveal').forEach((el, i) => {
			animate(el, { opacity: [0, 1], y: [60, 0] } as Parameters<typeof animate>[1], {
				duration: 0.9,
				delay: 0.1 + i * 0.12,
				ease
			});
		});

		document.querySelectorAll<HTMLElement>('.reveal').forEach((el) => {
			inView(
				el,
				() => {
					animate(el, { opacity: [0, 1], y: [40, 0] } as Parameters<typeof animate>[1], {
						duration: 0.8,
						ease
					});
				},
				{ amount: 0.15 }
			);
		});

		document.querySelectorAll('[data-stagger]').forEach((p) => {
			inView(
				p,
				() => {
					p.querySelectorAll<HTMLElement>('[data-s]').forEach((c, i) => {
						animate(c, { opacity: [0, 1], y: [30, 0] } as Parameters<typeof animate>[1], {
							duration: 0.6,
							delay: i * 0.08,
							ease
						});
					});
				},
				{ amount: 0.1 }
			);
		});

		inView(
			'.stats-row',
			() => {
				document.querySelectorAll<HTMLElement>('.ct').forEach((el) => {
					const t = parseFloat(el.dataset.t ?? '0');
					const s = el.dataset.s ?? '';
					const p = el.dataset.p ?? '';
					animate(
						(v: number) => {
							el.textContent = p + Math.round(v * t) + s;
						},
						{ duration: 2, ease }
					);
				});
			},
			{ amount: 0.3 }
		);
	});
</script>

<svelte:head>
	<title>Threadline — Wholesale Intelligence Platform</title>
</svelte:head>

<div>
	<MarketingNav />
	<main>
		<div>
			<section data-section="hero">
				<div class="grid gap-12 px-12 pt-32">
					<div class="grid grid-cols-2 pt-42">
						<div>
							<div class="mb-8 space-y-2">
								<h1 class="h-reveal text-5xl leading-14 opacity-0">Decisions, not dashboards.</h1>
								<p class="h-reveal max-w-xl text-neutral-700 opacity-0">
									We unify how reps and brands see, understand, and act on their business, no matter
									where the signal comes from.
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
					<div class="h-100 min-h-180 rounded-lg bg-neutral-200 p-12"></div>
					<!-- <div
						class="flex h-100 min-h-180 items-end rounded-4xl bg-black p-12"
						style="background-image: url('https://images.unsplash.com/photo-1753029226995-74b05a344bb1?q=80&w=3087&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D'); background-size: cover; background-position: center;"
					>
						<div class="grid grid-cols-[1.5fr_1fr] gap-12 text-white">

							<div class="grid gap-4">
								<a
									class="h-reveal inline-flex w-fit bg-white px-12 py-2.5 text-base text-primary opacity-0"
									href={resolve('/signup')}>Early Access</a
								>
								<p class="h-reveal opacity-0">
									Most wholesale tools aren't truly smart. They digitize the old way of working.
									Threadline replaces it — with intelligence that sees what you can't, and acts
									before you ask.
								</p>
							</div>
						</div>
					</div> -->
				</div>
			</section>
			<section data-section="about-threadline">
				<div class="px-12 pt-48 pb-24">
					<div class="reveal grid grid-cols-[1fr_1.5fr] gap-4 opacity-0">
						<div>
							<span class="font-mono opacity-0">About Threadline</span>
						</div>
						<div class="grid gap-8">
							<h2 class="text-4xl">
								An agentic first systems company helping <span class="text-muted-foreground"
									>multi-brand sales representatives and brands</span
								> find gaps and turn signals into sales.
							</h2>
							<ul class="stats-row grid grid-cols-4 gap-4" data-stagger>
								<li data-s class="grid gap-8 opacity-0">
									<p class="font-mono">Productivity With Agentic Automation</p>
									<p class="text-4xl font-medium">40%</p>
								</li>
								<li data-s class="grid gap-8 opacity-0">
									<p class="font-mono">ROI For Companies Using Agentic Tools</p>
									<p class="text-4xl font-medium">20%</p>
								</li>
								<li data-s class="grid gap-8 opacity-0">
									<p class="font-mono">Reduction In Manual Workloads</p>
									<p class="text-4xl font-medium">60%</p>
								</li>
								<li data-s class="grid gap-8 opacity-0">
									<p class="font-mono">Revenue Increase With Agentic Adoption</p>
									<p class="text-4xl font-medium">10%</p>
								</li>
							</ul>
						</div>
					</div>
				</div>
			</section>
			<section data-section="what-we-feature">
				<div class="px-12 py-24">
					<div class="grid gap-12">
						<div class="reveal grid max-w-220 gap-2 opacity-0">
							<span class="font-mono">[What We Feature]</span>
							<h2 class="text-4xl">
								Reliable Ways to Move Goods Using <span class="text-muted-foreground"
									>Modern Infrastructure And Intelligent Systems</span
								>
							</h2>
						</div>
						<ul class="grid grid-cols-12 gap-6" data-stagger>
							<li
								class="col-span-8 grid min-h-120 grid-cols-2 gap-4 rounded-md bg-neutral-200 p-4 opacity-0"
								data-s
							>
								<div>
									<h3 class="mb-2 text-xl">Insight built around you.</h3>
									<p class="text-neutral-600">
										Stitches surfaces cross-brand patterns, buyer behavior, and territory
										opportunities unique to your portfolio — intelligence no single-brand platform
										can see.
									</p>
								</div>
								<div class="col-start-2 row-start-2">
									<div class="h-full w-full rounded-lg bg-neutral-100"></div>
								</div>
							</li>
							<li
								class="col-span-4 col-start-9 grid gap-4 rounded-md bg-neutral-200 p-4 opacity-0"
								data-s
							>
								<div>
									<h3 class="mb-2 text-xl">Decisions, Not Guesses.</h3>
									<p class="text-neutral-600">
										Your tools show orders and line sheets. Threadline shows what's missing —
										under-penetrated accounts, brands that should be paired together, and reorders
										that should have happened last week.
									</p>
								</div>
								<div class="row-start-2">
									<div class="h-full w-full rounded-lg bg-neutral-100"></div>
								</div>
							</li>
							<li
								class="col-span-4 grid min-h-120 gap-4 rounded-md bg-neutral-200 p-4 opacity-0"
								data-s
							>
								<div>
									<h3 class="mb-2 text-xl">Act on real-time signals.</h3>
									<p class="text-neutral-600">
										Lead times have compressed to 102 days. Stitches integrates sell-through data
										with social signals to trigger reorder recommendations and buyer alerts before
										stock-outs happen.
									</p>
								</div>
								<div class="row-start-2">
									<div class="h-full w-full rounded-lg bg-neutral-100"></div>
								</div>
							</li>
							<li
								class="col-span-8 col-start-5 grid grid-cols-2 gap-4 rounded-md bg-neutral-200 p-4 opacity-0"
								data-s
							>
								<div>
									<h3 class="mb-2 text-xl">Autonomous work.</h3>
									<p class="text-neutral-600">
										Workers handle commission splits, order tracking, and buyer follow-ups in the
										background. Custom Workers let you build your own — watching for the signals
										that matter to your book of business.
									</p>
								</div>
								<div class="col-start-2 row-start-2">
									<div class="h-full w-full rounded-lg bg-neutral-100"></div>
								</div>
							</li>
						</ul>
					</div>
				</div>
			</section>
			<section data-section="how-we-work">
				<div class="grid gap-24 px-12 py-24">
					<div class="mx-auto grid max-w-220 gap-2 text-center">
						<span class="font-mono">[How We Work]</span>
						<h2 class="text-4xl">
							Four Layers That <span class="text-muted-foreground">Turn Data Into Decisions</span>
						</h2>
					</div>
					<ul class="grid gap-24">
						<li class="grid grid-cols-12 items-center gap-6">
							<div class="col-span-4">
								<h3 class="mb-3 text-2xl">Gaps</h3>
								<p class="text-balance text-neutral-700">
									Every application has blind spots — invisible fractures where data, context gets
									lost. We find these gaps and reveal them.
								</p>
							</div>
							<div class="col-span-7 col-start-6 h-120 w-full rounded-lg bg-neutral-200"></div>
						</li>
						<li class="grid grid-cols-12 items-center gap-6">
							<div class="col-span-4 col-start-9">
								<h3 class="mb-3 text-2xl">Orchestration</h3>
								<p class="text-balance text-neutral-700">
									Start directing outcomes. Orchestration means your systems anticipate, coordinate,
									and adapt — so you focus on decisions, not mechanics.
								</p>
							</div>
							<div
								class="col-span-7 col-start-1 row-start-1 h-120 w-full rounded-lg bg-neutral-200"
							></div>
						</li>
						<li class="grid grid-cols-12 items-center gap-6">
							<div class="col-span-4">
								<h3 class="mb-3 text-2xl">Stitches</h3>
								<p class="text-balance text-neutral-700">
									We connect disparate signals into something actionable. A living, contextual
									understanding that arrives before you ask for it.
								</p>
							</div>
							<div class="col-span-7 col-start-6 h-120 w-full rounded-lg bg-neutral-200"></div>
						</li>
						<li class="grid grid-cols-12 items-center gap-6">
							<div class="col-span-4 col-start-9">
								<h3 class="mb-3 text-2xl">Workers</h3>
								<p class="text-balance text-neutral-700">
									Workers handle the work you shouldn't have to. Custom Workers focus on what only
									you would think to look for.
								</p>
							</div>
							<div
								class="col-span-7 col-start-1 row-start-1 h-120 w-full rounded-lg bg-neutral-200"
							></div>
						</li>
					</ul>
				</div>
			</section>
			<section data-section="faq">
				<div class="grid gap-24 px-12 py-24">
					<div class="mx-auto grid max-w-220 gap-2 text-center">
						<span class="font-mono">[FAQ's]</span>
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
			<section data-section="clarity">
				<div class="grid gap-8 px-12 py-24">
					<div class="mx-auto grid max-w-220 space-y-2 text-center">
						<h2 class="text-4xl">Clarity Starts With The Right Conversation</h2>
						<p class="mx-auto max-w-8/12 text-balance text-neutral-700">
							Threadline is building the intelligence layer fashion wholesale has been missing.
							Let's talk about what it can do for your showroom.
						</p>
					</div>
					<ul class="grid grid-cols-12 gap-6">
						<li class="col-span-12 h-120 w-full rounded-lg bg-neutral-200"></li>
						<li class="col-span-6 row-start-2 h-120 w-full rounded-lg bg-neutral-200"></li>
						<li class="col-span-6 row-start-2 h-120 w-full rounded-lg bg-neutral-200"></li>
					</ul>
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
					<div class="flex items-center justify-center gap-3 text-sm text-muted-foreground">
						<span>Already have an account?</span>
						<InstallCta />
					</div>
				</div>
			</section>
		</div>
	</main>
	<MarketingFooter />
</div>

<style>
</style>
