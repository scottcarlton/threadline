<script lang="ts">
	import { Dialog } from 'bits-ui';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { SelectField } from '$lib/components/ui/select/index.js';
	import Switch from '$lib/components/ui/switch.svelte';
	import { toast } from 'svelte-sonner';
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { organizationTaxesSchema, salesTaxRateSchema } from '$lib/schemas/organization-taxes.js';
	import type { OrganizationSalesTaxRate } from '$lib/types/database.js';

	let { data } = $props();

	const rates = $derived(data.rates as OrganizationSalesTaxRate[]);

	// svelte-ignore state_referenced_locally
	const formInitial = data.form;

	const { form, errors, enhance, submitting } = superForm(formInitial, {
		validators: zod4Client(organizationTaxesSchema),
		validationMethod: 'onblur',
		dataType: 'json',
		resetForm: false,
		onResult: ({ result }) => {
			if (result.type === 'success') {
				toast.success('Tax settings updated.');
			} else if (result.type === 'failure') {
				const msg = (result.data as { message?: string } | undefined)?.message;
				if (msg) toast.error(msg);
			} else if (result.type === 'error') {
				toast.error(result.error?.message ?? 'Failed to save changes.');
			}
		}
	});

	const TAX_TYPE_OPTIONS = [
		{ value: 'destination', label: 'Destination' },
		{ value: 'origin', label: 'Origin' }
	];

	let rateModalOpen = $state(false);
	let editingRate = $state<OrganizationSalesTaxRate | null>(null);
	let rateForm = $state<{ stateCode: string; rate: string; taxType: 'origin' | 'destination' }>({
		stateCode: '',
		rate: '',
		taxType: 'destination'
	});
	let rateError = $state('');
	let rateSubmitting = $state(false);

	function openAddRate() {
		editingRate = null;
		rateForm = { stateCode: '', rate: '', taxType: 'destination' };
		rateError = '';
		rateModalOpen = true;
	}

	function openEditRate(row: OrganizationSalesTaxRate) {
		editingRate = row;
		rateForm = {
			stateCode: row.state_code,
			rate: String(row.rate),
			taxType: row.tax_type
		};
		rateError = '';
		rateModalOpen = true;
	}

	async function submitRate(e: Event) {
		e.preventDefault();
		rateError = '';

		const parsed = salesTaxRateSchema.safeParse({
			id: editingRate?.id,
			stateCode: rateForm.stateCode,
			rate: rateForm.rate,
			taxType: rateForm.taxType
		});
		if (!parsed.success) {
			rateError = parsed.error.issues[0]?.message ?? 'Invalid input';
			return;
		}

		rateSubmitting = true;
		try {
			const fd = new FormData();
			if (editingRate?.id) fd.append('id', editingRate.id);
			fd.append('stateCode', parsed.data.stateCode);
			fd.append('rate', String(parsed.data.rate));
			fd.append('taxType', parsed.data.taxType);

			const res = await fetch('?/upsertRate', { method: 'POST', body: fd });
			if (!res.ok) {
				const body = (await res.json().catch(() => ({}))) as { message?: string };
				rateError = body.message ?? 'Save failed';
				return;
			}
			toast.success(editingRate ? 'Rate updated.' : 'Rate added.');
			rateModalOpen = false;
			location.reload();
		} catch {
			rateError = 'Save failed';
		} finally {
			rateSubmitting = false;
		}
	}

	async function deleteRate(row: OrganizationSalesTaxRate) {
		if (!confirm(`Remove the ${row.state_code} sales tax rate?`)) return;
		const fd = new FormData();
		fd.append('id', row.id);
		const res = await fetch('?/deleteRate', { method: 'POST', body: fd });
		if (!res.ok) {
			const body = (await res.json().catch(() => ({}))) as { message?: string };
			toast.error(body.message ?? 'Delete failed');
			return;
		}
		toast.success(`${row.state_code} removed.`);
		location.reload();
	}
</script>

