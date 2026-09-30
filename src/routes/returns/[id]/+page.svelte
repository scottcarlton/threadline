<script lang="ts">
	import { resolve } from '$app/paths';
	import { Card, CardContent } from '$lib/components/ui/card/index.js';
	import {
		RETURN_DISPOSITION_LABELS,
		RETURN_STATUS_LABELS,
		returnCreditIssued,
		returnLinesValue,
		returnUnits,
		type ReturnDetail
	} from '$lib/utils/return-status.js';
	import {
		RETURN_REASON_LABELS,
		type ReturnReasonCode
	} from '$lib/schemas/return-authorization.js';

	let { data } = $props();
	const ra = $derived(data.returnAuthorization as ReturnDetail);
	const lines = $derived(ra.return_lines ?? []);

	const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

	// Same palette as the list, and as /invoices.
	const statusBadgeColors: Record<string, string> = {
		requested: 'bg-amber-50 text-amber-700',
		approved: 'bg-blue-50 text-blue-700',
		received: 'bg-blue-50 text-blue-700',
		closed: 'bg-emerald-50 text-emerald-700',
		declined: 'bg-zinc-100 text-zinc-500',
		cancelled: 'bg-zinc-100 text-zinc-500'
	};

	function formatDate(value: string | null): string {
		if (!value) return '—';
		return new Date(value).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

	const reasonLabel = $derived(
		ra.reason_code ? (RETURN_REASON_LABELS[ra.reason_code as ReturnReasonCode] ?? null) : null
	);

	/**
	 * Built from the timestamps on the row rather than from an audit table.
	 * Every state this feature reaches stamps its own column, so the row already
	 * is the history, and a second source could only disagree with it.
	 *
	 * A decline takes the approval's place instead of leaving a gap, because
	 * that is what happened at that step.
	 */
	const timeline = $derived.by(() => {
		const events: Array<{ label: string; at: string | null; note?: string | null }> = [
			{ label: 'Requested', at: ra.requested_at }
		];
		if (ra.status === 'declined') {
			events.push({ label: 'Declined', at: ra.approved_at, note: ra.decline_reason });
		} else if (ra.approved_at) {
			events.push({ label: 'Approved', at: ra.approved_at });
		}
		if (ra.received_at) events.push({ label: 'Goods received', at: ra.received_at });
		if (ra.credit_memo_issued_at) {
			events.push({ label: 'Credit memo issued', at: ra.credit_memo_issued_at });
		}
		if (ra.status === 'cancelled') events.push({ label: 'Cancelled', at: ra.updated_at });
		return events;
	});

	const creditIssued = $derived(returnCreditIssued(ra));
	const units = $derived(returnUnits(lines));
	const linesValue = $derived(returnLinesValue(lines));
</script>

<svelte:head><title>{ra.ra_number ?? 'Return'} · Threadline</title></svelte:head>

<div class="space-y-6">
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div>
			<a
				href={resolve('/returns')}
				class="text-sm text-muted-foreground decoration-transparent transition-[text-decoration-color] hover:decoration-current"
				>Returns</a
			>
			<div class="mt-1 flex items-center gap-3">
				<h1 class="font-mono text-2xl font-semibold">
					<!-- No number until the brand approves it; the badge carries the status. -->
					{ra.ra_number ?? 'Return'}
				</h1>
				<span
					class="inline-flex items-center rounded-full px-2.5 py-0.5 text-sm font-medium {statusBadgeColors[
						ra.status
					] ?? 'bg-zinc-100 text-zinc-500'}"
				>
					{RETURN_STATUS_LABELS[ra.status]}
				</span>
			</div>
			<p class="mt-1 text-sm text-muted-foreground">
				{ra.accounts?.business_name ?? '—'}
				{#if ra.orders?.order_number}
					· Order {ra.orders.order_number}
				{/if}
			</p>
		</div>
	</div>

	<div class="grid gap-6 lg:grid-cols-[1fr_320px]">
		<div class="space-y-6">
			<div class="overflow-x-auto border-b">
				<table class="w-full">
					<thead>
						<tr class="border-b">
							<th
								class="px-4 py-2.5 text-left text-[10px] font-medium tracking-widest text-muted-foreground/70 uppercase"
								>Style</th
							>
							<th
								class="hidden px-4 py-2.5 text-left text-[10px] font-medium tracking-widest text-muted-foreground/70 uppercase sm:table-cell"
								>Description</th
							>
							<th
								class="px-4 py-2.5 text-right text-[10px] font-medium tracking-widest text-muted-foreground/70 uppercase"
								>Qty</th
							>
							<th
								class="px-4 py-2.5 text-right text-[10px] font-medium tracking-widest text-muted-foreground/70 uppercase"
								>Unit</th
							>
							<th
								class="px-4 py-2.5 text-right text-[10px] font-medium tracking-widest text-muted-foreground/70 uppercase"
								>Total</th
							>
						</tr>
					</thead>
					<tbody class="divide-y">
						{#each lines as line (line.id)}
							<tr>
								<td class="px-4 py-3">
									<span class="font-mono text-sm">{line.style_number ?? '—'}</span>
									<p class="text-sm text-muted-foreground">
										{[
											line.color,
											line.size,
											line.disposition ? RETURN_DISPOSITION_LABELS[line.disposition] : null
										]
											.filter(Boolean)
											.join(' · ')}
									</p>
								</td>
								<td class="hidden px-4 py-3 text-sm sm:table-cell">{line.description ?? '—'}</td>
								<td class="px-4 py-3 text-right font-mono text-sm">{line.qty}</td>
								<td class="px-4 py-3 text-right font-mono text-sm"
									>{fmt.format(Number(line.unit_price))}</td
								>
								<td class="px-4 py-3 text-right font-mono text-sm"
									>{fmt.format(Number(line.line_total))}</td
								>
							</tr>
						{:else}
							<tr>
								<td colspan="5" class="px-4 py-8 text-center text-sm text-muted-foreground">
									This return has no items.
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>

			{#if reasonLabel || ra.reason}
				<div>
					<h2 class="text-sm font-semibold">Reason</h2>
					{#if reasonLabel}
						<p class="mt-2 text-sm">{reasonLabel}</p>
					{/if}
					{#if ra.reason}
						<p class="mt-1 text-sm text-muted-foreground">{ra.reason}</p>
					{/if}
				</div>
			{/if}

			<div>
				<h2 class="text-sm font-semibold">History</h2>
				<div class="mt-2 rounded-lg border p-2">
					{#each timeline as event (event.label)}
						<div class="flex items-center justify-between rounded-lg px-3 py-2">
							<div>
								<p class="text-sm font-medium">{event.label}</p>
								{#if event.note}
									<p class="text-sm text-muted-foreground">{event.note}</p>
								{/if}
							</div>
							<p class="text-sm text-muted-foreground">{formatDate(event.at)}</p>
						</div>
					{/each}
				</div>
			</div>
		</div>

		<div class="space-y-4">
			<Card>
				<CardContent class="space-y-2 pt-4 pb-4">
					<div class="flex justify-between text-sm">
						<span class="text-muted-foreground">Units</span>
						<span class="font-mono">{units}</span>
					</div>
					<div class="flex justify-between text-sm">
						<span class="text-muted-foreground">Merchandise</span>
						<span class="font-mono">{fmt.format(linesValue)}</span>
					</div>
					{#if !ra.orders}
						<div class="flex justify-between text-sm">
							<span class="text-muted-foreground">Order</span>
							<span>Entered by hand</span>
						</div>
					{/if}
					<!-- Not for the issuing brand, which is reading its own name back. -->
					{#if ra.brands?.name && !data.isIssuer}
						<div class="flex justify-between text-sm">
							<span class="text-muted-foreground">Brand</span>
							<span>{ra.brands.name}</span>
						</div>
					{/if}
				</CardContent>
			</Card>

			<!--
				Only once a memo exists. The money columns carry zeroes from the moment
				the row is created, so rendering them early would state a $0.00 credit
				that nobody has decided on as though it were the answer.
			-->
			{#if creditIssued}
				<Card>
					<CardContent class="space-y-2 pt-4 pb-4">
						<p class="font-mono text-sm font-medium text-muted-foreground">
							{ra.credit_memo_number} · {formatDate(ra.credit_memo_issued_at)}
						</p>
						<div class="flex justify-between text-sm">
							<span class="text-muted-foreground">Merchandise</span>
							<span class="font-mono">{fmt.format(Number(ra.credit_subtotal))}</span>
						</div>
						{#if Number(ra.restocking_fee) > 0}
							<div class="flex justify-between text-sm">
								<span class="text-muted-foreground">Restocking fee</span>
								<span class="font-mono">-{fmt.format(Number(ra.restocking_fee))}</span>
							</div>
						{/if}
						{#if Number(ra.shipping_deduction) > 0}
							<div class="flex justify-between text-sm">
								<span class="text-muted-foreground">Return shipping</span>
								<span class="font-mono">-{fmt.format(Number(ra.shipping_deduction))}</span>
							</div>
						{/if}
						{#if Number(ra.credit_tax) > 0}
							<div class="flex justify-between text-sm">
								<span class="text-muted-foreground">Tax</span>
								<span class="font-mono">{fmt.format(Number(ra.credit_tax))}</span>
							</div>
						{/if}
						<div class="flex justify-between border-t pt-2 text-base font-semibold">
							<span>Credit</span>
							<span class="font-mono">{fmt.format(Number(ra.credit_total))}</span>
						</div>
					</CardContent>
				</Card>
			{/if}
		</div>
	</div>
</div>
