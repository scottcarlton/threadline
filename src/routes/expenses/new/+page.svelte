<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import LongArrow from '$lib/components/ui/long-arrow.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import {
		Card,
		CardHeader,
		CardTitle,
		CardContent,
		CardFooter
	} from '$lib/components/ui/card/index.js';
	import type { ExpenseCategory } from '$lib/types/database.js';
	import ReceiptDropZone from '$lib/components/shared/ReceiptDropZone.svelte';

	let { data } = $props();
	const brands = $derived(data.brands as { id: string; name: string }[]);
	const hasSingleBrand = $derived(brands.length === 1);

	const categoryOptions: { value: ExpenseCategory; label: string }[] = [
		{ value: 'trade_show', label: 'Trade Show' },
		{ value: 'samples', label: 'Samples' },
		{ value: 'marketing', label: 'Marketing' },
		{ value: 'travel', label: 'Travel' },
		{ value: 'meals', label: 'Meals' },
		{ value: 'shipping', label: 'Shipping' },
		{ value: 'photography', label: 'Photography' },
		{ value: 'office', label: 'Office' },
		{ value: 'other', label: 'Other' }
	];

	let brandId = $state('');
	$effect(() => {
		if (hasSingleBrand && !brandId) brandId = brands[0].id;
	});
	let category = $state<ExpenseCategory>('other');
	let description = $state('');
	let amount = $state('');
	let expenseDate = $state(new Date().toISOString().split('T')[0]);
	let notes = $state('');
	let loading = $state(false);
	let pendingReceipts = $state<File[]>([]);
	let asDraft = $state(false);

	function addReceipts(files: File[]) {
		pendingReceipts = [...pendingReceipts, ...files];
	}

	function removeReceipt(index: number) {
		pendingReceipts = pendingReceipts.filter((_, i) => i !== index);
	}
</script>

<div class="mx-auto max-w-2xl space-y-6">
	<div class="flex items-center gap-3">
		<Button variant="ghost" size="sm" href="/expenses"><LongArrow direction="left" /> Back</Button>
		<h1 class="text-3xl">New Expense</h1>
	</div>

	<Card>
		<CardHeader>
			<CardTitle>Expense Details</CardTitle>
		</CardHeader>
		<CardContent class="space-y-4">
			<form
				id="expense-form"
				method="POST"
				use:enhance={() => {
					loading = true;
					return async ({ result }) => {
						loading = false;
						if (result.type === 'success' && result.data) {
							const d = result.data as {
								success: boolean;
								expenseId: string;
								expenseNumber: string;
								asDraft: boolean;
							};
							// Upload pending receipts
							for (const file of pendingReceipts) {
								const formData = new FormData();
								formData.append('file', file);
								await fetch(`/api/expenses/${d.expenseId}/receipts`, {
									method: 'POST',
									body: formData
								});
							}
							if (!d.asDraft) {
								fetch('/api/notifications', {
									method: 'POST',
									headers: { 'Content-Type': 'application/json' },
									body: JSON.stringify({
										type: 'expense_submitted',
										title: 'Expense submitted for review',
										body: `${d.expenseNumber} — ${description}`,
										link: `/expenses/${d.expenseId}`
									})
								});
							}
							toast.success(d.asDraft ? 'Draft saved' : 'Expense submitted');
							goto(resolve(`/expenses/${d.expenseId}`));
						} else if (result.type === 'failure') {
							const msg =
								(result.data as { message?: string } | undefined)?.message ??
								'Failed to create expense';
							toast.error(msg);
						}
					};
				}}
			>
				<input type="hidden" name="as_draft" value={asDraft ? 'true' : 'false'} />

				{#if brands.length > 0}
					<div class="space-y-2">
						<Label for="brand">Brand</Label>
						<select
							id="brand"
							name="brand_id"
							bind:value={brandId}
							class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
						>
							<option value="">Select a brand</option>
							{#each brands as brand (brand.id)}
								<option value={brand.id}>{brand.name}</option>
							{/each}
						</select>
					</div>
				{/if}

				<div class="mt-4 grid gap-4 sm:grid-cols-2">
					<div class="space-y-2">
						<Label for="category">Category</Label>
						<select
							id="category"
							name="category"
							bind:value={category}
							class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
						>
							{#each categoryOptions as opt (opt.value)}
								<option value={opt.value}>{opt.label}</option>
							{/each}
						</select>
					</div>
					<div class="space-y-2">
						<Label for="amount">Amount</Label>
						<Input
							id="amount"
							name="amount"
							type="number"
							step="0.01"
							min="0"
							placeholder="0.00"
							bind:value={amount}
						/>
					</div>
				</div>

				<div class="mt-4 space-y-2">
					<Label for="description">Description</Label>
					<Input
						id="description"
						name="description"
						placeholder="What was this expense for?"
						bind:value={description}
					/>
				</div>

				<div class="mt-4 space-y-2">
					<Label for="expense-date">Expense Date</Label>
					<Input id="expense-date" name="expense_date" type="date" bind:value={expenseDate} />
				</div>

				<div class="mt-4 space-y-2">
					<Label for="notes">Notes (Optional)</Label>
					<textarea
						id="notes"
						name="notes"
						bind:value={notes}
						rows="3"
						placeholder="Additional details..."
						class="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
					></textarea>
				</div>
				<!-- Receipts -->
				<div class="mt-4 space-y-2">
					<Label>Receipts (Optional)</Label>
					<ReceiptDropZone onfiles={addReceipts} compact />
					{#if pendingReceipts.length > 0}
						<div class="space-y-1.5">
							{#each pendingReceipts as file, i (i)}
								<div class="flex items-center justify-between border px-3 py-2 text-sm">
									<span class="truncate">{file.name}</span>
									<button
										type="button"
										aria-label="Remove receipt"
										class="text-muted-foreground hover:text-destructive"
										onclick={() => removeReceipt(i)}
									>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											class="h-4 w-4"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
											stroke-width="2"
										>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												d="M6 18L18 6M6 6l12 12"
											/>
										</svg>
									</button>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			</form>
		</CardContent>
		<CardFooter class="justify-between">
			<Button
				variant="outline"
				type="submit"
				form="expense-form"
				disabled={loading}
				onclick={() => (asDraft = true)}
			>
				Save as Draft
			</Button>
			<Button
				type="submit"
				form="expense-form"
				disabled={loading}
				onclick={() => (asDraft = false)}
			>
				{loading ? 'Submitting...' : 'Submit Expense'}
			</Button>
		</CardFooter>
	</Card>
</div>
