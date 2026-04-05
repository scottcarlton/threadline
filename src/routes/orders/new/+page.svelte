<script lang="ts">
	import { goto } from '$app/navigation';
	import { supabase } from '$lib/supabase.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '$lib/components/ui/card/index.js';

	let { data } = $props();
	const accounts = $derived(data.accounts as { id: string; business_name: string }[]);
	const brands = $derived(data.brands as { id: string; name: string }[]);
	const seasons = $derived(data.seasons as { id: string; name: string }[]);
	const shows = $derived(data.shows as { id: string; name: string; season_id: string | null; year: number | null }[]);

	// Step tracking
	let step = $state(1);
	const totalSteps = 4;

	// Form state
	let accountId = $state('');
	let brandId = $state('');
	let seasonId = $state('');
	let orderYear = $state(new Date().getFullYear());
	let showId = $state('');
	let notes = $state('');
	let error = $state('');
	let loading = $state(false);

	// Line items
	type LineItem = { style_number: string; description: string; color: string; size: string; qty: number; unit_price: number };
	let lines = $state<LineItem[]>([
		{ style_number: '', description: '', color: '', size: '', qty: 0, unit_price: 0 }
	]);

	const orderTotal = $derived(lines.reduce((sum, l) => sum + l.qty * l.unit_price, 0));

	const selectedAccount = $derived(accounts.find((a) => a.id === accountId));
	const selectedBrand = $derived(brands.find((b) => b.id === brandId));
	const selectedSeason = $derived(seasons.find((s) => s.id === seasonId));

	function addLine() {
		lines.push({ style_number: '', description: '', color: '', size: '', qty: 0, unit_price: 0 });
	}

	function removeLine(index: number) {
		lines.splice(index, 1);
	}

	async function handleSubmit(asDraft: boolean) {
		error = '';
		loading = true;

		// Create order
		const { data: order, error: orderErr } = await supabase
			.from('orders')
			.insert({
				organization_id: data.organization?.id,
				account_id: accountId,
				brand_id: brandId,
				season_id: seasonId || null,
				order_year: orderYear || null,
				show_id: showId || null,
				notes: notes || null,
				status: asDraft ? 'draft' : 'submitted',
				submitted_at: asDraft ? null : new Date().toISOString(),
				created_by: data.user?.id
			})
			.select()
			.single();

		if (orderErr || !order) {
			error = orderErr?.message ?? 'Failed to create order';
			loading = false;
			return;
		}

		// Add line items
		const validLines = lines.filter((l) => l.qty > 0 || l.description);
		if (validLines.length > 0) {
			const { error: lineErr } = await supabase.from('order_lines').insert(
				validLines.map((l, i) => ({
					order_id: order.id,
					style_number: l.style_number || null,
					description: l.description || null,
					color: l.color || null,
					size: l.size || null,
					qty: l.qty,
					unit_price: l.unit_price,
					sort_order: i
				}))
			);

			if (lineErr) {
				error = lineErr.message;
				loading = false;
				return;
			}
		}

		loading = false;
		goto(`/orders/${order.id}`);
	}
</script>

