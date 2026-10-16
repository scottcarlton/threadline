<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { toast } from 'svelte-sonner';
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Card, CardContent } from '$lib/components/ui/card/index.js';
	import {
		Dialog,
		DialogContent,
		DialogTitle,
		DialogDescription
	} from '$lib/components/ui/dialog/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { SelectField } from '$lib/components/ui/select/index.js';
	import { declineReturnSchema, receiveReturnSchema } from '$lib/schemas/return-transition.js';
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

	let declineOpen = $state(false);
	let receiveOpen = $state(false);
	let cancelOpen = $state(false);
	let pending = $state<'approve' | 'cancel' | null>(null);

	// svelte-ignore state_referenced_locally
	const {
		form: declineData,
		errors: declineErrors,
		enhance: declineEnhance,
		submitting: declineSubmitting
	} = superForm(data.declineForm, {
		id: 'decline-return',
		validators: zod4Client(declineReturnSchema),
		validationMethod: 'onblur',
		onUpdated: ({ form }) => {
			if (form.message?.type === 'success') {
				declineOpen = false;
				toast.success('Return declined.');
				invalidate('data:returns');
			} else if (form.message) {
				toast.error(String(form.message));
			}
		},
		onError: ({ result }) => toast.error(result.error?.message ?? 'Could not decline the return.')
	});

	// svelte-ignore state_referenced_locally
	const {
		form: receiveData,
		enhance: receiveEnhance,
		submitting: receiveSubmitting
	} = superForm(data.receiveForm, {
		id: 'receive-return',
		dataType: 'json',
		validators: zod4Client(receiveReturnSchema),
		onUpdated: ({ form }) => {
			if (form.message?.type === 'success') {
				receiveOpen = false;
				toast.success('Return received.');
				invalidate('data:returns');
			} else if (form.message) {
				toast.error(String(form.message));
			}
		},
		onError: ({ result }) => toast.error(result.error?.message ?? 'Could not receive the return.')
	});

	function openReceive() {
		// Restock is the default because it is what happens to most returned
		// wholesale goods. The brand changes the exceptions, not every line.
		receiveData.update((d) => ({
			...d,
			dispositions: lines.map((l) => ({ lineId: l.id, disposition: 'restock' as const }))
		}));
		receiveOpen = true;
	}

	const dispositionItems = (['restock', 'damaged', 'destroy'] as const).map((value) => ({
		value,
		label: RETURN_DISPOSITION_LABELS[value]
	}));

	const restockSkipNotes: Record<string, string> = {
		no_variant: 'Not linked to a catalog item, so no stock changes.',
		untracked: 'Stock is not tracked for this item, so no count changes.',
		shopify: 'Stock syncs from Shopify. Restock it there.'
	};

	/** Approve and cancel carry no fields, so they post plainly. */
	function plainAction(name: 'approve' | 'cancel', done: string, failed: string): SubmitFunction {
		return () => {
			pending = name;
			return async ({ result }) => {
				pending = null;
				if (result.type === 'success') {
					cancelOpen = false;
					toast.success(done);
					await invalidate('data:returns');
				} else if (result.type === 'failure') {
					toast.error(String(result.data?.message ?? failed));
				} else if (result.type === 'error') {
					toast.error(result.error?.message ?? failed);
				}
			};
		};
	}

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
			// No declined_at column, and a decline is the last write a declined
			// return receives, so updated_at is when it happened. Same as cancel.
			events.push({ label: 'Declined', at: ra.updated_at, note: ra.decline_reason });
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

		<!--
			One primary action for where the return is: a request waits on a
			decision, an approved return waits on the goods. The negative action
			sits beside it with less weight. Brand only; a rep or buyer asked for
			this and sees its progress, not the controls.
		-->
		{#if data.canAction}
			<div class="flex items-center gap-2">
				{#if ra.status === 'requested'}
					<Button variant="outline" onclick={() => (declineOpen = true)}>Decline</Button>
					<form
						method="POST"
						action="?/approve"
						use:enhance={plainAction(
							'approve',
							'Return approved.',
							'Could not approve the return.'
						)}
					>
						<Button type="submit" disabled={pending === 'approve'}>
							{pending === 'approve' ? 'Approving…' : 'Approve'}
						</Button>
					</form>
				{:else if ra.status === 'approved'}
					<Button
						variant="ghost"
						class="text-destructive hover:bg-destructive/10 hover:text-destructive"
						onclick={() => (cancelOpen = true)}>Cancel return</Button
					>
					<Button onclick={openReceive}>Receive goods</Button>
				{/if}
			</div>
		{/if}
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

<Dialog bind:open={declineOpen}>
	<DialogContent class="max-w-md p-6">
		<DialogTitle>Decline this return?</DialogTitle>
		<DialogDescription>The requester sees your reason.</DialogDescription>

		<form method="POST" action="?/decline" use:declineEnhance class="mt-5 space-y-4">
			<div class="space-y-2">
				<Label for="decline-reason">Reason</Label>
				<Input
					id="decline-reason"
					name="reason"
					placeholder="Outside the return window"
					bind:value={$declineData.reason}
				/>
				{#if $declineErrors.reason}
					<p class="text-sm text-destructive">{$declineErrors.reason[0]}</p>
				{/if}
			</div>

			<div class="flex justify-end gap-2 pt-2">
				<Button type="button" variant="outline" onclick={() => (declineOpen = false)}>
					Keep it
				</Button>
				<Button type="submit" disabled={$declineSubmitting}>
					{$declineSubmitting ? 'Declining…' : 'Decline return'}
				</Button>
			</div>
		</form>
	</DialogContent>
</Dialog>

<!--
	Receive. Every line needs a disposition before the goods count as in, and
	the lines that will not move stock say so here, before anything changes,
	rather than leaving the brand to notice a count that stayed put.
-->
<Dialog bind:open={receiveOpen}>
	<DialogContent class="max-w-lg p-6">
		<DialogTitle>Receive {ra.ra_number ?? 'return'}</DialogTitle>
		<DialogDescription>
			Set what happens to each item. Restocked items go back into available stock.
		</DialogDescription>

		<form method="POST" action="?/receive" use:receiveEnhance class="mt-5 space-y-4">
			<div class="max-h-[50vh] space-y-3 overflow-y-auto">
				{#each $receiveData.dispositions as row, i (row.lineId)}
					{@const line = lines.find((l) => l.id === row.lineId)}
					{@const skip = data.restockSkips[row.lineId]}
					<div class="flex items-start justify-between gap-4">
						<div class="min-w-0">
							<p class="text-sm">
								<span class="font-mono">{line?.style_number ?? '—'}</span>
								<span class="text-muted-foreground">
									· {[line?.color, line?.size].filter(Boolean).join(' · ')} · {line?.qty} units
								</span>
							</p>
							{#if row.disposition === 'restock' && skip}
								<p class="mt-1 text-sm text-muted-foreground">{restockSkipNotes[skip]}</p>
							{/if}
						</div>
						<div class="w-36 shrink-0">
							<SelectField
								value={row.disposition}
								items={dispositionItems}
								placeholder="Disposition"
								onValueChange={(v) =>
									($receiveData.dispositions[i].disposition = v as
										| 'restock'
										| 'damaged'
										| 'destroy')}
							/>
						</div>
					</div>
				{/each}
			</div>

			<div class="flex justify-end gap-2 pt-2">
				<Button type="button" variant="outline" onclick={() => (receiveOpen = false)}>
					Not yet
				</Button>
				<Button type="submit" disabled={$receiveSubmitting}>
					{$receiveSubmitting ? 'Receiving…' : 'Mark received'}
				</Button>
			</div>
		</form>
	</DialogContent>
</Dialog>

<Dialog bind:open={cancelOpen}>
	<DialogContent class="max-w-md p-6">
		<DialogTitle>Cancel {ra.ra_number ?? 'this return'}?</DialogTitle>
		<DialogDescription>
			This cannot be undone. The return keeps its number and stays in your records, marked
			cancelled, so the numbering stays unbroken.
		</DialogDescription>

		<form
			method="POST"
			action="?/cancel"
			use:enhance={plainAction('cancel', 'Return cancelled.', 'Could not cancel the return.')}
			class="mt-5 flex justify-end gap-2"
		>
			<Button type="button" variant="outline" onclick={() => (cancelOpen = false)}>
				Keep return
			</Button>
			<Button type="submit" variant="destructive" disabled={pending === 'cancel'}>
				{pending === 'cancel' ? 'Cancelling…' : 'Cancel return'}
			</Button>
		</form>
	</DialogContent>
</Dialog>
