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
	import {
		organizationShippingSchema,
		shippingMethodSchema
	} from '$lib/schemas/organization-shipping.js';
	import type { OrganizationShippingMethod } from '$lib/types/database.js';

	let { data } = $props();

	const methods = $derived(data.methods as OrganizationShippingMethod[]);
	const defaultMethodId = $derived(data.defaultMethodId);

	// svelte-ignore state_referenced_locally
	const formInitial = data.form;

	const { form, errors, enhance, submitting } = superForm(formInitial, {
		validators: zod4Client(organizationShippingSchema),
		validationMethod: 'onblur',
		dataType: 'json',
		resetForm: false,
		onResult: ({ result }) => {
			if (result.type === 'success') {
				toast.success('Shipping settings updated.');
			} else if (result.type === 'failure') {
				const msg = (result.data as { message?: string } | undefined)?.message;
				if (msg) toast.error(msg);
			} else if (result.type === 'error') {
				toast.error(result.error?.message ?? 'Failed to save changes.');
			}
		}
	});

	const COST_TYPE_OPTIONS = [
		{ value: 'flat', label: 'Flat' },
		{ value: 'calculated', label: 'Calculated' },
		{ value: 'free', label: 'Free' }
	];

	let methodModalOpen = $state(false);
	let editingMethod = $state<OrganizationShippingMethod | null>(null);
	let methodForm = $state<{
		name: string;
		costType: 'flat' | 'calculated' | 'free';
		costAmount: string;
		deliveryWindow: string;
	}>({ name: '', costType: 'flat', costAmount: '', deliveryWindow: '' });
	let methodError = $state('');
	let methodSubmitting = $state(false);

	function openAddMethod() {
		editingMethod = null;
		methodForm = { name: '', costType: 'flat', costAmount: '', deliveryWindow: '' };
		methodError = '';
		methodModalOpen = true;
	}

	function openEditMethod(row: OrganizationShippingMethod) {
		editingMethod = row;
		methodForm = {
			name: row.name,
			costType: row.cost_type,
			costAmount: row.cost_amount === null ? '' : String(row.cost_amount),
			deliveryWindow: row.delivery_window ?? ''
		};
		methodError = '';
		methodModalOpen = true;
	}

	async function submitMethod(e: Event) {
		e.preventDefault();
		methodError = '';

		const parsed = shippingMethodSchema.safeParse({
			id: editingMethod?.id,
			name: methodForm.name,
			costType: methodForm.costType,
			costAmount: methodForm.costAmount,
			deliveryWindow: methodForm.deliveryWindow
		});
		if (!parsed.success) {
			methodError = parsed.error.issues[0]?.message ?? 'Invalid input';
			return;
		}

		methodSubmitting = true;
		try {
			const fd = new FormData();
			if (editingMethod?.id) fd.append('id', editingMethod.id);
			fd.append('name', parsed.data.name);
			fd.append('costType', parsed.data.costType);
			fd.append('costAmount', String(parsed.data.costAmount));
			fd.append('deliveryWindow', parsed.data.deliveryWindow);

			const res = await fetch('?/upsertMethod', { method: 'POST', body: fd });
			if (!res.ok) {
				const body = (await res.json().catch(() => ({}))) as { message?: string };
				methodError = body.message ?? 'Save failed';
				return;
			}
			toast.success(editingMethod ? 'Method updated.' : 'Method added.');
			methodModalOpen = false;
			location.reload();
		} catch {
			methodError = 'Save failed';
		} finally {
			methodSubmitting = false;
		}
	}

	async function deleteMethod(row: OrganizationShippingMethod) {
		if (!confirm(`Remove "${row.name}"?`)) return;
		const fd = new FormData();
		fd.append('id', row.id);
		const res = await fetch('?/deleteMethod', { method: 'POST', body: fd });
		if (!res.ok) {
			const body = (await res.json().catch(() => ({}))) as { message?: string };
			toast.error(body.message ?? 'Delete failed');
			return;
		}
		toast.success(`${row.name} removed.`);
		location.reload();
	}

	async function makeDefault(row: OrganizationShippingMethod) {
		const fd = new FormData();
		fd.append('id', row.id);
		const res = await fetch('?/makeDefault', { method: 'POST', body: fd });
		if (!res.ok) {
			const body = (await res.json().catch(() => ({}))) as { message?: string };
			toast.error(body.message ?? 'Save failed');
			return;
		}
		toast.success(`${row.name} is now the default.`);
		location.reload();
	}

	function formatCost(row: OrganizationShippingMethod): string {
		if (row.cost_type === 'free') return 'Free';
		if (row.cost_type === 'calculated') return 'Calculated';
		return row.cost_amount === null ? '—' : `$${row.cost_amount}`;
	}
