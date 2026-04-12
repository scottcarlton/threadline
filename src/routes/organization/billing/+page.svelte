<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import {
		Card,
		CardHeader,
		CardTitle,
		CardDescription,
		CardContent,
		CardFooter
	} from '$lib/components/ui/card/index.js';
	import { cn } from '$lib/utils.js';
	import CreditCard from 'lucide-svelte/icons/credit-card';
	import Receipt from 'lucide-svelte/icons/receipt';
	import Check from 'lucide-svelte/icons/check';
	import Zap from 'lucide-svelte/icons/zap';
	import Crown from 'lucide-svelte/icons/crown';
	import Building2 from 'lucide-svelte/icons/building-2';

	const currentPlan = 'free';

	const plans = [
		{
			id: 'free',
			name: 'Free',
			price: '$0',
			period: 'forever',
			description: 'Get started with the basics',
			icon: Zap,
			features: [
				'Up to 3 team members',
				'1 brand',
				'100 orders / month',
				'Email support',
				'Basic reporting'
			]
		},
		{
			id: 'pro',
			name: 'Pro',
			price: '$49',
			period: '/ month',
			description: 'For growing wholesale businesses',
			icon: Crown,
			features: [
				'Unlimited team members',
				'Unlimited brands',
				'Unlimited orders',
				'Priority support',
				'Advanced reporting',
				'AI assistant',
				'Integrations'
			]
		},
		{
			id: 'enterprise',
			name: 'Enterprise',
			price: 'Custom',
			period: '',
			description: 'For large organizations with custom needs',
			icon: Building2,
			features: [
				'Everything in Pro',
				'Dedicated account manager',
				'Custom integrations',
				'SSO / SAML',
				'SLA guarantee',
				'Onboarding & training'
			]
		}
	];
</script>

<div class="space-y-8">
	<div>
		<h2 class="text-lg font-semibold">Billing</h2>
		<p class="mt-0.5 text-sm text-muted-foreground">Manage your subscription and billing details</p>
	</div>

	<!-- Current Plan -->
	<Card>
		<CardHeader>
			<div class="flex items-center gap-3">
				<CardTitle>Current Plan</CardTitle>
				<Badge variant="secondary">Free</Badge>
			</div>
			<CardDescription>You're on the Free plan. Upgrade to unlock more features.</CardDescription>
		</CardHeader>
	</Card>

	<!-- Plan Comparison -->
	<div>
		<h2 class="mb-4 text-sm font-medium uppercase tracking-wider text-muted-foreground">Plans</h2>
		<div class="grid gap-4 sm:grid-cols-3">
			{#each plans as plan}
				{@const isCurrent = plan.id === currentPlan}
				<Card class={cn('relative', isCurrent && 'border-primary')}>
					{#if isCurrent}
						<div class="absolute -top-3 left-4">
							<Badge>Current</Badge>
						</div>
					{/if}
					<CardHeader>
						<div class="flex items-center gap-2">
							<div class="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
								<plan.icon class="h-4 w-4 text-muted-foreground" />
							</div>
							<CardTitle class="text-lg">{plan.name}</CardTitle>
						</div>
						<div class="mt-2">
							<span class="text-3xl font-semibold">{plan.price}</span>
							{#if plan.period}
								<span class="text-sm text-muted-foreground">{plan.period}</span>
							{/if}
						</div>
						<CardDescription>{plan.description}</CardDescription>
					</CardHeader>
					<CardContent>
						<ul class="space-y-2">
							{#each plan.features as feature}
								<li class="flex items-center gap-2 text-sm">
									<Check class="h-4 w-4 shrink-0 text-green-600" />
									{feature}
								</li>
							{/each}
						</ul>
					</CardContent>
					<CardFooter>
						{#if isCurrent}
							<Button variant="outline" class="w-full" disabled>Current Plan</Button>
						{:else if plan.id === 'enterprise'}
							<Button variant="outline" class="w-full" disabled>Contact Sales</Button>
						{:else}
							<Button class="w-full" disabled>
								Upgrade to {plan.name}
								<span class="ml-1 text-xs opacity-60">(Coming soon)</span>
							</Button>
						{/if}
					</CardFooter>
				</Card>
			{/each}
		</div>
	</div>

	<!-- Billing Information -->
	<div class="grid gap-4 sm:grid-cols-2">
		<Card>
			<CardHeader>
				<div class="flex items-center gap-2">
					<CreditCard class="h-4 w-4 text-muted-foreground" />
					<CardTitle>Payment Method</CardTitle>
				</div>
				<CardDescription>No payment method on file</CardDescription>
			</CardHeader>
			<CardContent>
				<div class="rounded-lg border border-dashed p-6 text-center">
					<p class="text-sm text-muted-foreground">Payment methods will be available when you upgrade to a paid plan.</p>
				</div>
			</CardContent>
		</Card>

		<Card>
			<CardHeader>
				<div class="flex items-center gap-2">
					<Receipt class="h-4 w-4 text-muted-foreground" />
					<CardTitle>Invoices</CardTitle>
				</div>
				<CardDescription>Your billing history</CardDescription>
			</CardHeader>
			<CardContent>
				<div class="rounded-lg border border-dashed p-6 text-center">
					<p class="text-sm text-muted-foreground">No invoices yet. Invoices will appear here once you're on a paid plan.</p>
				</div>
			</CardContent>
		</Card>
	</div>
</div>
