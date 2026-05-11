<script lang="ts">
	import MarketingNav from '$lib/components/marketing/MarketingNav.svelte';
	import MarketingFooter from '$lib/components/marketing/MarketingFooter.svelte';
	import EmailSignup from '$lib/components/marketing/EmailSignup.svelte';

	async function subscribeToBeta(email: string) {
		const res = await fetch('/api/beta/subscribe', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ email })
		});
		return res.json();
	}
</script>

<svelte:head>
	<title>Threadline. Private beta.</title>
</svelte:head>

<MarketingNav />

<main class="mx-auto max-w-2xl px-8 pt-40 pb-24 text-center">
	<h1 class="text-4xl font-semibold tracking-tight">Private beta.</h1>
	<p class="mt-4 text-lg text-muted-foreground">
		Threadline is currently in private beta. We're working with a select group of brands and reps to
		refine the system before opening it up.
	</p>
	<p class="mt-6 text-sm text-muted-foreground">
		Interested in early access? Reach out and we'll get you on the list.
	</p>
	<div class="mt-8 flex justify-center">
		<EmailSignup onsubmit={subscribeToBeta} />
	</div>
</main>

<MarketingFooter />
