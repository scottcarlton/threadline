<script lang="ts">
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import MarketingNav from '$lib/components/marketing/MarketingNav.svelte';
	import MarketingFooter from '$lib/components/marketing/MarketingFooter.svelte';

	const isAuthenticated = $derived(!!$page.data.session);
	let navScrolled = $state(false);
	let faqOpen = $state<number | null>(null);

	function toggleFaq(index: number) {
		faqOpen = faqOpen === index ? null : index;
	}

	onMount(async () => {
		const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		const { animate, inView } = await import('motion');

		const ease = [0.16, 1, 0.3, 1] as const;

		window.addEventListener(
			'scroll',
			() => {
				navScrolled = window.scrollY > 40;
			},
			{ passive: true }
		);

		if (reduced) return;

		document.querySelectorAll<HTMLElement>('.h-reveal').forEach((el, i) => {
			animate(
				el,
				{ opacity: [0, 1], y: [60, 0] } as Parameters<typeof animate>[1],
				{ duration: 0.9, delay: 0.1 + i * 0.12, ease }
			);
		});

		document.querySelectorAll<HTMLElement>('.reveal').forEach((el) => {
			inView(
				el,
				() => {
					animate(
						el,
						{ opacity: [0, 1], y: [40, 0] } as Parameters<typeof animate>[1],
						{ duration: 0.8, ease }
					);
				},
				{ amount: 0.15 }
			);
		});

		document.querySelectorAll('[data-stagger]').forEach((p) => {
			inView(
				p,
				() => {
					p.querySelectorAll<HTMLElement>('[data-s]').forEach((c, i) => {
						animate(
							c,
							{ opacity: [0, 1], y: [30, 0] } as Parameters<typeof animate>[1],
							{ duration: 0.6, delay: i * 0.08, ease }
						);
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
			<section>
				<div class="px-8 pt-32">
					<div
						class="flex h-100 min-h-180 items-end rounded-4xl bg-black p-12"
						style="background-image: url('https://images.unsplash.com/photo-1753029226995-74b05a344bb1?q=80&w=3087&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D'); background-size: cover; background-position: center;"
					>
						<div class="grid grid-cols-[1.5fr_1fr] gap-12 text-white">
							<div>
								<h1 class="h-reveal text-6xl opacity-0">START WORKING IN THE AGE OF AI.</h1>
							</div>
							<div class="grid gap-4">
								<a
									class="h-reveal inline-flex w-fit bg-white px-12 py-2.5 text-base text-primary opacity-0"
									href="/signup">Early Access</a
								>
								<p class="h-reveal opacity-0">
									Most wholesale tools aren't truly smart. They digitize the old way of working.
									Threadline replaces it — with intelligence that sees what you can't, and acts
									before you ask.
								</p>
							</div>
						</div>
					</div>
				</div>
			</section>
			<section>
				<div class="px-8 pt-48 pb-24">
					<div class="reveal grid grid-cols-[1fr_1.5fr] gap-4 opacity-0">
						<div>
							<span class="font-mono">About Threadline</span>
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
			<section>
				<div class="px-8 py-24">
					<div class="grid gap-8">
						<div class="reveal mx-auto grid max-w-220 gap-8 text-center opacity-0">
							<span class="font-mono">What We Feature</span>
							<h2 class="text-4xl">
								Reliable Ways to Move Goods Using Modern Infrastructure And Intelligent Systems
							</h2>
						</div>
						<div
							class="reveal h-140 rounded-4xl bg-black opacity-0"
							style="background-image: url('https://images.unsplash.com/photo-1525562723836-dca67a71d5f1?q=80&w=1974&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D'); background-size: cover; background-position: center;"
						></div>
						<ul class="grid grid-cols-4 gap-4" data-stagger>
							<li class="grid grid-rows-[16px_1fr_16px] opacity-0" data-s>
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
												d="M4 3.5H3.5V4V8H4.5V4.5H8V3.5H4ZM20 3.5H16V4.5H19.5V8H20.5V4C20.5 3.72386 20.2761 3.5 20 3.5ZM4.5 16V19.5H8V20.5H4C3.72386 20.5 3.5 20.2761 3.5 20V16H4.5ZM19.5 16V19.5H16V20.5H20C20.2761 20.5 20.5 20.2761 20.5 20V16H19.5ZM10 9.5C9.72386 9.5 9.5 9.72386 9.5 10V14C9.5 14.2761 9.72386 14.5 10 14.5H14C14.2761 14.5 14.5 14.2761 14.5 14V10C14.5 9.72386 14.2761 9.5 14 9.5H10Z"
											></path></svg
										>
										<h3 class="text-2xl">Insight built around you.</h3>
										<p>
											Stitches surfaces cross-brand patterns, buyer behavior, and territory
											opportunities unique to your portfolio — intelligence no single-brand platform
											can see.
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
							<li class="grid grid-rows-[16px_1fr_16px] opacity-0" data-s>
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
											><path d="M12 2L21 7V17L12 22L3 17V7L12 2Z" /><path
												d="M12 7.5L16 9.75V14.25L12 16.5L8 14.25V9.75L12 7.5Z"
											/></svg
										>
										<h3 class="text-2xl">Decisions, Not Guesses.</h3>
										<p>
											Your tools show orders and line sheets. Threadline shows what's missing —
											under-penetrated accounts, brands that should be paired together, and reorders
											that should have happened last week.
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
							<li class="grid grid-rows-[16px_1fr_16px] opacity-0" data-s>
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
											><path d="M13 2V6" /><path d="M18.364 4.636L15.536 7.464" /><path
												d="M22 11H18"
											/><path d="M18.364 18.364L15.536 15.536" /><path d="M13 22V18" /><path
												d="M4.636 18.364L7.464 15.536"
											/><path d="M2 11H6" /><path d="M4.636 4.636L7.464 7.464" /><circle
												cx="12"
												cy="12"
												r="4"
											/></svg
										>
										<h3 class="text-2xl">Act on real-time signals.</h3>
										<p>
											Lead times have compressed to 102 days. Stitches integrates sell-through data
											with social signals to trigger reorder recommendations and buyer alerts before
											stock-outs happen.
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
							<li class="grid grid-rows-[16px_1fr_16px] opacity-0" data-s>
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
											><rect x="3" y="3" width="7" height="7" rx="1" /><rect
												x="14"
												y="3"
												width="7"
												height="7"
												rx="1"
											/><rect x="3" y="14" width="7" height="7" rx="1" /><rect
												x="14"
												y="14"
												width="7"
												height="7"
												rx="1"
											/><path d="M10 6.5H14" /><path d="M10 17.5H14" /><path d="M6.5 10V14" /><path
												d="M17.5 10V14"
											/></svg
										>
										<h3 class="text-2xl">Autonomous work.</h3>
										<p>
											Workers handle commission splits, order tracking, and buyer follow-ups in the
											background. Custom Workers let you build your own — watching for the signals
											that matter to your book of business.
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
				</div>
			</section>
			<section>
				<div class="grid gap-8 px-8 py-24">
					<div class="mx-auto grid max-w-220 gap-8 text-center">
						<span class="font-mono">How We Work</span>
						<h2 class="text-4xl">Four Layers That Turn Data Into Decisions</h2>
					</div>
					<div class="grid grid-cols-3 gap-8">
						<div class="grid gap-8">
							<div class="h-60 w-full rounded-2xl bg-neutral-900 p-8 text-white">
								<div class="grid gap-3">
									<h3 class="text-2xl">Gaps</h3>
									<p class="text-lg">
										Every application has blind spots — invisible fractures where data, context gets
										lost. We find these gaps and reveal them.
									</p>
								</div>
							</div>
							<div class="h-60 w-full rounded-2xl bg-neutral-900 p-8 text-white">
								<div class="grid gap-3">
									<h3 class="text-2xl">Orchestration</h3>
									<p class="text-lg">
										Start directing outcomes. Orchestration means your systems anticipate,
										coordinate, and adapt — so you focus on decisions, not mechanics.
									</p>
								</div>
							</div>
						</div>
						<div
							class="h-full w-full rounded-2xl bg-neutral-900 p-8"
							style="background-image: url('https://images.unsplash.com/photo-1507206130118-b5907f817163?q=80&w=987&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D'); background-size: cover; background-position: center;"
						></div>
						<div class="grid gap-8">
							<div class="h-60 w-full rounded-2xl bg-neutral-900 p-8 text-white">
								<div class="grid gap-3">
									<h3 class="text-2xl">Stitches</h3>
									<p class="text-lg">
										We connect disparate signals into something actionable. A living, contextual
										understanding that arrives before you ask for it.
									</p>
								</div>
							</div>
							<div class="h-60 w-full rounded-2xl bg-neutral-900 p-8 text-white">
								<div class="grid gap-3">
									<h3 class="text-2xl">Workers</h3>
									<p class="text-lg">
										Workers handle the work you shouldn't have to. Custom Workers focus on what only
										you would think to look for.
									</p>
								</div>
							</div>
						</div>
					</div>
				</div>
			</section>
			<section>
				<div class="grid gap-8 px-8 py-24">
					<div class="mx-auto grid max-w-220 gap-8 text-center">
						<span class="font-mono">FAQ's</span>
						<h2 class="text-4xl">Common Questions, Clear Answers</h2>
					</div>
					<div class="mx-auto grid w-full max-w-280 grid-cols-2 items-start gap-8">
						<ul class="grid items-start">
							{#each [{ q: 'What types of reps does Threadline work with?', a: 'Independent multi-brand reps, showroom owners, and sales agencies carrying fashion and apparel lines across any combination of wholesale platforms.' }, { q: 'Do brands need to switch to Threadline?', a: 'No. Threadline layers on top of existing platforms. Brands keep using JOOR, NuORDER, or whatever they prefer. Nothing changes for them.' }, { q: 'What makes Stitches different from analytics?', a: 'Analytics show what happened. Stitches shows what to do next \u2014 cross-brand patterns, buyer predictions, and contextual actions that arrive before you ask.' }, { q: 'How long does setup take?', a: 'Under one hour. Connect your existing platforms, import your buyer contacts, and Stitches starts learning your portfolio immediately.' }] as item, i}
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
							{#each [{ q: 'What are Workers?', a: 'Workers are automated agents that handle repetitive tasks \u2014 commission tracking, reorder alerts, buyer follow-ups. Custom Workers let you build your own for the signals only you care about.' }, { q: 'How does commission automation work?', a: 'Set rate structures per brand, define splits between showroom owners and sub-reps, and Threadline calculates everything automatically \u2014 reconciled in real time, no spreadsheets.' }, { q: 'How does pricing work?', a: 'Free for individual reps to start. Premium tiers unlock Stitches AI, Workers, multi-brand analytics, and commission automation. Transparent pricing \u2014 no annual lock-in.' }, { q: 'Is my data shared between brands?', a: 'Never. Brand data stays siloed. Stitches generates cross-brand insights from your own portfolio data \u2014 no brand sees another brand\u2019s information.' }] as item, i}
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
			<section>
				<div class="grid gap-8 px-8 py-24">
					<div class="mx-auto grid max-w-220 gap-8 text-center">
						<h2 class="text-4xl">Clarity Starts With The Right Conversation</h2>
						<p class="text-lg">
							Threadline is building the intelligence layer fashion wholesale has been missing.
							Let's talk about what it can do for your showroom.
						</p>
					</div>
					<div class="mx-auto grid w-full max-w-280 grid-cols-5 items-end gap-4">
						<div class="grid gap-4">
							<div
								class="h-50 w-full rounded-2xl bg-neutral-300"
								style="background-image: url('https://mockuuups.studio/cdn-cgi/image/width=2000/render/mockup/2/50/transparent-macbook-pro-mockup-preview.jpg'); background-size: cover; background-position: left;"
							></div>
							<div class="h-30 w-full rounded-2xl bg-neutral-300"></div>
							<div class="h-30 w-full rounded-2xl bg-neutral-300"></div>
						</div>
						<div class="grid gap-4">
							<div class="h-50 w-full rounded-2xl bg-neutral-300"></div>
							<div class="h-30 w-full rounded-2xl bg-neutral-300"></div>
						</div>
						<div class="grid gap-4">
							<div
								class="h-50 w-full rounded-2xl bg-neutral-300"
								style="background-image: url('https://images.unsplash.com/photo-1633655442164-da26330e85b4?q=80&w=985&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D'); background-size: cover; background-position: center;"
							></div>
						</div>
						<div class="grid gap-4">
							<div class="h-50 w-full rounded-2xl bg-neutral-300"></div>
							<div class="h-30 w-full rounded-2xl bg-neutral-300"></div>
						</div>
						<div class="grid gap-4">
							<div class="h-50 w-full rounded-2xl bg-neutral-300"></div>
							<div class="h-30 w-full rounded-2xl bg-neutral-300"></div>
							<div class="h-30 w-full rounded-2xl bg-neutral-300"></div>
						</div>
					</div>
				</div>
			</section>
		</div>
	</main>
	<MarketingFooter />
</div>

<style>
</style>
