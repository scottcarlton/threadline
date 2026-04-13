<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { supabase } from '$lib/supabase.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import {
		Card,
		CardHeader,
		CardTitle,
		CardContent,
		CardFooter
	} from '$lib/components/ui/card/index.js';
	import type { BrandExpense, ExpenseReceipt, ExpenseCategory } from '$lib/types/database.js';
	import ReceiptDropZone from '$lib/components/shared/ReceiptDropZone.svelte';
	import QRCode from 'qrcode';

	let { data } = $props();
	const expense = $derived(data.expense as BrandExpense);
	const receipts = $derived(data.receipts as ExpenseReceipt[]);
	const reviewerName = $derived(data.reviewerName as string | null);

	const isAdmin = $derived(data.membership?.role === 'admin' || data.membership?.role === 'owner');
	const isSubmitter = $derived(expense.submitted_by === data.user?.id);
	const isBrandReviewer = $derived(data.isBrandReviewer as boolean);
	const isDraft = $derived(expense.status === 'draft');
	const canEdit = $derived(isDraft && isSubmitter);
	const canApprove = $derived(expense.status === 'submitted' && isBrandReviewer);
	const canDelete = $derived((isDraft && isSubmitter) || isAdmin);

	const categoryLabels: Record<string, string> = {
		trade_show: 'Trade Show',
		samples: 'Samples',
		marketing: 'Marketing',
		travel: 'Travel',
		meals: 'Meals',
		shipping: 'Shipping',
		photography: 'Photography',
		office: 'Office',
		other: 'Other'
	};

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

	const statusColors: Record<string, 'secondary' | 'warning' | 'success' | 'destructive'> = {
		draft: 'secondary',
		submitted: 'warning',
		approved: 'success',
		rejected: 'destructive'
	};

	const fmt = new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD',
		minimumFractionDigits: 2
	});

	// Edit state
	let editing = $state(false);
	let editCategory = $state<ExpenseCategory>('other');
	let editDescription = $state('');
	let editAmount = $state('');
	let editDate = $state('');
	let editNotes = $state('');
	let error = $state('');
	let loading = $state(false);

	// Review state
	let showRejectForm = $state(false);
	let reviewNotes = $state('');

	// Receipt upload state
	let uploading = $state(false);
	let uploadError = $state('');

	// QR code state
	let qrDataUrl = $state('');
	let qrUploadUrl = $state('');
	let qrExpiresAt = $state('');
	let generatingQr = $state(false);

	// Auto-generate QR code on load
	$effect(() => {
		if (expense?.id && !qrDataUrl && !generatingQr) {
			generateQrCode();
		}
	});

	function startEdit() {
		editCategory = expense.category;
		editDescription = expense.description;
		editAmount = String(expense.amount);
		editDate = expense.expense_date;
		editNotes = expense.notes ?? '';
		editing = true;
	}

	async function handleSave() {
		error = '';
		loading = true;

		const { error: err } = await supabase
			.from('brand_expenses')
			.update({
				category: editCategory,
				description: editDescription,
				amount: parseFloat(editAmount),
				expense_date: editDate,
				notes: editNotes || null,
				updated_at: new Date().toISOString()
			})
			.eq('id', expense.id);

		loading = false;
		if (err) {
			error = err.message;
		} else {
			editing = false;
			invalidateAll();
		}
	}

	async function handleSubmit() {
		loading = true;
		await supabase
			.from('brand_expenses')
			.update({
				status: 'submitted',
				submitted_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			})
			.eq('id', expense.id);
		loading = false;
		invalidateAll();
	}

	async function handleApprove() {
		loading = true;
		await supabase
			.from('brand_expenses')
			.update({
				status: 'approved',
				reviewed_by: data.user?.id,
				approved_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			})
			.eq('id', expense.id);
		loading = false;
		invalidateAll();
	}

	async function handleReject() {
		loading = true;
		await supabase
			.from('brand_expenses')
			.update({
				status: 'rejected',
				reviewed_by: data.user?.id,
				review_notes: reviewNotes || null,
				rejected_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			})
			.eq('id', expense.id);
		loading = false;
		showRejectForm = false;
		invalidateAll();
	}

	async function handleDelete() {
		// Clean up receipts from storage first
		for (const receipt of receipts) {
			await fetch(`/api/expenses/${expense.id}/receipts`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ receiptId: receipt.id })
			});
		}

		await supabase.from('brand_expenses').delete().eq('id', expense.id);
		goto('/expenses');
	}

	async function handleFiles(files: File[]) {
		uploading = true;
		uploadError = '';

		for (const file of files) {
			const formData = new FormData();
			formData.append('file', file);

			try {
				const res = await fetch(`/api/expenses/${expense.id}/receipts`, {
					method: 'POST',
					body: formData
				});

				if (!res.ok) {
					const json = await res.json().catch(() => ({}));
					uploadError = json.error ?? 'Upload failed';
				}
			} catch {
				uploadError = 'Upload failed';
			}
		}

		uploading = false;
		invalidateAll();
	}

	async function generateQrCode() {
		generatingQr = true;
		try {
			const res = await fetch(`/api/expenses/${expense.id}/upload-token`, { method: 'POST' });
			const json = await res.json();
			if (!res.ok) {
				uploadError = json.error || 'Failed to generate upload link';
				return;
			}
			qrUploadUrl = json.url;
			qrExpiresAt = json.expiresAt;
			qrDataUrl = await QRCode.toDataURL(json.url, { width: 200, margin: 2 });
		} catch {
			uploadError = 'Failed to generate QR code';
		} finally {
			generatingQr = false;
		}
	}

	async function handleDeleteReceipt(receiptId: string) {
		try {
			const res = await fetch(`/api/expenses/${expense.id}/receipts`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ receiptId })
			});
			if (res.ok) invalidateAll();
		} catch {
			// silent
		}
	}

	async function handleDownloadReceipt(receipt: ExpenseReceipt) {
		try {
			const { data: signedData } = await supabase.storage
				.from('expense-receipts')
				.createSignedUrl(receipt.file_path, 60);

			if (signedData?.signedUrl) {
				const a = document.createElement('a');
				a.href = signedData.signedUrl;
				a.download = receipt.name;
				a.click();
			}
		} catch {
			// silent
		}
	}

	function formatFileSize(bytes: number | null): string {
		if (!bytes) return '—';
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}
</script>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-3">
			<Button variant="ghost" size="sm" href="/expenses">⟵ Back</Button>
			<h1 class="font-mono text-3xl">{expense.expense_number}</h1>
			<Badge variant={statusColors[expense.status] ?? 'secondary'}>
				{expense.status.charAt(0).toUpperCase() + expense.status.slice(1)}
			</Badge>
		</div>
		{#if canEdit && !editing}
			<div class="flex gap-2">
				{#if canDelete}
					<Button variant="outline" size="sm" onclick={handleDelete}>Delete</Button>
				{/if}
				<Button size="sm" onclick={startEdit}>Edit</Button>
			</div>
		{/if}
	</div>

	<div class="grid gap-6 lg:grid-cols-[1fr_400px]">
		<!-- Left column: Details -->
		<div class="space-y-6">
			<Card>
				<CardContent class="pt-6">
					{#if error}
						<div class="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
							{error}
						</div>
					{/if}

					{#if editing}
						<form
							id="edit-form"
							onsubmit={(e) => {
								e.preventDefault();
								handleSave();
							}}
							class="space-y-4"
						>
							<div class="grid gap-4 sm:grid-cols-2">
								<div class="space-y-2">
									<Label for="category">Category</Label>
									<select
										id="category"
										bind:value={editCategory}
										class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
									>
										{#each categoryOptions as opt}
											<option value={opt.value}>{opt.label}</option>
										{/each}
									</select>
								</div>
								<div class="space-y-2">
									<Label for="amount">Amount</Label>
									<Input id="amount" type="number" step="0.01" min="0" bind:value={editAmount} />
								</div>
							</div>
							<div class="space-y-2">
								<Label for="description">Description</Label>
								<Input id="description" bind:value={editDescription} />
							</div>
							<div class="space-y-2">
								<Label for="expense-date">Expense Date</Label>
								<Input id="expense-date" type="date" bind:value={editDate} />
							</div>
							<div class="space-y-2">
								<Label for="notes">Notes</Label>
								<textarea
									id="notes"
									bind:value={editNotes}
									rows="3"
									class="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
								></textarea>
							</div>
						</form>
					{:else}
						<dl class="space-y-4">
							<div class="grid gap-4 sm:grid-cols-2">
								<div>
									<dt class="text-sm font-medium text-muted-foreground">Brand</dt>
									<dd class="mt-1">{expense.brands?.name ?? '—'}</dd>
								</div>
								<div>
									<dt class="text-sm font-medium text-muted-foreground">Category</dt>
									<dd class="mt-1">{categoryLabels[expense.category] ?? expense.category}</dd>
								</div>
							</div>
							<div class="grid gap-4 sm:grid-cols-2">
								<div>
									<dt class="text-sm font-medium text-muted-foreground">Amount</dt>
									<dd class="mt-1 text-lg font-semibold">{fmt.format(Number(expense.amount))}</dd>
								</div>
								<div>
									<dt class="text-sm font-medium text-muted-foreground">Expense Date</dt>
									<dd class="mt-1">
										{new Date(expense.expense_date + 'T00:00:00').toLocaleDateString('en-US', {
											month: 'long',
											day: 'numeric',
											year: 'numeric'
										})}
									</dd>
								</div>
							</div>
							<div>
								<dt class="text-sm font-medium text-muted-foreground">Description</dt>
								<dd class="mt-1">{expense.description}</dd>
							</div>
							{#if expense.notes}
								<div>
									<dt class="text-sm font-medium text-muted-foreground">Notes</dt>
									<dd class="mt-1 whitespace-pre-wrap">{expense.notes}</dd>
								</div>
							{/if}
							<div class="grid gap-4 sm:grid-cols-2">
								<div>
									<dt class="text-sm font-medium text-muted-foreground">Submitted By</dt>
									<dd class="mt-1">{expense.profiles?.display_name ?? '—'}</dd>
								</div>
								<div>
									<dt class="text-sm font-medium text-muted-foreground">Created</dt>
									<dd class="mt-1">
										{new Date(expense.created_at).toLocaleDateString('en-US', {
											month: 'short',
											day: 'numeric',
											year: 'numeric'
										})}
									</dd>
								</div>
							</div>
						</dl>
					{/if}
				</CardContent>
				{#if editing}
					<CardFooter class="justify-between">
						<Button variant="outline" onclick={() => (editing = false)}>Cancel</Button>
						<Button type="submit" form="edit-form" disabled={loading}>
							{loading ? 'Saving...' : 'Save Changes'}
						</Button>
					</CardFooter>
				{/if}
			</Card>

			<!-- Actions -->
			{#if isDraft && isSubmitter && !editing}
				<Card>
					<CardContent class="pt-5 pb-5">
						<div class="flex items-center justify-between">
							<div>
								<p class="text-sm font-medium">Ready to submit?</p>
								<p class="text-sm text-muted-foreground">
									Submit this expense for review and approval.
								</p>
							</div>
							<Button onclick={handleSubmit} disabled={loading}>Submit for Review</Button>
						</div>
					</CardContent>
				</Card>
			{/if}

			{#if expense.status === 'submitted' && !isBrandReviewer}
				<Card>
					<CardContent class="pt-5 pb-5">
						<div class="flex items-center gap-3">
							<div class="h-2 w-2 rounded-full bg-amber-500"></div>
							<p class="text-sm font-medium">This expense is under review</p>
						</div>
					</CardContent>
				</Card>
			{/if}

			{#if expense.status === 'approved' && !isBrandReviewer}
				<Card>
					<CardContent class="pt-5 pb-5">
						<div class="flex items-center gap-3">
							<div class="h-2 w-2 rounded-full bg-green-500"></div>
							<p class="text-sm font-medium">This expense has been approved</p>
						</div>
					</CardContent>
				</Card>
			{/if}

			{#if expense.status === 'rejected' && !isBrandReviewer}
				<Card>
					<CardContent class="pt-5 pb-5">
						<div class="space-y-1">
							<div class="flex items-center gap-3">
								<div class="h-2 w-2 rounded-full bg-red-500"></div>
								<p class="text-sm font-medium">This expense was rejected</p>
							</div>
							{#if expense.review_notes}
								<p class="ml-5 text-sm text-muted-foreground">{expense.review_notes}</p>
							{/if}
						</div>
					</CardContent>
				</Card>
			{/if}

			{#if canApprove}
				<Card>
					<CardContent class="space-y-4 pt-5 pb-5">
						<div class="flex items-center justify-between">
							<div>
								<p class="text-sm font-medium">Review this expense</p>
								<p class="text-sm text-muted-foreground">
									Approve or reject this submitted expense.
								</p>
							</div>
							<div class="flex gap-2">
								<Button
									variant="outline"
									onclick={() => (showRejectForm = !showRejectForm)}
									disabled={loading}>Reject</Button
								>
								<Button onclick={handleApprove} disabled={loading}>Approve</Button>
							</div>
						</div>
						{#if showRejectForm}
							<div class="space-y-3 border-t pt-4">
								<Label for="review-notes">Rejection reason (optional)</Label>
								<textarea
									id="review-notes"
									bind:value={reviewNotes}
									rows="2"
									placeholder="Reason for rejection..."
									class="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
								></textarea>
								<div class="flex justify-end">
									<Button variant="destructive" onclick={handleReject} disabled={loading}
										>Confirm Rejection</Button
									>
								</div>
							</div>
						{/if}
					</CardContent>
				</Card>
			{/if}

			<!-- Review result -->
			{#if (expense.status === 'approved' || expense.status === 'rejected') && (reviewerName || expense.review_notes)}
				<Card>
					<CardContent class="pt-5 pb-5">
						<p class="text-sm font-medium">
							{expense.status === 'approved' ? 'Approved' : 'Rejected'} by {reviewerName ??
								'Unknown'}
						</p>
						<p class="mt-1 text-sm text-muted-foreground">
							{new Date(
								expense.status === 'approved' ? expense.approved_at! : expense.rejected_at!
							).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
						</p>
						{#if expense.review_notes}
							<p class="mt-2 text-sm text-muted-foreground">{expense.review_notes}</p>
						{/if}
					</CardContent>
				</Card>
			{/if}
		</div>

		<!-- Right column: Receipts -->
		<div>
			<Card>
				<CardHeader>
					<CardTitle class="text-base">Receipts</CardTitle>
				</CardHeader>
				<CardContent class="space-y-4">
					<!-- Upload area -->
					{#if canEdit || (isDraft && isSubmitter) || isAdmin}
						<div class="space-y-3">
							{#if uploading}
								<div
									class="flex items-center justify-center gap-2 border-2 border-dashed p-6 text-sm text-muted-foreground"
								>
									<div
										class="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground"
									></div>
									Uploading...
								</div>
							{:else}
								<ReceiptDropZone onfiles={handleFiles} compact />
							{/if}

							<div class="flex flex-col items-center gap-3 border p-4">
								{#if qrDataUrl}
									<img src={qrDataUrl} alt="QR Code" class="h-40 w-40" />
								{:else}
									<div class="flex h-40 w-40 items-center justify-center">
										<div
											class="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground"
										></div>
									</div>
								{/if}
								<p class="text-sm text-muted-foreground">Scan to upload from phone</p>
							</div>

							{#if uploadError}
								<p class="text-sm text-destructive">{uploadError}</p>
							{/if}
						</div>
					{/if}

					<!-- Receipt list -->
					{#if receipts.length === 0}
						<p class="text-sm text-muted-foreground">No receipts attached yet.</p>
					{:else}
						<div class="divide-y rounded-none border">
							{#each receipts as receipt}
								<div class="flex items-center gap-3 px-4 py-3">
									<div
										class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted"
									>
										{#if receipt.mime_type === 'application/pdf'}
											<svg
												xmlns="http://www.w3.org/2000/svg"
												class="h-4 w-4 text-red-600"
												fill="none"
												viewBox="0 0 24 24"
												stroke="currentColor"
												stroke-width="1.5"
											>
												<path
													stroke-linecap="round"
													stroke-linejoin="round"
													d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
												/>
											</svg>
										{:else}
											<svg
												xmlns="http://www.w3.org/2000/svg"
												class="h-4 w-4 text-blue-600"
												fill="none"
												viewBox="0 0 24 24"
												stroke="currentColor"
												stroke-width="1.5"
											>
												<path
													stroke-linecap="round"
													stroke-linejoin="round"
													d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z"
												/>
											</svg>
										{/if}
									</div>

									<div class="min-w-0 flex-1">
										<p class="truncate text-sm font-medium">{receipt.name}</p>
										<p class="text-sm text-muted-foreground">{formatFileSize(receipt.file_size)}</p>
									</div>

									<div class="flex shrink-0 gap-1">
										<button
											type="button"
											class="cursor-pointer rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
											onclick={() => handleDownloadReceipt(receipt)}
											aria-label="Download {receipt.name}"
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
													d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
												/>
											</svg>
										</button>
										{#if canEdit || isAdmin}
											<button
												type="button"
												class="cursor-pointer rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
												onclick={() => handleDeleteReceipt(receipt.id)}
												aria-label="Delete {receipt.name}"
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
														d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
													/>
												</svg>
											</button>
										{/if}
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</CardContent>
			</Card>
		</div>
	</div>
</div>
