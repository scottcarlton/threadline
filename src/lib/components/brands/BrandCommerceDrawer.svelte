<script lang="ts">
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { SelectField } from '$lib/components/ui/select/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import Switch from '$lib/components/ui/switch.svelte';
	import { cn } from '$lib/utils.js';
	import { brandOrdersSchema } from '$lib/schemas/brand-orders.js';
	import { brandTaxesSchema, brandSalesTaxRateSchema } from '$lib/schemas/brand-taxes.js';
	import { brandShippingSchema, brandShippingMethodSchema } from '$lib/schemas/brand-shipping.js';
	import { brandReturnsSchema } from '$lib/schemas/brand-returns.js';
	import { brandPaymentsSchema } from '$lib/schemas/brand-payments.js';
	import type { BrandSalesTaxRate, BrandShippingMethod } from '$lib/types/database.js';
	import type { SuperValidated, Infer } from 'sveltekit-superforms';

	type Props = {
		open: boolean;
		onOpenChange: (open: boolean) => void;
		brandName: string;
		ordersForm: SuperValidated<Infer<typeof brandOrdersSchema>>;
		taxesForm: SuperValidated<Infer<typeof brandTaxesSchema>>;
		shippingForm: SuperValidated<Infer<typeof brandShippingSchema>>;
		returnsForm: SuperValidated<Infer<typeof brandReturnsSchema>>;
		paymentsForm: SuperValidated<Infer<typeof brandPaymentsSchema>>;
		taxRateForm: SuperValidated<Infer<typeof brandSalesTaxRateSchema>>;
		shippingMethodForm: SuperValidated<Infer<typeof brandShippingMethodSchema>>;
		taxRates: BrandSalesTaxRate[];
		shippingMethods: BrandShippingMethod[];
		defaultShippingMethodId: string | null;
	};

	let {
		open,
		onOpenChange,
		brandName,
		ordersForm,
		taxesForm,
		shippingForm,
		returnsForm,
		paymentsForm,
		taxRateForm,
		shippingMethodForm,
		taxRates,
		shippingMethods,
		defaultShippingMethodId
	}: Props = $props();

	type Tab = 'orders' | 'taxes' | 'shipping' | 'returns' | 'payments';
	let activeTab = $state<Tab>('orders');

	const tabs: { id: Tab; label: string }[] = [
		{ id: 'orders', label: 'Orders' },
		{ id: 'taxes', label: 'Taxes' },
		{ id: 'shipping', label: 'Shipping' },
		{ id: 'returns', label: 'Returns' },
		{ id: 'payments', label: 'Payments' }
	];

	// ── Orders form ─────────────────────────────────────────────────────────
	// svelte-ignore state_referenced_locally
	const {
		form: oForm,
		errors: oErrors,
		enhance: oEnhance,
		submitting: oSubmitting
	} = superForm(ordersForm, {
		validators: zod4Client(brandOrdersSchema),
		validationMethod: 'onblur',
		dataType: 'json',
		resetForm: false,
		onResult: ({ result }) => {
			if (result.type === 'success') toast.success('Orders saved.');
			else if (result.type === 'failure') {
				const msg = (result.data as { message?: string } | undefined)?.message;
				if (msg) toast.error(msg);
			} else if (result.type === 'error') toast.error('Save failed.');
		}
	});

	const sampleOrderNumber = $derived.by(() => {
		const padded =
			$oForm.orderNumberPadWidth > 0
				? String($oForm.nextOrderNumber).padStart($oForm.orderNumberPadWidth, '0')
				: String($oForm.nextOrderNumber);
		return `${$oForm.orderNumberPrefix}${padded}`;
	});

	// ── Taxes form ──────────────────────────────────────────────────────────
	// svelte-ignore state_referenced_locally
	const {
		form: tForm,
		enhance: tEnhance,
		submitting: tSubmitting
	} = superForm(taxesForm, {
		validators: zod4Client(brandTaxesSchema),
		validationMethod: 'onblur',
		dataType: 'json',
		resetForm: false,
		onResult: ({ result }) => {
			if (result.type === 'success') toast.success('Taxes saved.');
			else if (result.type === 'failure') {
				const msg = (result.data as { message?: string } | undefined)?.message;
				if (msg) toast.error(msg);
			} else if (result.type === 'error') toast.error('Save failed.');
		}
	});

	// svelte-ignore state_referenced_locally
	const {
		form: trForm,
		errors: trErrors,
		enhance: trEnhance,
		submitting: trSubmitting
	} = superForm(taxRateForm, {
		validators: zod4Client(brandSalesTaxRateSchema),
		validationMethod: 'onblur',
		dataType: 'json',
		resetForm: true,
		onResult: ({ result }) => {
			if (result.type === 'success') {
				toast.success('Tax rate saved.');
				editingRateId = null;
			} else if (result.type === 'failure') {
				const msg = (result.data as { message?: string } | undefined)?.message;
				if (msg) toast.error(msg);
			}
		}
	});

	let editingRateId = $state<string | null>(null);

	function startEditRate(r: BrandSalesTaxRate) {
		editingRateId = r.id;
		$trForm.id = r.id;
		$trForm.stateCode = r.state_code;
		$trForm.rate = Number(r.rate);
		$trForm.taxType = r.tax_type;
	}
	function cancelEditRate() {
		editingRateId = null;
		$trForm.id = undefined;
		$trForm.stateCode = '';
		$trForm.rate = 0;
		$trForm.taxType = 'destination';
	}

	// ── Shipping form ───────────────────────────────────────────────────────
	// svelte-ignore state_referenced_locally
	const {
		form: sForm,
		errors: sErrors,
		enhance: sEnhance,
		submitting: sSubmitting
	} = superForm(shippingForm, {
		validators: zod4Client(brandShippingSchema),
		validationMethod: 'onblur',
		dataType: 'json',
		resetForm: false,
		onResult: ({ result }) => {
			if (result.type === 'success') toast.success('Shipping saved.');
			else if (result.type === 'failure') {
				const msg = (result.data as { message?: string } | undefined)?.message;
				if (msg) toast.error(msg);
			} else if (result.type === 'error') toast.error('Save failed.');
		}
	});

	// svelte-ignore state_referenced_locally
	const {
		form: smForm,
		errors: smErrors,
		enhance: smEnhance,
		submitting: smSubmitting
	} = superForm(shippingMethodForm, {
		validators: zod4Client(brandShippingMethodSchema),
		validationMethod: 'onblur',
		dataType: 'json',
		resetForm: true,
		onResult: ({ result }) => {
			if (result.type === 'success') {
				toast.success('Shipping method saved.');
				editingMethodId = null;
			} else if (result.type === 'failure') {
				const msg = (result.data as { message?: string } | undefined)?.message;
				if (msg) toast.error(msg);
			}
		}
	});

	let editingMethodId = $state<string | null>(null);

	function startEditMethod(m: BrandShippingMethod) {
		editingMethodId = m.id;
		$smForm.id = m.id;
		$smForm.name = m.name;
		$smForm.costType = m.cost_type;
		$smForm.costAmount = m.cost_amount === null ? '' : Number(m.cost_amount);
		$smForm.deliveryWindow = m.delivery_window ?? '';
	}
	function cancelEditMethod() {
		editingMethodId = null;
		$smForm.id = undefined;
		$smForm.name = '';
		$smForm.costType = 'flat';
		$smForm.costAmount = '';
		$smForm.deliveryWindow = '';
	}

	// ── Returns form ────────────────────────────────────────────────────────
	// svelte-ignore state_referenced_locally
	const {
		form: rForm,
		errors: rErrors,
		enhance: rEnhance,
		submitting: rSubmitting
	} = superForm(returnsForm, {
		validators: zod4Client(brandReturnsSchema),
		validationMethod: 'onblur',
		dataType: 'json',
		resetForm: false,
		onResult: ({ result }) => {
			if (result.type === 'success') toast.success('Returns saved.');
			else if (result.type === 'failure') {
				const msg = (result.data as { message?: string } | undefined)?.message;
				if (msg) toast.error(msg);
			} else if (result.type === 'error') toast.error('Save failed.');
		}
	});

	// ── Payments form ───────────────────────────────────────────────────────
	// svelte-ignore state_referenced_locally
	const {
		form: pForm,
		errors: pErrors,
		enhance: pEnhance,
		submitting: pSubmitting
	} = superForm(paymentsForm, {
		validators: zod4Client(brandPaymentsSchema),
		validationMethod: 'onblur',
		dataType: 'json',
		resetForm: false,
		onResult: ({ result }) => {
			if (result.type === 'success') toast.success('Payments saved.');
			else if (result.type === 'failure') {
				const msg = (result.data as { message?: string } | undefined)?.message;
				if (msg) toast.error(msg);
			} else if (result.type === 'error') toast.error('Save failed.');
		}
	});

	const PAYMENT_METHODS = [
		{ code: 'credit_card', label: 'Credit card' },
		{ code: 'ach', label: 'ACH' },
		{ code: 'wire', label: 'Wire' },
		{ code: 'check', label: 'Check' },
		{ code: 'cod', label: 'COD' },
		{ code: 'prepaid', label: 'Prepaid' },
		{ code: 'net_15', label: 'Net 15' },
		{ code: 'net_30', label: 'Net 30' },
		{ code: 'net_60', label: 'Net 60' },
		{ code: 'net_90', label: 'Net 90' },
		{ code: 'other', label: 'Other' }
	];

	function toggleMethod(code: string) {
		if ($pForm.acceptedMethods.includes(code)) {
			$pForm.acceptedMethods = $pForm.acceptedMethods.filter((m) => m !== code);
		} else {
			$pForm.acceptedMethods = [...$pForm.acceptedMethods, code];
		}
	}

	const defaultMethodItems = $derived([
		{ value: '', label: 'Not set' },
		...PAYMENT_METHODS.filter((m) => $pForm.acceptedMethods.includes(m.code)).map((m) => ({
			value: m.code,
			label: m.label
		}))
	]);

	$effect(() => {
		if (!open) return;
		function onKeydown(e: KeyboardEvent) {
			if (e.key === 'Escape') onOpenChange(false);
		}
		window.addEventListener('keydown', onKeydown);
		return () => window.removeEventListener('keydown', onKeydown);
	});
