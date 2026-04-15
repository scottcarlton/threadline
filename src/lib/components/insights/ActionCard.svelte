<script lang="ts">
	import { Card } from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';

	type Action = {
		label: string;
		href?: string;
		prompt?: string;
		variant?: 'default' | 'outline' | 'ghost' | 'secondary';
		onclick?: () => void;
	};

	type Props = {
		id: string;
		insightType: string;
		priorityScore: number;
		title: string;
		description: string;
		metadata?: Record<string, unknown>;
		entityType?: string | null;
		entityId?: string | null;
		actions?: Action[];
		onDismiss?: (id: string) => void;
		onAct?: (id: string) => void;
	};

	let {
		id,
		insightType,
		priorityScore,
		title,
		description,
		metadata = {},
		entityId = null,
		actions = [],
		onDismiss,
		onAct
	}: Props = $props();

	const typeConfig: Record<string, { label: string; color: string; icon: string }> = {
		revenue_leakage: {
			label: 'Revenue Leakage',
			color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
			icon: 'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z'
		},
		order_gap: {
			label: 'Order Gap',
			color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
			icon: 'M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6'
		},
		call_queue: {
			label: 'Call Today',
			color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
			icon: 'M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z'
		},
		overdue_order: {
			label: 'Overdue',
			color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
			icon: 'M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z'
		}
	};

	const config = $derived(
		typeConfig[insightType] ?? {
			label: insightType,
			color: 'bg-muted text-muted-foreground',
			icon: 'M11.25 11.25l.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z'
		}
	);

	const priorityLabel = $derived(
		priorityScore >= 80 ? 'High' : priorityScore >= 50 ? 'Medium' : 'Low'
	);

	const priorityColor = $derived(
		priorityScore >= 80
			? 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800'
			: priorityScore >= 50
				? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800'
				: 'bg-muted text-muted-foreground'
	);

	// Build default actions based on insight type
	const defaultActions = $derived.by(() => {
		const defaults: Action[] = [];

		if (insightType === 'revenue_leakage') {
			defaults.push({
				label: 'Draft Email',
				variant: 'default',
				prompt: `Draft a re-engagement email for account ${entityId}. They ordered $${(metadata.prior_revenue as number)?.toLocaleString()} in ${metadata.prior_year} but nothing in ${metadata.current_year}.`
			});
			if (entityId) {
				defaults.push({ label: 'View Account', variant: 'outline', href: `/accounts/${entityId}` });
			}
		} else if (insightType === 'order_gap') {
			if (entityId) {
				defaults.push({
					label: 'Start Order',
					variant: 'default',
					href: `/orders/new?account=${entityId}&delivery=${metadata.delivery_id}`
				});
			}
			defaults.push({
				label: 'Draft Email',
				variant: 'outline',
				prompt: `Draft an email about the ${metadata.delivery_label} ${metadata.season_name} delivery for account ${entityId}. They ordered $${(metadata.prior_amount as number)?.toLocaleString()} for this window last year.`
			});
		} else if (insightType === 'overdue_order') {
			if (entityId) {
				defaults.push({ label: 'View Order', variant: 'default', href: `/orders/${entityId}` });
			}
			defaults.push({
				label: 'Draft Follow-up',
				variant: 'outline',
				prompt: `Draft a follow-up email about order ${metadata.order_number} for ${metadata.account_name}. The order ($${(metadata.total_amount as number)?.toLocaleString()}) was expected to ship on ${metadata.expected_ship_date} and is now ${metadata.days_overdue} days overdue.`
			});
		} else if (insightType === 'call_queue') {
			if (entityId) {
				defaults.push({ label: 'View Account', variant: 'default', href: `/accounts/${entityId}` });
			}
			defaults.push({
				label: 'Draft Email',
				variant: 'outline',
				prompt: `Draft a follow-up email for account ${entityId}.`
			});
			if (entityId) {
				defaults.push({
					label: 'Start Order',
					variant: 'ghost',
					href: `/orders/new?account=${entityId}`
				});
			}
		}

		return defaults;
	});

	const allActions = $derived(actions.length > 0 ? actions : defaultActions);

	function handleAction(action: Action) {
		if (action.onclick) {
			action.onclick();
		} else if (action.href) {
			goto(resolve(action.href as '/orders'));
		} else if (action.prompt) {
			// Open AI assistant with the prompt
			const event = new CustomEvent('assistant-prompt', { detail: action.prompt, bubbles: true });
			document.dispatchEvent(event);
		}
		onAct?.(id);
	}

	async function dismiss() {
		onDismiss?.(id);
	}