<div class="max-w-2xl space-y-6">
	<div>
		<h2 class="text-lg font-semibold">Taxes</h2>
		<p class="mt-0.5 text-sm text-muted-foreground">US sales tax, VAT, and GST configuration.</p>
	</div>

	<form method="POST" use:enhance class="space-y-8">
		<!-- Pricing display -->
		<section class="space-y-3">
			<h3 class="text-sm font-semibold">Pricing display</h3>
			<p class="text-sm text-muted-foreground">
				How list prices are presented to buyers. Switch later if your wholesale norm changes.
			</p>
			<div class="grid grid-cols-2 gap-2">
				{#each ['exclusive', 'inclusive'] as opt (opt)}
					<button
						type="button"
						class="rounded-md px-4 py-3 text-sm font-medium transition-colors {$form.pricingDisplay ===
						opt
							? 'bg-foreground text-background'
							: 'bg-muted text-muted-foreground hover:text-foreground'}"
						onclick={() => ($form.pricingDisplay = opt as 'exclusive' | 'inclusive')}
					>
						{opt === 'exclusive' ? 'Tax-exclusive' : 'Tax-inclusive'}
					</button>
				{/each}
			</div>
		</section>

		<!-- US sales tax -->
		<section class="space-y-4 rounded-md border p-4">
			<div class="flex items-center justify-between gap-3">
				<div>
					<h3 class="text-sm font-semibold">US sales tax</h3>
					<p class="mt-0.5 text-sm text-muted-foreground">
						Per-state rates with origin or destination sourcing.
					</p>
				</div>
				<Switch
					checked={$form.usSalesTaxEnabled}
					onCheckedChange={(v) => ($form.usSalesTaxEnabled = v)}
				/>
			</div>

			{#if $form.usSalesTaxEnabled}
				<div class="space-y-4 border-t pt-4">
					<div class="grid gap-4 sm:grid-cols-2">
						<div class="space-y-2">
							<Label for="us-ein">EIN</Label>
							<Input id="us-ein" bind:value={$form.usEin} placeholder="12-3456789" />
							{#if $errors.usEin}
								<p class="text-sm text-destructive">{$errors.usEin[0]}</p>
							{/if}
						</div>
						<div class="space-y-2">
							<Label for="us-general-rate">General rate</Label>
							<div class="flex items-center gap-2">
								<Input
									id="us-general-rate"
									type="number"
									min={0}
									max={100}
									step={0.001}
									bind:value={$form.usGeneralRate}
									class="w-32"
									placeholder="0.000"
								/>
								<span class="text-sm text-muted-foreground">%</span>
							</div>
							<p class="text-sm text-muted-foreground">
								Applies when the buyer's state isn't in the per-state rates below.
							</p>
							{#if $errors.usGeneralRate}
								<p class="text-sm text-destructive">{$errors.usGeneralRate[0]}</p>
							{/if}
						</div>
					</div>

					<div class="space-y-2">
						<div class="flex items-center justify-between">
							<Label>Per-state rates</Label>
							<Button type="button" variant="outline" size="sm" onclick={openAddRate}>
								Add rate
							</Button>
						</div>
						{#if rates.length === 0}
							<p class="text-sm text-muted-foreground">No rates yet.</p>
						{:else}
							<div class="overflow-hidden rounded-md border">
								<table class="w-full text-sm">
									<thead class="bg-muted/50">
										<tr>
											<th class="px-3 py-2 text-left font-medium">State</th>
											<th class="px-3 py-2 text-left font-medium">Rate</th>
											<th class="px-3 py-2 text-left font-medium">Sourcing</th>
											<th class="px-3 py-2"></th>
										</tr>
									</thead>
									<tbody class="divide-y">
										{#each rates as row (row.id)}
											<tr>
												<td class="px-3 py-2 font-mono">{row.state_code}</td>
												<td class="px-3 py-2">{row.rate}%</td>
												<td class="px-3 py-2 capitalize">{row.tax_type}</td>
												<td class="px-3 py-2 text-right">
													<button
														type="button"
														class="text-sm text-muted-foreground hover:text-foreground"
														onclick={() => openEditRate(row)}
													>
														Edit
													</button>
													<span class="mx-2 text-muted-foreground">·</span>
													<button
														type="button"
														class="text-sm text-muted-foreground hover:text-destructive"
														onclick={() => deleteRate(row)}
													>
														Remove
													</button>
												</td>
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
						{/if}
					</div>
				</div>
			{/if}
		</section>

		<!-- VAT -->
		<section class="space-y-4 rounded-md border p-4">
			<div class="flex items-center justify-between gap-3">
				<div>
					<h3 class="text-sm font-semibold">VAT</h3>
					<p class="mt-0.5 text-sm text-muted-foreground">European Union value-added tax.</p>
				</div>
				<Switch checked={$form.vatEnabled} onCheckedChange={(v) => ($form.vatEnabled = v)} />
			</div>

			{#if $form.vatEnabled}
				<div class="grid gap-4 border-t pt-4 sm:grid-cols-2">
					<div class="space-y-2">
						<Label for="vat-registration">VAT registration</Label>
						<Input
							id="vat-registration"
							bind:value={$form.vatRegistration}
							placeholder="GB123456789"
						/>
					</div>
					<div class="space-y-2">
						<Label for="vat-rate">Rate</Label>
						<div class="flex items-center gap-2">
							<Input
								id="vat-rate"
								type="number"
								min={0}
								max={100}
								step={0.01}
								bind:value={$form.vatRate}
								class="w-28"
							/>
							<span class="text-sm text-muted-foreground">%</span>
						</div>
						{#if $errors.vatRate}
							<p class="text-sm text-destructive">{$errors.vatRate[0]}</p>
						{/if}
					</div>
				</div>
			{/if}
		</section>

		<!-- GST -->
		<section class="space-y-4 rounded-md border p-4">
			<div class="flex items-center justify-between gap-3">
				<div>
					<h3 class="text-sm font-semibold">GST</h3>
					<p class="mt-0.5 text-sm text-muted-foreground">
						Goods and services tax (Canada, Australia, NZ, India, etc.).
					</p>
				</div>
				<Switch checked={$form.gstEnabled} onCheckedChange={(v) => ($form.gstEnabled = v)} />
			</div>

			{#if $form.gstEnabled}
				<div class="grid gap-4 border-t pt-4 sm:grid-cols-2">
					<div class="space-y-2">
						<Label for="gst-registration">GST registration</Label>
						<Input
							id="gst-registration"
							bind:value={$form.gstRegistration}
							placeholder="123456789RT0001"
						/>
					</div>
					<div class="space-y-2">
						<Label for="gst-rate">Rate</Label>
						<div class="flex items-center gap-2">
							<Input
								id="gst-rate"
								type="number"
								min={0}
								max={100}
								step={0.01}
								bind:value={$form.gstRate}
								class="w-28"
							/>
							<span class="text-sm text-muted-foreground">%</span>
						</div>
						{#if $errors.gstRate}
							<p class="text-sm text-destructive">{$errors.gstRate[0]}</p>
						{/if}
					</div>
				</div>
			{/if}
		</section>

		<div>
			<Button type="submit" disabled={$submitting}>
				{$submitting ? 'Saving…' : 'Save changes'}
			</Button>
		</div>
	</form>
</div>

<Dialog.Root bind:open={rateModalOpen}>
	<Dialog.Portal>
		<Dialog.Overlay
			class="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50"
		/>
		<Dialog.Content
			class="fixed top-[50%] left-[50%] z-50 w-full max-w-md translate-x-[-50%] translate-y-[-50%] rounded-lg border bg-background p-6 shadow-lg"
		>
			<Dialog.Title class="text-lg font-semibold">
				{editingRate ? 'Edit rate' : 'Add rate'}
			</Dialog.Title>
			<Dialog.Description class="mt-1 text-sm text-muted-foreground">
				One row per US state. Sourcing controls whether tax is calculated based on the seller's
				address (origin) or the buyer's (destination).
			</Dialog.Description>

			<form onsubmit={submitRate} class="mt-5 space-y-4">
				<div class="grid grid-cols-[120px_1fr] gap-3">
					<div class="space-y-2">
						<Label for="rate-state">State</Label>
						<Input
							id="rate-state"
							bind:value={rateForm.stateCode}
							maxlength={2}
							placeholder="CA"
							autocapitalize="characters"
							disabled={!!editingRate}
						/>
					</div>
					<div class="space-y-2">
						<Label for="rate-pct">Rate</Label>
						<div class="flex items-center gap-2">
							<Input
								id="rate-pct"
								type="number"
								min={0}
								max={100}
								step={0.001}
								bind:value={rateForm.rate}
							/>
							<span class="text-sm text-muted-foreground">%</span>
						</div>
					</div>
				</div>

				<div class="space-y-2">
					<Label for="rate-type">Sourcing</Label>
					<SelectField
						bind:value={rateForm.taxType}
						items={TAX_TYPE_OPTIONS}
						placeholder="Select sourcing"
						class="w-full"
					/>
				</div>

				{#if rateError}
					<p class="text-sm text-destructive">{rateError}</p>
				{/if}

				<div class="flex justify-end gap-2 pt-2">
					<Button type="button" variant="outline" onclick={() => (rateModalOpen = false)}>
						Cancel
					</Button>
					<Button type="submit" disabled={rateSubmitting}>
						{rateSubmitting ? 'Saving…' : editingRate ? 'Save' : 'Add rate'}
					</Button>
				</div>
			</form>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