<div class="mx-auto max-w-3xl space-y-6">
	<!-- Progress indicator -->
	<div class="flex items-center gap-2">
		{#each Array(totalSteps) as _, i}
			<div class="flex items-center gap-2">
				<div
					class="flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium {step > i + 1 ? 'bg-primary text-primary-foreground' : step === i + 1 ? 'border-2 border-primary text-primary' : 'border border-muted-foreground/30 text-muted-foreground'}"
				>
					{i + 1}
				</div>
				{#if i < totalSteps - 1}
					<div class="h-px w-8 {step > i + 1 ? 'bg-primary' : 'bg-muted-foreground/30'}"></div>
				{/if}
			</div>
		{/each}
	</div>

	{#if error}
		<div class="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
	{/if}

	<!-- Step 1: Account -->
	{#if step === 1}
		<Card>
			<CardHeader>
				<CardTitle>Select Account</CardTitle>
				<CardDescription>Which buyer is this order for?</CardDescription>
			</CardHeader>
			<CardContent>
				<select
					bind:value={accountId}
					class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
				>
					<option value="">Select an account...</option>
					{#each accounts as account}
						<option value={account.id}>{account.business_name}</option>
					{/each}
				</select>
			</CardContent>
			<CardFooter class="justify-between">
				<Button variant="outline" href="/orders">Cancel</Button>
				<Button disabled={!accountId} onclick={() => (step = 2)}>Next</Button>
			</CardFooter>
		</Card>
	{/if}

	<!-- Step 2: Brand + Season -->
	{#if step === 2}
		<Card>
			<CardHeader>
				<CardTitle>Brand & Season</CardTitle>
				<CardDescription>Select the brand and season for this order</CardDescription>
			</CardHeader>
			<CardContent class="space-y-4">
				<div class="space-y-2">
					<Label for="brand">Brand *</Label>
					<select
						id="brand"
						bind:value={brandId}
						class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
					>
						<option value="">Select a brand...</option>
						{#each brands as brand}
							<option value={brand.id}>{brand.name}</option>
						{/each}
					</select>
				</div>
				<div class="grid gap-4 sm:grid-cols-2">
					<div class="space-y-2">
						<Label for="season">Season</Label>
						<select
							id="season"
							bind:value={seasonId}
							class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
						>
							<option value="">No season</option>
							{#each seasons as season}
								<option value={season.id}>{season.name}</option>
							{/each}
						</select>
					</div>
					<div class="space-y-2">
						<Label for="year">Year</Label>
						<Input id="year" type="number" bind:value={orderYear} min={2020} max={2040} />
					</div>
				</div>
				<div class="space-y-2">
					<Label for="show">Show (optional)</Label>
					<select
						id="show"
						bind:value={showId}
						class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
					>
						<option value="">No show</option>
						{#each shows as show}
							<option value={show.id}>{show.name}</option>
						{/each}
					</select>
				</div>
			</CardContent>
			<CardFooter class="justify-between">
				<Button variant="outline" onclick={() => (step = 1)}>Back</Button>
				<Button disabled={!brandId} onclick={() => (step = 3)}>Next</Button>
			</CardFooter>
		</Card>
	{/if}

	<!-- Step 3: Line Items -->
	{#if step === 3}
		<Card>
			<CardHeader>
				<CardTitle>Line Items</CardTitle>
				<CardDescription>Add the items for this order</CardDescription>
			</CardHeader>
			<CardContent>
				<div class="space-y-3">
					<div class="grid grid-cols-[1fr_1.5fr_0.8fr_0.6fr_0.6fr_0.8fr_auto] gap-2 text-xs font-medium text-muted-foreground">
						<div>Style #</div>
						<div>Description</div>
						<div>Color</div>
						<div>Size</div>
						<div>Qty</div>
						<div>Price</div>
						<div></div>
					</div>
					{#each lines as line, i}
						<div class="grid grid-cols-[1fr_1.5fr_0.8fr_0.6fr_0.6fr_0.8fr_auto] gap-2">
							<Input bind:value={line.style_number} placeholder="ST-001" class="h-9 text-sm" />
							<Input bind:value={line.description} placeholder="Silk Blouse" class="h-9 text-sm" />
							<Input bind:value={line.color} placeholder="Navy" class="h-9 text-sm" />
							<Input bind:value={line.size} placeholder="S" class="h-9 text-sm" />
							<Input type="number" bind:value={line.qty} min={0} class="h-9 text-sm" />
							<Input type="number" bind:value={line.unit_price} min={0} step="0.01" class="h-9 text-sm" />
							<Button variant="ghost" size="sm" class="h-9 px-2" onclick={() => removeLine(i)} disabled={lines.length <= 1}>
								X
							</Button>
						</div>
					{/each}
				</div>
				<div class="mt-3 flex items-center justify-between">
					<Button variant="outline" size="sm" onclick={addLine}>+ Add Line</Button>
					<p class="text-sm font-medium">
						Total: {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(orderTotal)}
					</p>
				</div>
			</CardContent>
			<CardFooter class="justify-between">
				<Button variant="outline" onclick={() => (step = 2)}>Back</Button>
				<Button onclick={() => (step = 4)}>Review</Button>
			</CardFooter>
		</Card>
	{/if}

	<!-- Step 4: Review -->
	{#if step === 4}
		<Card>
			<CardHeader>
				<CardTitle>Review Order</CardTitle>
			</CardHeader>
			<CardContent class="space-y-4">
				<dl class="space-y-3">
					<div class="flex justify-between">
						<dt class="text-sm text-muted-foreground">Account</dt>
						<dd class="text-sm font-medium">{selectedAccount?.business_name}</dd>
					</div>
					<div class="flex justify-between">
						<dt class="text-sm text-muted-foreground">Brand</dt>
						<dd class="text-sm font-medium">{selectedBrand?.name}</dd>
					</div>
					{#if selectedSeason}
						<div class="flex justify-between">
							<dt class="text-sm text-muted-foreground">Season</dt>
							<dd class="text-sm font-medium">{selectedSeason.name} {orderYear}</dd>
						</div>
					{/if}
					<div class="flex justify-between border-t pt-3">
						<dt class="text-sm text-muted-foreground">Line items</dt>
						<dd class="text-sm font-medium">{lines.filter((l) => l.qty > 0 || l.description).length}</dd>
					</div>
					<div class="flex justify-between">
						<dt class="text-sm font-medium">Order Total</dt>
						<dd class="text-lg font-bold">
							{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(orderTotal)}
						</dd>
					</div>
				</dl>
				{#if notes}
					<div>
						<p class="text-sm text-muted-foreground">Notes</p>
						<p class="text-sm">{notes}</p>
					</div>
				{/if}
				<div class="space-y-2">
					<Label for="order-notes">Notes</Label>
					<textarea
						id="order-notes"
						bind:value={notes}
						rows="2"
						placeholder="Order notes..."
						class="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
					></textarea>
				</div>
			</CardContent>
			<CardFooter class="justify-between">
				<Button variant="outline" onclick={() => (step = 3)}>Back</Button>
				<div class="flex gap-2">
					<Button variant="outline" disabled={loading} onclick={() => handleSubmit(true)}>
						{loading ? 'Saving...' : 'Save as Draft'}
					</Button>
					<Button disabled={loading} onclick={() => handleSubmit(false)}>
						{loading ? 'Submitting...' : 'Submit Order'}
					</Button>
				</div>
			</CardFooter>
		</Card>
	{/if}
</div>