</script>

<Card class="relative overflow-hidden transition-all hover:shadow-md">
	<!-- Priority accent bar -->
	<div
		class="absolute top-0 bottom-0 left-0 w-1 {priorityScore >= 80
			? 'bg-red-500'
			: priorityScore >= 50
				? 'bg-amber-500'
				: 'bg-muted-foreground/30'}"
	></div>

	<div class="py-4 pr-4 pl-4">
		<!-- Header: type badge + priority + dismiss -->
		<div class="mb-2 flex items-center justify-between gap-2">
			<div class="flex items-center gap-2">
				<span
					class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold {config.color}"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						fill="none"
						viewBox="0 0 24 24"
						stroke-width="1.5"
						stroke="currentColor"
						class="h-3.5 w-3.5"
					>
						<path stroke-linecap="round" stroke-linejoin="round" d={config.icon} />
					</svg>
					{config.label}
				</span>
				<span
					class="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium {priorityColor}"
				>
					{priorityLabel}
				</span>
			</div>
			<button
				onclick={dismiss}
				class="rounded-md p-1 text-muted-foreground/50 transition-colors hover:bg-muted hover:text-muted-foreground"
				aria-label="Dismiss"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
					stroke-width="1.5"
					stroke="currentColor"
					class="h-4 w-4"
				>
					<path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
				</svg>
			</button>
		</div>

		<!-- Title + description -->
		<h3 class="mb-1 text-[15px] leading-tight font-semibold text-foreground">{title}</h3>
		<p class="mb-3 text-sm leading-relaxed text-muted-foreground">{description}</p>

		<!-- Metric highlight (if available) -->
		{#if metadata.prior_revenue}
			<div class="mb-3 flex items-center gap-4 text-sm">
				<span class="text-muted-foreground">Prior year:</span>
				<span class="font-semibold text-foreground"
					>${(metadata.prior_revenue as number).toLocaleString()}</span
				>
			</div>
		{:else if metadata.prior_amount}
			<div class="mb-3 flex items-center gap-4 text-sm">
				<span class="text-muted-foreground">Last year's order:</span>
				<span class="font-semibold text-foreground"
					>${(metadata.prior_amount as number).toLocaleString()}</span
				>
			</div>
		{:else if metadata.days_overdue != null}
			<div class="mb-3 flex items-center gap-4 text-sm">
				<span class="text-muted-foreground">Order total:</span>
				<span class="font-semibold text-foreground"
					>${(metadata.total_amount as number).toLocaleString()}</span
				>
				<span class="font-medium text-red-600 dark:text-red-400"
					>{metadata.days_overdue}d overdue</span
				>
			</div>
		{:else if metadata.health_score != null}
			<div class="mb-3 flex items-center gap-4 text-sm">
				<span class="text-muted-foreground">Health score:</span>
				<span
					class="font-semibold {(metadata.health_score as number) < 40
						? 'text-red-600 dark:text-red-400'
						: 'text-foreground'}">{metadata.health_score}/100</span
				>
				{#if metadata.days_since_last_order != null}
					<span class="text-muted-foreground/70"
						>Last order {metadata.days_since_last_order}d ago</span
					>
				{/if}
			</div>
		{/if}

		<!-- Actions -->
		{#if allActions.length > 0}
			<div class="flex flex-wrap gap-2">
				{#each allActions as action, i (i)}
					<Button
						variant={action.variant ?? 'outline'}
						size="sm"
						onclick={() => handleAction(action)}
					>
						{action.label}
					</Button>
				{/each}
			</div>
		{/if}
	</div>
</Card>
