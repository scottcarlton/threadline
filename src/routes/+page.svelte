<script lang="ts">
	import { onMount } from 'svelte';
	import MarketingNav from '$lib/components/marketing/MarketingNav.svelte';
	import MarketingFooter from '$lib/components/marketing/MarketingFooter.svelte';
	import EmailSignup from '$lib/components/marketing/EmailSignup.svelte';
	import InstallCta from '$lib/components/pwa/InstallCta.svelte';
	import BrowserWrapper from '$lib/components/marketing/BrowserWrapper.svelte';
	import Minithread from '$lib/components/marketing/minithread/Minithread.svelte';

	let faqOpen = $state<number | null>(null);

	function toggleFaq(index: number) {
		faqOpen = faqOpen === index ? null : index;
	}

	async function subscribeToBeta(email: string) {
		const res = await fetch('/api/beta/subscribe', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ email })
		});
		return res.json();
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
	<title>Threadline. AI-native wholesale system.</title>
</svelte:head>

<div>
	<MarketingNav />
	<main>
		<div>
			<section data-section="hero">
				<div class="grid gap-8 px-5 pt-28 sm:gap-12 sm:px-8 md:px-12 md:pt-32">
					<div class="grid pt-12 sm:pt-24 md:grid-cols-2 md:pt-42">
						<div>
							<div class="mb-8 space-y-2">
								<h1
									class="h-reveal text-3xl leading-10 opacity-0 sm:text-4xl sm:leading-12 md:text-5xl md:leading-14"
								>
									We work where you work.
								</h1>
								<p class="h-reveal max-w-xl text-neutral-700 opacity-0">
									An AI-native wholesale system for brands and multi-brand reps. See what's moving,
									what's not, and what to do.
								</p>
							</div>
							<EmailSignup onsubmit={subscribeToBeta} />
						</div>
					</div>
					<div
						class="h-60 rounded-lg bg-neutral-200 p-6 pb-16 sm:h-80 sm:p-8 sm:pb-16 md:h-100 md:min-h-180 md:p-12 md:pb-16"
					>
						<BrowserWrapper class="mx-auto h-full max-w-[1200px]">
							<Minithread />
						</BrowserWrapper>
						<p class="mt-3 text-center font-mono text-xs text-muted-foreground">
							This is a demo version of our application.
						</p>
					</div>
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
			<!-- <section data-section="about-threadline">
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
			</section> -->
			<section data-section="what-we-feature">
				<div class="px-5 py-16 sm:px-8 sm:py-20 md:px-12 md:py-24">
					<div class="grid gap-8 sm:gap-12">
						<div class="reveal grid max-w-220 gap-2 opacity-0">
							<!-- <span class="font-mono">[What We Feature]</span> -->
							<h2 class="text-3xl sm:text-4xl">
								Work, without the <span class="text-muted-foreground">work</span>.
							</h2>
						</div>
						<ul class="grid grid-cols-1 gap-6 md:grid-cols-12" data-stagger>
							<li
								class="grid min-h-80 gap-4 rounded-md bg-neutral-200 p-4 opacity-0 md:col-span-8 md:min-h-120 md:grid-cols-2"
								data-s
							>
								<div>
									<h3 class="mb-2 text-xl">The work behind the work, handled.</h3>
									<p class="text-neutral-600">
										Workers run in the background. Order entry, report runs, status checks. Your
										team focuses on the line, the relationship, and the buyer in front of them.
									</p>
								</div>
								<div class="md:col-start-2 md:row-start-2">
									<div class="h-full min-h-40 w-full rounded-lg bg-neutral-100 md:min-h-0"></div>
								</div>
							</li>
							<li
								class="grid gap-4 rounded-md bg-neutral-200 p-4 opacity-0 md:col-span-4 md:col-start-9"
								data-s
							>
								<div>
									<h3 class="mb-2 text-xl">Decisions, not dashboards.</h3>
									<p class="text-neutral-600">
										Stitch surfaces what matters with the action already named. Brands see the
										accounts going quiet. Reps see the buyer texting at 6pm. No charts to interpret,
										no reports to run.
									</p>
								</div>
								<div class="md:row-start-2">
									<div class="h-full min-h-40 w-full rounded-lg bg-neutral-100 md:min-h-0"></div>
								</div>
							</li>
							<li
								class="grid min-h-80 gap-4 rounded-md bg-neutral-200 p-4 opacity-0 md:col-span-4 md:min-h-120"
								data-s
							>
								<div>
									<h3 class="mb-2 text-xl">Brands and reps, partners.</h3>
									<p class="text-neutral-600">
										Same data, same visibility, two-way flow. A brand invites a rep. The brand's
										data lives in the rep's workspace; the rep's signal flows back. One system, no
										parallel silos.
									</p>
								</div>
								<div class="md:row-start-2">
									<div class="h-full min-h-40 w-full rounded-lg bg-neutral-100 md:min-h-0"></div>
								</div>
							</li>
							<li
								class="grid gap-4 rounded-md bg-neutral-200 p-4 opacity-0 md:col-span-8 md:col-start-5 md:grid-cols-2"
								data-s
							>
								<div>
									<h3 class="mb-2 text-xl">Built AI-native.</h3>
									<p class="text-neutral-600">
										Forward an email. Type or talk to Stitch. They become orders, accounts, answers.
										Threadline was built for this from day one. AI isn't a feature on top, it's the
										foundation.
									</p>
								</div>
								<div class="md:col-start-2 md:row-start-2">
									<div class="h-full min-h-40 w-full rounded-lg bg-neutral-100 md:min-h-0"></div>
								</div>
							</li>
						</ul>
					</div>
				</div>
			</section>
			<section data-section="how-we-work">
				<div class="grid gap-12 px-5 py-16 sm:gap-16 sm:px-8 sm:py-20 md:gap-24 md:px-12 md:py-24">
					<div class="mx-auto grid max-w-220 gap-2 text-center">
						<span class="font-mono">[How it works]</span>
						<h2 class="text-3xl sm:text-4xl">
							Stitch finds the work.
							<span class="text-muted-foreground">Workers do the work.</span>
						</h2>
					</div>
					<ul class="grid gap-12 sm:gap-16 md:gap-24">
						<li class="grid items-center gap-6 md:grid-cols-12">
							<div class="md:col-span-4">
								<h3 class="mb-3 text-2xl">Stitch</h3>
								<p class="text-balance text-neutral-700">
									Stitch is our AI. Send it an email, a text, or your voice, and Stitch turns the
									input into orders, accounts, and answers. The patterns it surfaces across your
									business become Stitches.
								</p>
							</div>
							<div
								class="h-60 w-full rounded-lg bg-neutral-200 sm:h-80 md:col-span-7 md:col-start-6 md:h-120"
							></div>
						</li>
						<li class="grid items-center gap-6 md:grid-cols-12">
							<div class="md:col-span-4 md:col-start-9">
								<h3 class="mb-3 text-2xl">Workers</h3>
								<p class="text-balance text-neutral-700">
									Workers handle the work you shouldn't have to. Order entry, report runs, status
									checks. Custom Workers go after what only your business would think to look for.
								</p>
							</div>
							<div
								class="h-60 w-full rounded-lg bg-neutral-200 sm:h-80 md:col-span-7 md:col-start-1 md:row-start-1 md:h-120"
							></div>
						</li>
					</ul>
				</div>
			</section>
			<section data-section="faq">
				<div class="grid gap-12 px-5 py-16 sm:gap-16 sm:px-8 sm:py-20 md:gap-24 md:px-12 md:py-24">
					<div class="mx-auto grid max-w-220 gap-2 text-center">
						<span class="font-mono">[FAQ]</span>
						<h2 class="text-3xl sm:text-4xl">
							Common questions. <span class="text-muted-foreground">Clear answers.</span>
						</h2>
					</div>
					<div class="mx-auto grid w-full max-w-280 grid-cols-1 items-start gap-8 md:grid-cols-2">
						<ul class="grid items-start">
							{#each [{ q: 'Who is Threadline for?', a: "Small-to-midsize fashion brands and the multi-brand reps. Threadline runs the day-to-day: orders, accounts, products, commissions, appointments, shows, expenses, reports. Stitch surfaces what matters; Workers handle the work that's tax on your day." }, { q: 'How do I switch to Threadline?', a: 'Hands-on during private beta. You bring your data in via CSV (accounts, brands, products) plus PDF linesheets that Stitch parses into products automatically. We map your fields with you during onboarding, so day one starts with your real data.' }, { q: 'What does Stitch do?', a: 'Stitch is our AI. It runs across your orders, accounts, and pipeline and surfaces what needs attention: revenue trending, accounts going quiet, orders stuck, shows performing, style velocity. Each one comes with what to do. You can also work with Stitch directly. Email orders to stitch@threadline.systems, or type or talk to Stitch to create orders, set up accounts, or pull data on the fly.' }, { q: 'How long does setup take?', a: 'Setup happens during onboarding. We bring your data in, walk you through the modules, and turn on email ordering and other integrations you want. Most teams are running in a session or two.' }] as item, i (i)}
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
							{#each [{ q: 'What are Workers?', a: "Workers are AI agents we build into Threadline. They run on events (a new order, an account going quiet) and take actions like drafting emails, updating records, or searching what's in your system. Custom Workers are the ones you build yourself, for the things only your business would think to look for." }, { q: 'How does Threadline connect brands and reps?', a: "Brands invite reps. The rep accepts and sees the brand's data in Threadline. When the rep places an order against the brand, the order flows back to the brand automatically. Each connection is its own silo: a rep carrying three brands sees the three brands' data in one Threadline; each brand only sees what's been written for them." }, { q: 'What about my data?', a: "Data is siloed by connection. A multi-brand rep can be invited by multiple brands, and only the data relevant to that connection is shared. Brand A never sees Brand B's data. Reps never see another rep's accounts. Row-level security enforces this at the database." }, { q: 'How does pricing work during beta?', a: 'The private beta is free. Beta participants get preferred pricing when Threadline moves to public release.' }] as item, i (i)}
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
				<div class="grid gap-8 px-5 py-16 sm:px-8 sm:py-20 md:px-12 md:py-24">
					<div class="mx-auto grid max-w-220 space-y-2 text-center">
						<h2 class="text-3xl sm:text-4xl">Clarity starts with the right conversation.</h2>
						<p class="mx-auto max-w-full text-balance text-neutral-700 sm:max-w-8/12">
							Threadline is in private beta. We're working with a select group of brands and
							multi-brand reps to refine the system before public launch.
						</p>
					</div>
					<ul class="grid grid-cols-1 gap-6 md:grid-cols-12">
						<li class="h-60 w-full rounded-lg bg-neutral-200 sm:h-80 md:col-span-12 md:h-120"></li>
						<li
							class="h-60 w-full rounded-lg bg-neutral-200 sm:h-80 md:col-span-6 md:row-start-2 md:h-120"
						></li>
						<li
							class="h-60 w-full rounded-lg bg-neutral-200 sm:h-80 md:col-span-6 md:row-start-2 md:h-120"
						></li>
					</ul>
				</div>
			</section>
			<section data-section="cta">
				<div class="grid justify-center space-y-6 px-5 py-16 sm:px-8 sm:py-20 md:px-12 md:py-24">
					<h2 class="text-3xl sm:text-4xl">Get early access to Threadline</h2>
					<EmailSignup onsubmit={subscribeToBeta} />
					<div class="flex items-center justify-center gap-3 text-sm text-muted-foreground">
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
