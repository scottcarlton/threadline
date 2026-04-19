<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import {
		TooltipProvider,
		Tooltip as TooltipRoot,
		TooltipTrigger,
		TooltipContent
	} from '$lib/components/ui/tooltip/index.js';

	let { data } = $props();
	const intake = $derived(data.intake);
	const lineResolutions = $derived(data.lineResolutions);
	const emailBody = $derived(data.emailBody);

	const hasIssues = $derived((intake.needs_review_reasons?.length ?? 0) > 0);

	function formatDate(iso: string): string {
		return new Date(iso).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	}

	let approving = $state(false);
	let rejecting = $state(false);
</script>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex items-start justify-between">
		<div>
			<div class="flex items-center gap-2">
				<a
					href={resolve('/orders/review')}
					class="text-sm text-muted-foreground hover:text-foreground"
				>
					← Back to review
				</a>
			</div>
			<h1 class="mt-2 text-2xl font-semibold">Review Email Order</h1>
			<p class="mt-1 text-sm text-muted-foreground">
				From <span class="font-medium text-foreground">{intake.from_email}</span>
				· {formatDate(intake.created_at)}
			</p>
		</div>

		<!-- Actions -->
		<div class="flex items-center gap-2">
			{#if intake.order_id}
				<Button variant="outline" size="sm" href="/orders/{intake.order_id}">
					View Draft Order
				</Button>
			{/if}
			<form
				method="POST"
				action="?/reject"
				use:enhance={() => {
					rejecting = true;
					return async ({ update }) => {
						rejecting = false;
						await update();
					};
				}}
			>
				<Button type="submit" variant="outline" size="sm" disabled={rejecting}>
					{rejecting ? 'Rejecting…' : 'Reject'}
				</Button>
			</form>
			<form
				method="POST"
				action="?/approve"
				use:enhance={() => {
					approving = true;
					return async ({ update }) => {
						approving = false;
						await update();
					};
				}}
			>
				<Button type="submit" size="sm" disabled={approving || hasIssues}>
					{approving ? 'Approving…' : 'Approve & Submit'}
				</Button>
			</form>
		</div>
	</div>

	<div class="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1fr]">
		<!-- Left: Original email -->
		<div class="rounded-lg border p-6">
			<h2 class="text-sm font-semibold">Original Email</h2>
			{#if intake.subject}
				<p class="mt-1 text-sm text-muted-foreground">Subject: {intake.subject}</p>
			{/if}
			<div
				class="mt-4 rounded-lg bg-muted/50 p-4 font-mono text-sm leading-relaxed whitespace-pre-wrap"
			>
				{emailBody ?? '(email body not available)'}
			</div>
		</div>

		<!-- Right: Parsed & resolved -->
		<div class="space-y-6">
			<!-- Issues summary -->
			{#if hasIssues}
				<div
					class="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30"
				>
					<h3 class="text-sm font-semibold text-amber-800 dark:text-amber-200">
						{intake.needs_review_reasons?.length} issue{(intake.needs_review_reasons?.length ??
							0) !== 1
							? 's'
							: ''} found
					</h3>
					<ul class="mt-2 space-y-1">
						{#each intake.needs_review_reasons ?? [] as reason, i (i)}
							<li class="text-sm text-amber-700 dark:text-amber-300">
								{#if reason.lineIndex !== null}
									<span class="font-mono">Line {reason.lineIndex + 1}:</span>
								{/if}
								{reason.reason}
							</li>
						{/each}
					</ul>
				</div>
			{/if}

			<!-- Line resolutions -->
			<div class="rounded-lg border p-6">
				<h2 class="text-sm font-semibold">Parsed Line Items</h2>
				<div class="mt-4 space-y-4">
					{#each lineResolutions as line (line.id)}
						<div class="rounded-lg border p-4">
							<div class="flex items-start justify-between gap-2">
								<div>
									<p class="text-sm font-medium">{line.raw_text}</p>
									{#if line.products?.name}
										<p class="mt-1 text-sm text-muted-foreground">
											Matched: <span class="font-medium text-foreground">{line.products.name}</span>
											{#if line.confidence !== null}
												<span class="text-muted-foreground"
													>({(line.confidence * 100).toFixed(0)}% confidence)</span
												>
											{/if}
										</p>
									{:else}
										<p class="mt-1 text-sm text-amber-600 dark:text-amber-400">No product match</p>
									{/if}
								</div>
								{#if line.issues && line.issues.length > 0}
									<TooltipProvider>
										<TooltipRoot>
											<TooltipTrigger>
												<Badge
													variant="outline"
													class="border-amber-300 text-amber-700 dark:text-amber-300"
												>
													{line.issues.length} issue{line.issues.length !== 1 ? 's' : ''}
												</Badge>
											</TooltipTrigger>
											<TooltipContent>
												{#each line.issues as issue, j (j)}
													<p class="text-sm">{issue.detail}</p>
												{/each}
											</TooltipContent>
										</TooltipRoot>
									</TooltipProvider>
								{/if}
							</div>
						</div>
					{/each}

					{#if lineResolutions.length === 0}
						<p class="text-sm text-muted-foreground">No line items parsed</p>
					{/if}
				</div>
			</div>
		</div>
	</div>
</div>
