<script lang="ts">
	import { invalidate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Card, CardContent } from '$lib/components/ui/card/index.js';
	import {
		Dialog,
		DialogContent,
		DialogOverlay,
		DialogPortal,
		DialogTitle,
		DialogDescription
	} from '$lib/components/ui/dialog/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { SelectField } from '$lib/components/ui/select/index.js';
	import DateSelect from '$lib/components/ui/date-select.svelte';
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { recordPaymentSchema, voidInvoiceSchema } from '$lib/schemas/invoice-payment.js';
	import { paymentTermLabel } from '$lib/payment-methods.js';
	import {
		invoiceDisplayStatus,
		invoiceBalance,
		type InvoiceDetail
	} from '$lib/utils/invoice-status.js';

	let { data } = $props();
	const invoice = $derived(data.invoice as InvoiceDetail);
	const today = $derived(data.today as string);
	const canSend = $derived(data.canSend as boolean);
	const canRecordMoney = $derived(data.canRecordMoney as boolean);
	const paymentMethods = $derived(data.paymentMethods as { code: string; label: string }[]);

	// Money can only move on a document that has actually been issued.
	const isIssued = $derived(
		invoice.status === 'sent' || invoice.status === 'partial' || invoice.status === 'paid'
	);

	let paymentOpen = $state(false);
	let voidOpen = $state(false);

	// svelte-ignore state_referenced_locally
	const {
		form: paymentData,
		errors: paymentErrors,
		enhance: paymentEnhance,
		submitting: paymentSubmitting
	} = superForm(data.paymentForm, {
		id: 'record-payment',
		validators: zod4Client(recordPaymentSchema),
		validationMethod: 'onblur',
		onUpdated: ({ form }) => {
			if (form.message?.type === 'success') {
				paymentOpen = false;
				toast.success('Payment recorded.');
				invalidate('data:invoices');
			} else if (form.message) {
				toast.error(String(form.message));
			}
		},
		onError: ({ result }) => toast.error(result.error?.message ?? 'Could not record the payment.')
	});

	// svelte-ignore state_referenced_locally
	const {
		form: voidData,
		enhance: voidEnhance,
		submitting: voidSubmitting
	} = superForm(data.voidForm, {
		id: 'void-invoice',
		validators: zod4Client(voidInvoiceSchema),
		validationMethod: 'onblur',
		onUpdated: ({ form }) => {
			if (form.message?.type === 'success') {
				voidOpen = false;
				toast.success(`Invoice ${invoice.invoice_number ?? ''} voided.`);
				invalidate('data:invoices');
			} else if (form.message) {
				toast.error(String(form.message));
			}
		},
		onError: ({ result }) => toast.error(result.error?.message ?? 'Could not void the invoice.')
	});

	function openPaymentDialog() {
		// Default to the outstanding balance and today. The overwhelmingly
		// common case is "they paid what they owed, today", so typing should be
		// the exception rather than the default.
		paymentData.update((d) => ({
			...d,
			amount: balance > 0 ? Number(balance.toFixed(2)) : 0,
			paidOn: today
		}));
		paymentOpen = true;
	}

	const display = $derived(invoiceDisplayStatus(invoice, today));
	const balance = $derived(invoiceBalance(invoice));
	const isDraft = $derived(invoice.status === 'draft');

	const fmt = new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD',
		minimumFractionDigits: 2,
		maximumFractionDigits: 2
	});

	const statusLabels: Record<string, string> = {
		draft: 'Draft',
		sent: 'Sent',
		partial: 'Part paid',
		paid: 'Paid',
		void: 'Void',
		overdue: 'Overdue'
	};

	const statusBadgeColors: Record<string, string> = {
		draft: 'bg-zinc-100 text-zinc-600',
		sent: 'bg-blue-50 text-blue-700',
		partial: 'bg-amber-50 text-amber-700',
		paid: 'bg-emerald-50 text-emerald-700',
		void: 'bg-zinc-100 text-zinc-500',
		overdue: 'bg-red-50 text-red-700'
	};

	function formatDate(value: string | null): string {
		if (!value) return '—';
		return new Date(`${value}T00:00:00Z`).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			timeZone: 'UTC'
		});
	}

	let sending = $state(false);

	async function send() {
		sending = true;
		try {
			const res = await fetch(`/api/invoices/${invoice.id}/send`, { method: 'POST' });
			const body = await res.json();

			if (!res.ok) {
				toast.error(body.error ?? 'Could not send the invoice.');
				return;
			}

			// The endpoint reports issuing and delivery separately, because the
			// invoice can be issued while the email fails. Collapsing those into
			// one "it worked" would leave the brand believing a buyer has a
			// document they never received.
			if (body.delivered) {
				toast.success(`Invoice ${body.invoice_number} sent.`);
			} else {
				toast.warning(body.error ?? `Invoice ${body.invoice_number} was issued but not delivered.`);
			}
			await invalidate('data:invoices');
		} catch {
			toast.error('Could not reach the server.');
		} finally {
			sending = false;
		}
	}

	const billToLines = $derived(
		[
			invoice.bill_to_line1,
			invoice.bill_to_line2,
			[
				[invoice.bill_to_city, invoice.bill_to_state].filter(Boolean).join(', '),
				invoice.bill_to_zip
			]
				.filter(Boolean)
				.join(' ')
				.trim()
		].filter((line): line is string => Boolean(line && line.trim()))
	);