</script>

<div class="max-w-2xl space-y-6">
	<div>
		<h2 class="text-lg font-semibold">Shipping</h2>
		<p class="mt-0.5 text-sm text-muted-foreground">
			Ship-from address, methods, and free-shipping thresholds.
		</p>
	</div>

	<form method="POST" use:enhance class="space-y-8">
		<!-- Ship-from address -->
		<section class="space-y-4 rounded-md border p-4">
			<div class="flex items-center justify-between gap-3">
				<div>
					<h3 class="text-sm font-semibold">Ship-from address</h3>
					<p class="mt-0.5 text-sm text-muted-foreground">
						Where you ship from. Defaults to your business address.
					</p>
				</div>
				<div class="flex items-center gap-2">
					<span class="text-sm text-muted-foreground">Use business address</span>
					<Switch
						checked={$form.useBusinessAddress}
						onCheckedChange={(v) => ($form.useBusinessAddress = v)}
					/>
				</div>
			</div>

			{#if !$form.useBusinessAddress}
				<div class="space-y-4 border-t pt-4">
					<div class="space-y-2">
						<Label for="ship-line1">Address line 1</Label>
						<Input
							id="ship-line1"
							bind:value={$form.shippingFromLine1}
							placeholder="123 Warehouse Way"
						/>
					</div>
					<div class="space-y-2">
						<Label for="ship-line2">Address line 2</Label>
						<Input id="ship-line2" bind:value={$form.shippingFromLine2} placeholder="Bay 4" />
					</div>
					<div class="grid grid-cols-[1fr_80px_100px] gap-3">
						<div class="space-y-2">
							<Label for="ship-city">City</Label>
							<Input id="ship-city" bind:value={$form.shippingFromCity} placeholder="Newark" />
						</div>
						<div class="space-y-2">
							<Label for="ship-state">State</Label>
							<Input id="ship-state" bind:value={$form.shippingFromState} placeholder="NJ" />
						</div>
						<div class="space-y-2">
							<Label for="ship-zip">ZIP</Label>
							<Input id="ship-zip" bind:value={$form.shippingFromZip} placeholder="07102" />
						</div>
					</div>
					<div class="space-y-2">
						<Label for="ship-country">Country</Label>
						<Input
							id="ship-country"
							bind:value={$form.shippingFromCountry}
							maxlength={2}
							placeholder="US"
							class="w-24"
						/>
					</div>
				</div>
			{/if}
		</section>

		<!-- Free shipping threshold -->
		<section class="space-y-4 rounded-md border p-4">
			<div class="flex items-center justify-between gap-3">
				<div>
					<h3 class="text-sm font-semibold">Free shipping threshold</h3>
					<p class="mt-0.5 text-sm text-muted-foreground">
						Waive shipping when an order total reaches this amount.
					</p>
				</div>
				<Switch
					checked={$form.freeThresholdEnabled}
					onCheckedChange={(v) => ($form.freeThresholdEnabled = v)}
				/>
			</div>

			{#if $form.freeThresholdEnabled}
				<div class="border-t pt-4">
					<div class="space-y-2">
						<Label for="free-threshold">Threshold</Label>
						<div class="flex items-center gap-2">
							<span class="text-sm text-muted-foreground">$</span>
							<Input
								id="free-threshold"
								type="number"
								min={0}
								step={0.01}
								bind:value={$form.freeThresholdAmount}
								class="w-40"
								aria-invalid={$errors.freeThresholdAmount ? 'true' : undefined}
							/>
						</div>
						{#if $errors.freeThresholdAmount}
							<p class="text-sm text-destructive">{$errors.freeThresholdAmount[0]}</p>
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

	<!-- Methods -->
	<section class="space-y-4 rounded-md border p-4">
		<div class="flex items-center justify-between">
			<div>
				<h3 class="text-sm font-semibold">Shipping methods</h3>
				<p class="mt-0.5 text-sm text-muted-foreground">
					What buyers see at checkout. Make one the default for new orders.
				</p>
			</div>
			<Button type="button" variant="outline" size="sm" onclick={openAddMethod}>Add method</Button>
		</div>

		{#if methods.length === 0}
			<p class="text-sm text-muted-foreground">No methods yet.</p>
		{:else}
			<div class="overflow-hidden rounded-md border">
				<table class="w-full text-sm">
					<thead class="bg-muted/50">
						<tr>
							<th class="px-3 py-2 text-left font-medium">Name</th>
							<th class="px-3 py-2 text-left font-medium">Cost</th>
							<th class="px-3 py-2 text-left font-medium">Delivery</th>
							<th class="px-3 py-2 text-left font-medium">Default</th>
							<th class="px-3 py-2"></th>
						</tr>
					</thead>
					<tbody class="divide-y">
						{#each methods as row (row.id)}
							<tr>
								<td class="px-3 py-2 font-medium">{row.name}</td>
								<td class="px-3 py-2">{formatCost(row)}</td>
								<td class="px-3 py-2 text-muted-foreground">{row.delivery_window ?? '—'}</td>
								<td class="px-3 py-2">
									{#if defaultMethodId === row.id}
										<span
											class="inline-flex items-center rounded-full bg-foreground px-2 py-0.5 text-sm font-medium text-background"
											>Default</span
										>
									{:else}
										<button
											type="button"
											class="text-sm text-muted-foreground hover:text-foreground"
											onclick={() => makeDefault(row)}
										>
											Make default
										</button>
									{/if}
								</td>
								<td class="px-3 py-2 text-right">
									<button
										type="button"
										class="text-sm text-muted-foreground hover:text-foreground"
										onclick={() => openEditMethod(row)}
									>
										Edit
									</button>
									<span class="mx-2 text-muted-foreground">·</span>
									<button
										type="button"
										class="text-sm text-muted-foreground hover:text-destructive"
										onclick={() => deleteMethod(row)}
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
	</section>
</div>

<Dialog.Root bind:open={methodModalOpen}>
	<Dialog.Portal>
		<Dialog.Overlay
			class="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50"
		/>
		<Dialog.Content
			class="fixed top-[50%] left-[50%] z-50 w-full max-w-md translate-x-[-50%] translate-y-[-50%] rounded-lg border bg-background p-6 shadow-lg"
		>
			<Dialog.Title class="text-lg font-semibold">
				{editingMethod ? 'Edit method' : 'Add method'}
			</Dialog.Title>
			<Dialog.Description class="mt-1 text-sm text-muted-foreground">
				Choose a name buyers will recognize and how the cost is calculated.
			</Dialog.Description>

			<form onsubmit={submitMethod} class="mt-5 space-y-4">
				<div class="space-y-2">
					<Label for="method-name">Name</Label>
					<Input
						id="method-name"
						bind:value={methodForm.name}
						maxlength={100}
						placeholder="Standard ground"
					/>
				</div>

				<div class="grid grid-cols-2 gap-3">
					<div class="space-y-2">
						<Label for="method-cost-type">Cost type</Label>
						<SelectField
							bind:value={methodForm.costType}
							items={COST_TYPE_OPTIONS}
							placeholder="Select type"
							class="w-full"
						/>
					</div>
					<div class="space-y-2">
						<Label for="method-cost">Amount</Label>
						<div class="flex items-center gap-2">
							<span class="text-sm text-muted-foreground">$</span>
							<Input
								id="method-cost"
								type="number"
								min={0}
								step={0.01}
								bind:value={methodForm.costAmount}
								disabled={methodForm.costType !== 'flat'}
								placeholder={methodForm.costType === 'flat' ? '0.00' : '—'}
							/>
						</div>
					</div>
				</div>

				<div class="space-y-2">
					<Label for="method-window">Delivery window</Label>
					<Input
						id="method-window"
						bind:value={methodForm.deliveryWindow}
						maxlength={100}
						placeholder="3–5 business days"
					/>
				</div>

				{#if methodError}
					<p class="text-sm text-destructive">{methodError}</p>
				{/if}

				<div class="flex justify-end gap-2 pt-2">
					<Button type="button" variant="outline" onclick={() => (methodModalOpen = false)}>
						Cancel
					</Button>
					<Button type="submit" disabled={methodSubmitting}>
						{methodSubmitting ? 'Saving…' : editingMethod ? 'Save' : 'Add method'}
					</Button>
				</div>
			</form>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