</script>

{#if open}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
		onclick={() => onOpenChange(false)}
	></div>
{/if}

<div
	role="dialog"
	aria-modal="true"
	aria-labelledby="commerce-drawer-title"
	class={cn(
		'fixed top-3 right-3 bottom-3 z-50 flex w-[calc(100vw-5rem)] flex-col overflow-hidden rounded-none border bg-background shadow-xl transition-transform duration-300 ease-in-out sm:w-[44rem]',
		open ? 'translate-x-0' : 'translate-x-[calc(100%+1rem)]'
	)}
>
	<div class="relative space-y-1 px-6 py-4">
		<h2 id="commerce-drawer-title" class="text-base font-semibold">Edit Commerce</h2>
		<p class="text-sm text-muted-foreground">
			{brandName} — taxes, shipping, returns, payments, orders.
		</p>
		<button
			type="button"
			onclick={() => onOpenChange(false)}
			aria-label="Close"
			class="absolute top-4 right-4 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="1.75"
				stroke-linecap="round"
				stroke-linejoin="round"
				class="h-5 w-5"
			>
				<path d="M18 6L6 18" />
				<path d="M6 6l12 12" />
			</svg>
		</button>
	</div>

	<!-- Tab nav -->
	<div class="border-b px-6">
		<nav class="-mb-px flex gap-4" aria-label="Commerce sections">
			{#each tabs as t (t.id)}
				<button
					type="button"
					onclick={() => (activeTab = t.id)}
					class="border-b-2 px-1 py-3 text-sm font-medium transition-colors {activeTab === t.id
						? 'border-foreground text-foreground'
						: 'border-transparent text-muted-foreground hover:text-foreground'}"
				>
					{t.label}
				</button>
			{/each}
		</nav>
	</div>

	<!-- Tab panels -->
	<div class="flex-1 overflow-y-auto">
		<div class="px-6 py-5">
			{#if activeTab === 'orders'}
				<form method="POST" action="?/saveCommerceOrders" use:oEnhance class="space-y-7">
					<section class="space-y-4">
						<h3 class="text-sm font-semibold">Order number format</h3>
						<div class="grid grid-cols-[120px_1fr_120px] gap-3">
							<div class="space-y-2">
								<Label for="b-prefix">Prefix</Label>
								<Input
									id="b-prefix"
									bind:value={$oForm.orderNumberPrefix}
									maxlength={10}
									placeholder="PO-"
								/>
								{#if $oErrors.orderNumberPrefix}<p class="text-sm text-destructive">
										{$oErrors.orderNumberPrefix[0]}
									</p>{/if}
							</div>
							<div class="space-y-2">
								<Label for="b-next">Next number</Label>
								<Input
									id="b-next"
									type="number"
									min={1}
									step={1}
									bind:value={$oForm.nextOrderNumber}
								/>
								{#if $oErrors.nextOrderNumber}<p class="text-sm text-destructive">
										{$oErrors.nextOrderNumber[0]}
									</p>{/if}
							</div>
							<div class="space-y-2">
								<Label for="b-pad">Pad to digits</Label>
								<Input
									id="b-pad"
									type="number"
									min={0}
									max={12}
									step={1}
									bind:value={$oForm.orderNumberPadWidth}
								/>
								{#if $oErrors.orderNumberPadWidth}<p class="text-sm text-destructive">
										{$oErrors.orderNumberPadWidth[0]}
									</p>{/if}
							</div>
						</div>
						<p class="text-sm text-muted-foreground">
							Sample: <span class="font-mono">{sampleOrderNumber}</span>
						</p>
					</section>

					<section class="space-y-4">
						<div class="flex items-center justify-between gap-3">
							<div>
								<h3 class="text-sm font-semibold">Order minimum</h3>
								<p class="mt-0.5 text-sm text-muted-foreground">Block orders under this amount.</p>
							</div>
							<Switch
								checked={$oForm.orderMinimumEnabled}
								onCheckedChange={(v) => ($oForm.orderMinimumEnabled = v)}
							/>
						</div>
						<div class="space-y-2">
							<Label for="b-min">Minimum amount</Label>
							<div class="flex items-center gap-2">
								<span class="text-sm text-muted-foreground">$</span>
								<Input
									id="b-min"
									type="number"
									min={0}
									step={0.01}
									bind:value={$oForm.orderMinimumAmount}
									disabled={!$oForm.orderMinimumEnabled}
									class="w-40"
								/>
							</div>
							{#if $oErrors.orderMinimumAmount}<p class="text-sm text-destructive">
									{$oErrors.orderMinimumAmount[0]}
								</p>{/if}
						</div>
					</section>

					<section class="space-y-4">
						<h3 class="text-sm font-semibold">Default commission rate</h3>
						<div class="space-y-2">
							<Label for="b-comm">Rate</Label>
							<div class="flex items-center gap-2">
								<Input
									id="b-comm"
									type="number"
									min={0}
									max={100}
									step={0.25}
									bind:value={$oForm.defaultCommissionRate}
									class="w-28"
								/>
								<span class="text-sm text-muted-foreground">%</span>
							</div>
							{#if $oErrors.defaultCommissionRate}<p class="text-sm text-destructive">
									{$oErrors.defaultCommissionRate[0]}
								</p>{/if}
						</div>
					</section>

					<section class="space-y-4">
						<h3 class="text-sm font-semibold">Handling fee</h3>
						<div class="space-y-2">
							<Label for="b-fee">Amount</Label>
							<div class="flex items-center gap-2">
								<span class="text-sm text-muted-foreground">$</span>
								<Input
									id="b-fee"
									type="number"
									min={0}
									step={0.01}
									bind:value={$oForm.handlingFeeAmount}
									class="w-40"
								/>
							</div>
							{#if $oErrors.handlingFeeAmount}<p class="text-sm text-destructive">
									{$oErrors.handlingFeeAmount[0]}
								</p>{/if}
						</div>
					</section>

					<div class="flex justify-end pt-2">
						<Button type="submit" disabled={$oSubmitting}>Save orders</Button>
					</div>
				</form>
			{:else if activeTab === 'taxes'}
				<form method="POST" action="?/saveCommerceTaxes" use:tEnhance class="space-y-7">
					<section class="space-y-4">
						<h3 class="text-sm font-semibold">Pricing display</h3>
						<div class="flex gap-4">
							<label class="flex items-center gap-2 text-sm">
								<input type="radio" bind:group={$tForm.pricingDisplay} value="exclusive" /> Tax exclusive
							</label>
							<label class="flex items-center gap-2 text-sm">
								<input type="radio" bind:group={$tForm.pricingDisplay} value="inclusive" /> Tax inclusive
							</label>
						</div>
					</section>

					<section class="space-y-4">
						<div class="flex items-center justify-between gap-3">
							<h3 class="text-sm font-semibold">US sales tax</h3>
							<Switch
								checked={$tForm.usSalesTaxEnabled}
								onCheckedChange={(v) => ($tForm.usSalesTaxEnabled = v)}
							/>
						</div>
						<div class="grid grid-cols-2 gap-3">
							<div class="space-y-2">
								<Label for="b-ein">EIN</Label>
								<Input id="b-ein" bind:value={$tForm.usEin} disabled={!$tForm.usSalesTaxEnabled} />
							</div>
							<div class="space-y-2">
								<Label for="b-us-rate">General rate (%)</Label>
								<Input
									id="b-us-rate"
									type="number"
									min={0}
									max={100}
									step={0.01}
									bind:value={$tForm.usGeneralRate}
									disabled={!$tForm.usSalesTaxEnabled}
								/>
							</div>
						</div>
					</section>

					<section class="space-y-4">
						<div class="flex items-center justify-between gap-3">
							<h3 class="text-sm font-semibold">VAT</h3>
							<Switch
								checked={$tForm.vatEnabled}
								onCheckedChange={(v) => ($tForm.vatEnabled = v)}
							/>
						</div>
						<div class="grid grid-cols-2 gap-3">
							<div class="space-y-2">
								<Label for="b-vat-reg">VAT registration</Label>
								<Input
									id="b-vat-reg"
									bind:value={$tForm.vatRegistration}
									disabled={!$tForm.vatEnabled}
								/>
							</div>
							<div class="space-y-2">
								<Label for="b-vat-rate">VAT rate (%)</Label>
								<Input
									id="b-vat-rate"
									type="number"
									min={0}
									max={100}
									step={0.01}
									bind:value={$tForm.vatRate}
									disabled={!$tForm.vatEnabled}
								/>
							</div>
						</div>
					</section>

					<section class="space-y-4">
						<div class="flex items-center justify-between gap-3">
							<h3 class="text-sm font-semibold">GST</h3>
							<Switch
								checked={$tForm.gstEnabled}
								onCheckedChange={(v) => ($tForm.gstEnabled = v)}
							/>
						</div>
						<div class="grid grid-cols-2 gap-3">
							<div class="space-y-2">
								<Label for="b-gst-reg">GST registration</Label>
								<Input
									id="b-gst-reg"
									bind:value={$tForm.gstRegistration}
									disabled={!$tForm.gstEnabled}
								/>
							</div>
							<div class="space-y-2">
								<Label for="b-gst-rate">GST rate (%)</Label>
								<Input
									id="b-gst-rate"
									type="number"
									min={0}
									max={100}
									step={0.01}
									bind:value={$tForm.gstRate}
									disabled={!$tForm.gstEnabled}
								/>
							</div>
						</div>
					</section>

					<div class="flex justify-end pt-2">
						<Button type="submit" disabled={$tSubmitting}>Save taxes</Button>
					</div>
				</form>

				<!-- Per-state rates CRUD -->
				<div class="mt-8 space-y-4 border-t pt-6">
					<h3 class="text-sm font-semibold">Per-state rates</h3>
					{#if taxRates.length === 0}
						<div class="py-6 text-center">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="mx-auto h-16 w-16 text-foreground"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								stroke-width="0.4"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
								/>
							</svg>
							<p class="mt-4 text-lg font-semibold">No rates yet</p>
							<p class="mt-2 text-sm text-muted-foreground">
								Add a state to override the general rate above.
							</p>
						</div>
					{:else}
						<ul class="divide-y">
							{#each taxRates as r (r.id)}
								<li class="flex items-center justify-between py-2">
									<div class="text-sm">
										<span class="font-mono">{r.state_code}</span>
										<span class="ml-3">{Number(r.rate).toFixed(2)}%</span>
										<span class="ml-3 text-muted-foreground">{r.tax_type}</span>
									</div>
									<div class="flex gap-2">
										<Button
											type="button"
											variant="outline"
											size="sm"
											onclick={() => startEditRate(r)}>Edit</Button
										>
										<form method="POST" action="?/deleteTaxRate" use:trEnhance>
											<input type="hidden" name="id" value={r.id} />
											<Button type="submit" variant="outline" size="sm">Delete</Button>
										</form>
									</div>
								</li>
							{/each}
						</ul>
					{/if}

					<form method="POST" action="?/saveTaxRate" use:trEnhance class="space-y-3 pt-2">
						<h4 class="text-sm font-medium">{editingRateId ? 'Edit rate' : 'Add rate'}</h4>
						<input type="hidden" name="id" value={$trForm.id ?? ''} />
						<div class="grid grid-cols-3 gap-3">
							<div class="space-y-2">
								<Label for="b-rate-state">State</Label>
								<Input
									id="b-rate-state"
									bind:value={$trForm.stateCode}
									maxlength={2}
									placeholder="CA"
								/>
								{#if $trErrors.stateCode}<p class="text-sm text-destructive">
										{$trErrors.stateCode[0]}
									</p>{/if}
							</div>
							<div class="space-y-2">
								<Label for="b-rate-rate">Rate (%)</Label>
								<Input
									id="b-rate-rate"
									type="number"
									min={0}
									max={100}
									step={0.01}
									bind:value={$trForm.rate}
								/>
								{#if $trErrors.rate}<p class="text-sm text-destructive">{$trErrors.rate[0]}</p>{/if}
							</div>
							<div class="space-y-2">
								<Label for="b-rate-type">Type</Label>
								<SelectField
									bind:value={$trForm.taxType}
									items={[
										{ value: 'destination', label: 'Destination' },
										{ value: 'origin', label: 'Origin' }
									]}
								/>
							</div>
						</div>
						<div class="flex gap-2">
							<Button type="submit" disabled={$trSubmitting}
								>{editingRateId ? 'Update' : 'Add'}</Button
							>
							{#if editingRateId}
								<Button type="button" variant="outline" onclick={cancelEditRate}>Cancel</Button>
							{/if}
						</div>
					</form>
				</div>
			{:else if activeTab === 'shipping'}
				<form method="POST" action="?/saveCommerceShipping" use:sEnhance class="space-y-7">
					<section class="space-y-4">
						<div class="flex items-center justify-between gap-3">
							<h3 class="text-sm font-semibold">Ship from address</h3>
							<label class="flex items-center gap-2 text-sm">
								<Checkbox
									checked={$sForm.useBusinessAddress}
									onCheckedChange={(v) => ($sForm.useBusinessAddress = !!v)}
								/>
								Use business address
							</label>
						</div>
						{#if !$sForm.useBusinessAddress}
							<div class="grid grid-cols-2 gap-3">
								<div class="col-span-2 space-y-2">
									<Label for="b-ship-l1">Line 1</Label>
									<Input id="b-ship-l1" bind:value={$sForm.shippingFromLine1} />
								</div>
								<div class="col-span-2 space-y-2">
									<Label for="b-ship-l2">Line 2</Label>
									<Input id="b-ship-l2" bind:value={$sForm.shippingFromLine2} />
								</div>
								<div class="space-y-2">
									<Label for="b-ship-city">City</Label>
									<Input id="b-ship-city" bind:value={$sForm.shippingFromCity} />
								</div>
								<div class="space-y-2">
									<Label for="b-ship-state">State</Label>
									<Input id="b-ship-state" bind:value={$sForm.shippingFromState} />
								</div>
								<div class="space-y-2">
									<Label for="b-ship-zip">Zip</Label>
									<Input id="b-ship-zip" bind:value={$sForm.shippingFromZip} />
								</div>
								<div class="space-y-2">
									<Label for="b-ship-country">Country (ISO 2)</Label>
									<Input
										id="b-ship-country"
										bind:value={$sForm.shippingFromCountry}
										maxlength={2}
										placeholder="US"
									/>
								</div>
							</div>
						{/if}
					</section>

					<section class="space-y-4">
						<div class="flex items-center justify-between gap-3">
							<h3 class="text-sm font-semibold">Free shipping threshold</h3>
							<Switch
								checked={$sForm.freeThresholdEnabled}
								onCheckedChange={(v) => ($sForm.freeThresholdEnabled = v)}
							/>
						</div>
						<div class="space-y-2">
							<Label for="b-thresh">Amount</Label>
							<div class="flex items-center gap-2">
								<span class="text-sm text-muted-foreground">$</span>
								<Input
									id="b-thresh"
									type="number"
									min={0}
									step={0.01}
									bind:value={$sForm.freeThresholdAmount}
									disabled={!$sForm.freeThresholdEnabled}
									class="w-40"
								/>
							</div>
							{#if $sErrors.freeThresholdAmount}<p class="text-sm text-destructive">
									{$sErrors.freeThresholdAmount[0]}
								</p>{/if}
						</div>
					</section>

					<div class="flex justify-end pt-2">
						<Button type="submit" disabled={$sSubmitting}>Save shipping</Button>
					</div>
				</form>

				<!-- Methods CRUD -->
				<div class="mt-8 space-y-4 border-t pt-6">
					<h3 class="text-sm font-semibold">Methods</h3>
					{#if shippingMethods.length === 0}
						<div class="py-6 text-center">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="mx-auto h-16 w-16 text-foreground"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								stroke-width="0.4"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0zM13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0"
								/>
							</svg>
							<p class="mt-4 text-lg font-semibold">No methods yet</p>
							<p class="mt-2 text-sm text-muted-foreground">
								Add a shipping option buyers can pick.
							</p>
						</div>
					{:else}
						<ul class="divide-y">
							{#each shippingMethods as m (m.id)}
								<li class="flex items-center justify-between py-2">
									<div class="text-sm">
										<span class="font-medium">{m.name}</span>
										{#if m.id === defaultShippingMethodId}<span
												class="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs">Default</span
											>{/if}
										<span class="ml-3 text-muted-foreground"
											>{m.cost_type}{m.cost_type === 'flat' && m.cost_amount !== null
												? ` $${Number(m.cost_amount).toFixed(2)}`
												: ''}</span
										>
									</div>
									<div class="flex gap-2">
										{#if m.id !== defaultShippingMethodId}
											<form method="POST" action="?/makeDefaultShippingMethod" use:smEnhance>
												<input type="hidden" name="id" value={m.id} />
												<Button type="submit" variant="outline" size="sm">Set default</Button>
											</form>
										{/if}
										<Button
											type="button"
											variant="outline"
											size="sm"
											onclick={() => startEditMethod(m)}>Edit</Button
										>
										<form method="POST" action="?/deleteShippingMethod" use:smEnhance>
											<input type="hidden" name="id" value={m.id} />
											<Button type="submit" variant="outline" size="sm">Delete</Button>
										</form>
									</div>
								</li>
							{/each}
						</ul>
					{/if}

					<form method="POST" action="?/saveShippingMethod" use:smEnhance class="space-y-3 pt-2">
						<h4 class="text-sm font-medium">{editingMethodId ? 'Edit method' : 'Add method'}</h4>
						<input type="hidden" name="id" value={$smForm.id ?? ''} />
						<div class="grid grid-cols-2 gap-3">
							<div class="space-y-2">
								<Label for="b-meth-name">Name</Label>
								<Input id="b-meth-name" bind:value={$smForm.name} />
								{#if $smErrors.name}<p class="text-sm text-destructive">{$smErrors.name[0]}</p>{/if}
							</div>
							<div class="space-y-2">
								<Label for="b-meth-type">Cost type</Label>
								<SelectField
									bind:value={$smForm.costType}
									items={[
										{ value: 'flat', label: 'Flat' },
										{ value: 'calculated', label: 'Calculated' },
										{ value: 'free', label: 'Free' }
									]}
								/>
							</div>
							{#if $smForm.costType === 'flat'}
								<div class="space-y-2">
									<Label for="b-meth-cost">Cost</Label>
									<div class="flex items-center gap-2">
										<span class="text-sm text-muted-foreground">$</span>
										<Input
											id="b-meth-cost"
											type="number"
											min={0}
											step={0.01}
											bind:value={$smForm.costAmount}
											class="w-40"
										/>
									</div>
									{#if $smErrors.costAmount}<p class="text-sm text-destructive">
											{$smErrors.costAmount[0]}
										</p>{/if}
								</div>
							{/if}
							<div class="space-y-2">
								<Label for="b-meth-window">Delivery window</Label>
								<Input
									id="b-meth-window"
									bind:value={$smForm.deliveryWindow}
									placeholder="3–5 business days"
								/>
							</div>
						</div>
						<div class="flex gap-2">
							<Button type="submit" disabled={$smSubmitting}
								>{editingMethodId ? 'Update' : 'Add'}</Button
							>
							{#if editingMethodId}
								<Button type="button" variant="outline" onclick={cancelEditMethod}>Cancel</Button>
							{/if}
						</div>
					</form>
				</div>
			{:else if activeTab === 'returns'}
				<form method="POST" action="?/saveCommerceReturns" use:rEnhance class="space-y-7">
					<section class="space-y-4">
						<h3 class="text-sm font-semibold">Return window</h3>
						<div class="space-y-2">
							<Label for="b-window">Days (0 disables returns)</Label>
							<Input
								id="b-window"
								type="number"
								min={0}
								max={3650}
								step={1}
								bind:value={$rForm.windowDays}
								class="w-40"
							/>
							{#if $rErrors.windowDays}<p class="text-sm text-destructive">
									{$rErrors.windowDays[0]}
								</p>{/if}
						</div>
					</section>

					<section class="space-y-4">
						<h3 class="text-sm font-semibold">Policy text</h3>
						<textarea
							bind:value={$rForm.policyText}
							class="min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
							maxlength={20000}
						></textarea>
					</section>

					<section class="space-y-4">
						<div class="flex items-center justify-between gap-3">
							<h3 class="text-sm font-semibold">Returns address</h3>
							<label class="flex items-center gap-2 text-sm">
								<Checkbox
									checked={$rForm.useShipFromAddress}
									onCheckedChange={(v) => ($rForm.useShipFromAddress = !!v)}
								/>
								Use ship-from address
							</label>
						</div>
						{#if !$rForm.useShipFromAddress}
							<div class="grid grid-cols-2 gap-3">
								<div class="col-span-2 space-y-2">
									<Label for="b-ret-l1">Line 1</Label>
									<Input id="b-ret-l1" bind:value={$rForm.returnsAddressLine1} />
								</div>
								<div class="col-span-2 space-y-2">
									<Label for="b-ret-l2">Line 2</Label>
									<Input id="b-ret-l2" bind:value={$rForm.returnsAddressLine2} />
								</div>
								<div class="space-y-2">
									<Label for="b-ret-city">City</Label>
									<Input id="b-ret-city" bind:value={$rForm.returnsAddressCity} />
								</div>
								<div class="space-y-2">
									<Label for="b-ret-state">State</Label>
									<Input id="b-ret-state" bind:value={$rForm.returnsAddressState} />
								</div>
								<div class="space-y-2">
									<Label for="b-ret-zip">Zip</Label>
									<Input id="b-ret-zip" bind:value={$rForm.returnsAddressZip} />
								</div>
								<div class="space-y-2">
									<Label for="b-ret-country">Country (ISO 2)</Label>
									<Input
										id="b-ret-country"
										bind:value={$rForm.returnsAddressCountry}
										maxlength={2}
									/>
								</div>
							</div>
						{/if}
					</section>

					<section class="space-y-4">
						<h3 class="text-sm font-semibold">Restocking fee</h3>
						<div class="grid grid-cols-2 gap-3">
							<div class="space-y-2">
								<Label for="b-fee-type">Type</Label>
								<SelectField
									bind:value={$rForm.restockingFeeType}
									items={[
										{ value: 'percent', label: 'Percent' },
										{ value: 'flat', label: 'Flat' }
									]}
								/>
							</div>
							<div class="space-y-2">
								<Label for="b-fee-val">Value</Label>
								<Input
									id="b-fee-val"
									type="number"
									min={0}
									step={0.01}
									bind:value={$rForm.restockingFeeValue}
								/>
								{#if $rErrors.restockingFeeValue}<p class="text-sm text-destructive">
										{$rErrors.restockingFeeValue[0]}
									</p>{/if}
							</div>
						</div>
					</section>

					<section class="flex items-center justify-between gap-3">
						<div>
							<h3 class="text-sm font-semibold">Buyer pays return shipping</h3>
							<p class="mt-0.5 text-sm text-muted-foreground">Buyer covers the return label.</p>
						</div>
						<Switch
							checked={$rForm.buyerPaysShipping}
							onCheckedChange={(v) => ($rForm.buyerPaysShipping = v)}
						/>
					</section>

					<div class="flex justify-end pt-2">
						<Button type="submit" disabled={$rSubmitting}>Save returns</Button>
					</div>
				</form>
			{:else if activeTab === 'payments'}
				<form method="POST" action="?/saveCommercePayments" use:pEnhance class="space-y-7">
					<section class="space-y-4">
						<h3 class="text-sm font-semibold">Processor</h3>
						<div class="flex gap-4">
							<label class="flex items-center gap-2 text-sm">
								<input type="radio" bind:group={$pForm.processor} value="manual" /> Manual
							</label>
							<label class="flex items-center gap-2 text-sm">
								<input type="radio" bind:group={$pForm.processor} value="stripe" /> Stripe
							</label>
						</div>
						{#if $pForm.processor === 'stripe'}
							<label class="flex items-center gap-2 text-sm">
								<Checkbox
									checked={$pForm.stripeLinkEnabled}
									onCheckedChange={(v) => ($pForm.stripeLinkEnabled = !!v)}
								/>
								Allow Stripe Link payments
							</label>
						{/if}
					</section>

					<section class="space-y-4">
						<h3 class="text-sm font-semibold">Accepted payment methods</h3>
						<div class="grid grid-cols-2 gap-2">
							{#each PAYMENT_METHODS as m (m.code)}
								<label class="flex items-center gap-2 text-sm">
									<Checkbox
										checked={$pForm.acceptedMethods.includes(m.code)}
										onCheckedChange={() => toggleMethod(m.code)}
									/>
									{m.label}
								</label>
							{/each}
						</div>
					</section>

					<section class="space-y-4">
						<h3 class="text-sm font-semibold">Defaults</h3>
						<div class="grid grid-cols-2 gap-3">
							<div class="space-y-2">
								<Label for="b-pay-method">Default method</Label>
								<SelectField bind:value={$pForm.defaultMethod} items={defaultMethodItems} />
								{#if $pErrors.defaultMethod}<p class="text-sm text-destructive">
										{$pErrors.defaultMethod[0]}
									</p>{/if}
							</div>
							<div class="space-y-2">
								<Label for="b-pay-term">Default term</Label>
								<Input id="b-pay-term" bind:value={$pForm.defaultTerm} placeholder="net_30" />
							</div>
						</div>
					</section>

					<section class="space-y-4">
						<div class="flex items-center justify-between gap-3">
							<h3 class="text-sm font-semibold">Required deposit</h3>
							<Switch
								checked={$pForm.requiredDepositEnabled}
								onCheckedChange={(v) => ($pForm.requiredDepositEnabled = v)}
							/>
						</div>
						<div class="grid grid-cols-2 gap-3">
							<div class="space-y-2">
								<Label for="b-dep-pct">Percent (%)</Label>
								<Input
									id="b-dep-pct"
									type="number"
									min={0}
									max={100}
									step={0.01}
									bind:value={$pForm.requiredDepositPercent}
									disabled={!$pForm.requiredDepositEnabled}
								/>
								{#if $pErrors.requiredDepositPercent}<p class="text-sm text-destructive">
										{$pErrors.requiredDepositPercent[0]}
									</p>{/if}
							</div>
							<div class="space-y-2">
								<Label for="b-dep-acc">Deposit account name</Label>
								<Input
									id="b-dep-acc"
									bind:value={$pForm.depositAccountName}
									disabled={!$pForm.requiredDepositEnabled}
								/>
							</div>
						</div>
					</section>

					<section class="flex items-center justify-between gap-3">
						<div>
							<h3 class="text-sm font-semibold">Pass surcharge to buyer</h3>
							<p class="mt-0.5 text-sm text-muted-foreground">
								Add credit-card surcharge to the buyer's invoice.
							</p>
						</div>
						<Switch
							checked={$pForm.surchargePassToBuyer}
							onCheckedChange={(v) => ($pForm.surchargePassToBuyer = v)}
						/>
					</section>

					<div class="flex justify-end pt-2">
						<Button type="submit" disabled={$pSubmitting}>Save payments</Button>
					</div>
				</form>
			{/if}
		</div>
	</div>

	<div class="flex justify-end px-6 py-4">
		<Button variant="outline" onclick={() => onOpenChange(false)}>Close</Button>
	</div>
</div>