</script>

<div class="space-y-6">
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div>
			<a
				href={resolve('/invoices')}
				class="text-sm text-muted-foreground decoration-transparent transition-[text-decoration-color] hover:decoration-current"
				>Invoices</a
			>
			<div class="mt-1 flex items-center gap-3">
				<h1 class="font-mono text-2xl font-semibold">
					<!-- A draft has no number until it is sent. -->
					{invoice.invoice_number ?? 'Draft invoice'}
				</h1>
				<span
					class="inline-flex items-center rounded-full px-2.5 py-0.5 text-sm font-medium {statusBadgeColors[
						display
					] ?? 'bg-zinc-100 text-zinc-500'}"
				>
					{statusLabels[display] ?? display}
				</span>
			</div>
			<p class="mt-1 text-sm text-muted-foreground">
				{invoice.accounts?.business_name ?? '—'}
				{#if invoice.orders?.order_number}
					· Order {invoice.orders.order_number}
				{/if}
			</p>
		</div>

		<!--
			One primary action, and which one depends on where the invoice is:
			an unsent draft is waiting to be sent, an issued one is waiting to be
			paid. Download is always secondary.
		-->
		<div class="flex items-center gap-2">
			<!--
				Void sits apart from the rest: it is the one irreversible action
				here, and giving it the same weight as Download would invite the
				accident. It is absent entirely on a draft, which is deleted rather
				than voided, and on an already-void invoice.
			-->
			{#if isIssued && canRecordMoney}
				<Button
					variant="ghost"
					class="text-destructive hover:bg-destructive/10 hover:text-destructive"
					onclick={() => (voidOpen = true)}>Void</Button
				>
			{/if}
			<Button variant="outline" href="/api/invoices/{invoice.id}/pdf">Download PDF</Button>
			{#if isDraft && canSend}
				<Button onclick={send} disabled={sending}>
					{sending ? 'Sending…' : 'Send invoice'}
				</Button>
			{:else if isIssued && canRecordMoney && balance > 0}
				<Button onclick={openPaymentDialog}>Record payment</Button>
			{/if}
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
						{#each invoice.invoice_lines as line (line.id)}
							<tr>
								<td class="px-4 py-3">
									<span class="font-mono text-sm">{line.style_number ?? '—'}</span>
									<p class="text-sm text-muted-foreground">
										{[line.color, line.size].filter(Boolean).join(' · ') || ''}
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
									This invoice has no lines.
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>

			{#if invoice.invoice_payments.length > 0}
				<div>
					<h2 class="text-sm font-semibold">Payments</h2>
					<div class="mt-2 rounded-lg border p-2">
						{#each invoice.invoice_payments as payment (payment.id)}
							<div class="flex items-center justify-between rounded-lg px-3 py-2">
								<div>
									<p class="text-sm font-medium">{fmt.format(Number(payment.amount))}</p>
									<p class="text-sm text-muted-foreground">
										{formatDate(payment.paid_on)}
										{#if payment.method}
											· {payment.method}
										{/if}
										{#if payment.reference}
											· {payment.reference}
										{/if}
									</p>
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/if}
		</div>

		<div class="space-y-4">
			<Card>
				<CardContent class="space-y-2 pt-4 pb-4">
					<div class="flex justify-between text-sm">
						<span class="text-muted-foreground">Subtotal</span>
						<span class="font-mono">{fmt.format(Number(invoice.subtotal))}</span>
					</div>
					{#if invoice.shipping_amount !== null}
						<div class="flex justify-between text-sm">
							<span class="text-muted-foreground">Shipping</span>
							<span class="font-mono">{fmt.format(Number(invoice.shipping_amount))}</span>
						</div>
					{/if}
					<!--
						Tax gets its own row rather than being folded into the total,
						so the figure can be reconciled against the lines above it.
						Null means not calculated yet, which is not the same as zero.
					-->
					<div class="flex justify-between text-sm">
						<span class="text-muted-foreground">Tax</span>
						<span class="font-mono">
							{invoice.tax_amount === null
								? 'Calculated at invoicing'
								: fmt.format(Number(invoice.tax_amount))}
						</span>
					</div>
					<div class="flex justify-between border-t pt-2 text-base font-semibold">
						<span>Total</span>
						<span class="font-mono">{fmt.format(Number(invoice.total))}</span>
					</div>
					{#if Number(invoice.amount_paid) > 0}
						<div class="flex justify-between text-sm">
							<span class="text-muted-foreground">Paid</span>
							<span class="font-mono">{fmt.format(Number(invoice.amount_paid))}</span>
						</div>
						<div class="flex justify-between text-base font-semibold">
							<span>Balance due</span>
							<span class="font-mono {display === 'overdue' ? 'text-red-600' : ''}"
								>{fmt.format(balance)}</span
							>
						</div>
					{/if}
				</CardContent>
			</Card>

			<Card>
				<CardContent class="space-y-3 pt-4 pb-4">
					<div>
						<p class="text-sm text-muted-foreground">Issued</p>
						<p class="text-sm">{formatDate(invoice.issue_date)}</p>
					</div>
					<div>
						<p class="text-sm text-muted-foreground">Due</p>
						<p class="text-sm {display === 'overdue' ? 'text-red-600' : ''}">
							<!--
								`other` terms carry no schedule, so there is genuinely no due
								date. Saying so beats printing a dash the reader has to guess at.
							-->
							{invoice.due_date ? formatDate(invoice.due_date) : 'No due date on these terms'}
						</p>
					</div>
					{#if invoice.payment_terms}
						<div>
							<p class="text-sm text-muted-foreground">Terms</p>
							<p class="text-sm">{paymentTermLabel(invoice.payment_terms)}</p>
						</div>
					{/if}
					{#if invoice.po_number}
						<div>
							<p class="text-sm text-muted-foreground">PO number</p>
							<p class="font-mono text-sm">{invoice.po_number}</p>
						</div>
					{/if}
				</CardContent>
			</Card>

			{#if invoice.bill_to_name || billToLines.length > 0}
				<Card>
					<CardContent class="pt-4 pb-4">
						<p class="text-sm text-muted-foreground">Bill to</p>
						{#if invoice.bill_to_name}
							<p class="mt-1 text-sm font-medium">{invoice.bill_to_name}</p>
						{/if}
						{#each billToLines as line (line)}
							<p class="text-sm text-muted-foreground">{line}</p>
						{/each}
					</CardContent>
				</Card>
			{/if}
		</div>
	</div>
</div>

<!--
	Record payment. A dialog rather than a page: it is three fields against a
	document the person is already looking at, and sending them somewhere else
	to fill it in would lose the context that tells them what to type.
-->
<Dialog bind:open={paymentOpen}>
	<DialogPortal>
		<DialogOverlay />
		<DialogContent class="max-w-md">
			<DialogTitle>Record payment</DialogTitle>
			<DialogDescription>
				{invoice.invoice_number ?? 'This invoice'} · {fmt.format(balance)} outstanding
			</DialogDescription>

			<form method="POST" action="?/recordPayment" use:paymentEnhance class="mt-5 space-y-4">
				<div class="space-y-2">
					<Label for="payment-amount">Amount</Label>
					<Input
						id="payment-amount"
						type="number"
						step="0.01"
						min="0"
						class="text-right font-mono"
						bind:value={$paymentData.amount}
					/>
					{#if $paymentErrors.amount}
						<p class="text-sm text-destructive">{$paymentErrors.amount[0]}</p>
					{/if}
				</div>

				<div class="space-y-2">
					<Label for="payment-date">Date received</Label>
					<DateSelect
						id="payment-date"
						value={$paymentData.paidOn}
						onchange={(v) => ($paymentData.paidOn = v)}
					/>
					{#if $paymentErrors.paidOn}
						<p class="text-sm text-destructive">{$paymentErrors.paidOn[0]}</p>
					{/if}
				</div>

				<div class="space-y-2">
					<Label for="payment-method">Method</Label>
					<SelectField
						value={$paymentData.method ?? ''}
						items={[
							{ value: '', label: 'Not specified' },
							...paymentMethods.map((m) => ({ value: m.code, label: m.label }))
						]}
						placeholder="Method"
						onValueChange={(v) => ($paymentData.method = v || undefined)}
					/>
				</div>

				<div class="space-y-2">
					<Label for="payment-reference">Reference</Label>
					<Input
						id="payment-reference"
						placeholder="Check number, transfer id"
						bind:value={$paymentData.reference}
					/>
					{#if $paymentErrors.reference}
						<p class="text-sm text-destructive">{$paymentErrors.reference[0]}</p>
					{/if}
				</div>

				<div class="flex justify-end gap-2 pt-2">
					<Button type="button" variant="outline" onclick={() => (paymentOpen = false)}>
						Cancel
					</Button>
					<Button type="submit" disabled={$paymentSubmitting}>
						{$paymentSubmitting ? 'Recording…' : 'Record payment'}
					</Button>
				</div>
			</form>
		</DialogContent>
	</DialogPortal>
</Dialog>

<!--
	Void. Irreversible, so it gets real friction rather than a reflexive "Are
	you sure?": the dialog states what survives (the number, so the sequence
	stays gapless) and asks for a reason, which is the thing the next person
	reading the ledger will actually want.
-->
<Dialog bind:open={voidOpen}>
	<DialogPortal>
		<DialogOverlay />
		<DialogContent class="max-w-md">
			<DialogTitle>Void {invoice.invoice_number ?? 'this invoice'}?</DialogTitle>
			<DialogDescription>
				This cannot be undone. The invoice keeps its number and stays in your records, marked void,
				so the numbering stays unbroken.
			</DialogDescription>

			<form method="POST" action="?/voidInvoice" use:voidEnhance class="mt-5 space-y-4">
				<div class="space-y-2">
					<Label for="void-reason">Reason</Label>
					<Input
						id="void-reason"
						placeholder="Order cancelled, billed in error"
						bind:value={$voidData.reason}
					/>
					<p class="text-sm text-muted-foreground">
						Optional, but it is what explains the gap to whoever reads this later.
					</p>
				</div>

				<div class="flex justify-end gap-2 pt-2">
					<Button type="button" variant="outline" onclick={() => (voidOpen = false)}>
						Keep invoice
					</Button>
					<Button type="submit" variant="destructive" disabled={$voidSubmitting}>
						{$voidSubmitting ? 'Voiding…' : 'Void invoice'}
					</Button>
				</div>
			</form>
		</DialogContent>
	</DialogPortal>
</Dialog>
