<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/stores';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Alert, AlertTitle, AlertDescription } from '$lib/components/ui/alert/index.js';
	import {
		Card,
		CardHeader,
		CardTitle,
		CardDescription,
		CardContent,
		CardFooter
	} from '$lib/components/ui/card/index.js';
	import { cn } from '$lib/utils.js';
	import { PLANS, isPlanKey, type PlanKey } from '$lib/billing/plans.js';
	import { hasPaymentIssue, isLiveStatus } from '$lib/billing/status.js';

	let { data } = $props();

	let pending = $state<PlanKey | 'portal' | null>(null);

	const subscription = $derived(data.subscription);
	const live = $derived(isLiveStatus(subscription?.status));
	const currentPlan = $derived(
		live && isPlanKey(subscription?.plan) ? PLANS[subscription.plan] : null
	);
	const paymentIssue = $derived(hasPaymentIssue(subscription?.status));
	const periodEnd = $derived(
		subscription?.current_period_end
			? new Date(subscription.current_period_end).toLocaleDateString('en-US', {
					month: 'long',
					day: 'numeric',
					year: 'numeric'
				})
			: null
	);
	const hasBillingAccount = $derived(!!subscription);

	onMount(() => {
		if ($page.url.searchParams.get('checkout') !== 'success') return;
		toast.success('Subscription started. It can take a moment to show here.');
		goto(resolve('/organization/billing'), {
			replaceState: true,
			keepFocus: true,
			noScroll: true,
			invalidateAll: true
		});
	});

	async function redirectTo(endpoint: string, body?: unknown): Promise<void> {
		const res = await fetch(endpoint, {
			method: 'POST',
			headers: body ? { 'content-type': 'application/json' } : undefined,
			body: body ? JSON.stringify(body) : undefined
		});
		const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
		if (!res.ok || !json.url) throw new Error(json.error ?? 'Something went wrong');
		window.location.assign(json.url);
	}

	async function choosePlan(plan: PlanKey) {
		pending = plan;
		try {
			await redirectTo('/api/billing/checkout', { plan });
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Could not start checkout');
			pending = null;
		}
	}

	async function openPortal() {
		pending = 'portal';
		try {
			await redirectTo('/api/billing/portal');
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Could not open billing');
			pending = null;
		}
	}
</script>

<div class="space-y-8">
	<div class="flex items-start justify-between gap-4">
		<div>
			<h2 class="text-lg font-semibold">Billing</h2>
			<p class="mt-0.5 text-sm text-muted-foreground">Your plan, payment method, and invoices</p>
		</div>
		{#if hasBillingAccount}
			<Button variant="outline" onclick={openPortal} disabled={pending !== null}>
				{pending === 'portal' ? 'Opening...' : 'Manage billing'}
			</Button>
		{/if}
	</div>

	{#if paymentIssue}
		<Alert variant="destructive">
			<AlertTitle>Your last payment failed</AlertTitle>
			<AlertDescription>
				Update your payment method in Manage billing to keep your plan.
			</AlertDescription>
		</Alert>
	{/if}

	<!-- Current Plan -->
	<Card>
		<CardHeader>
			<div class="flex items-center gap-3">
				<CardTitle>Current plan</CardTitle>
				<Badge variant="secondary">{currentPlan ? currentPlan.name : 'Beta'}</Badge>
			</div>
			<CardDescription>
				{#if currentPlan && subscription?.cancel_at_period_end && periodEnd}
					Ends {periodEnd}. Nothing more will be billed.
				{:else if currentPlan && periodEnd}
					${currentPlan.monthlyPrice} a month. Renews {periodEnd}.
				{:else if currentPlan}
					${currentPlan.monthlyPrice} a month.
				{:else}
					{data.checkoutOpen
						? 'Free during beta. Nothing is billed until you choose a plan.'
						: 'Free during beta. Plans open when the beta ends.'}
				{/if}
			</CardDescription>
		</CardHeader>
	</Card>

	<!-- Plan Comparison -->
	<div>
		<h2 class="mb-4 text-sm font-medium tracking-wider text-muted-foreground uppercase">Plans</h2>
		<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
			{#each data.plans as plan (plan.key)}
				{@const isCurrent = currentPlan?.key === plan.key}
				<Card class={cn('relative flex flex-col', isCurrent && 'border-primary')}>
					{#if isCurrent}
						<div class="absolute -top-3 left-4">
							<Badge>Current</Badge>
						</div>
					{/if}
					<CardHeader>
						<CardTitle class="text-lg">{plan.name}</CardTitle>
						<div class="mt-2">
							<span class="text-3xl font-semibold">${plan.monthlyPrice}</span>
							<span class="text-sm text-muted-foreground">/ month</span>
						</div>
					</CardHeader>
					<CardContent class="flex-1">
						<ul class="space-y-2">
							{#each plan.features as feature (feature)}
								<li class="flex items-start gap-2 text-sm">
									<svg
										class="mt-0.5 h-4 w-4 shrink-0"
										viewBox="0 0 24 24"
										fill="currentColor"
										aria-hidden="true"
									>
										<path
											d="M9.9997 15.1709L19.1921 5.97852L20.6063 7.39273L9.9997 17.9993L3.63574 11.6354L5.04996 10.2212L9.9997 15.1709Z"
										/>
									</svg>
									{feature}
								</li>
							{/each}
						</ul>
					</CardContent>
					<CardFooter>
						{#if isCurrent}
							<Button variant="outline" class="w-full" disabled>Current plan</Button>
						{:else if live}
							<Button
								variant="outline"
								class="w-full"
								onclick={openPortal}
								disabled={pending !== null}
							>
								Switch to {plan.name}
							</Button>
						{:else if !data.checkoutOpen}
							<Button variant="outline" class="w-full" disabled>Opens after beta</Button>
						{:else}
							<Button
								class="w-full"
								onclick={() => choosePlan(plan.key)}
								disabled={pending !== null}
							>
								{pending === plan.key ? 'Opening checkout...' : `Choose ${plan.name}`}
							</Button>
						{/if}
					</CardFooter>
				</Card>
			{/each}

			<Card class="flex flex-col">
				<CardHeader>
					<CardTitle class="text-lg">Enterprise</CardTitle>
					<div class="mt-2">
						<span class="text-3xl font-semibold">Custom</span>
					</div>
				</CardHeader>
				<CardContent class="flex-1">
					<ul class="space-y-2">
						{#each ['SSO with SAML', 'Audit log', 'Dedicated onboarding'] as feature (feature)}
							<li class="flex items-start gap-2 text-sm">
								<svg
									class="mt-0.5 h-4 w-4 shrink-0"
									viewBox="0 0 24 24"
									fill="currentColor"
									aria-hidden="true"
								>
									<path
										d="M9.9997 15.1709L19.1921 5.97852L20.6063 7.39273L9.9997 17.9993L3.63574 11.6354L5.04996 10.2212L9.9997 15.1709Z"
									/>
								</svg>
								{feature}
							</li>
						{/each}
					</ul>
				</CardContent>
				<CardFooter>
					<Button variant="outline" class="w-full" href="mailto:hello@threadline.systems">
						Contact sales
					</Button>
				</CardFooter>
			</Card>
		</div>
	</div>
</div>
