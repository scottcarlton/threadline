<script lang="ts">
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { supabase } from '$lib/supabase.js';
	import type { ProductDraft, ProductImportResult } from '$lib/schemas/product-import.js';

	type Props = {
		brandId: string;
		// Loose-shape rows from either the AI extractor or the CSV mapper.
		// Coerced to the canonical ProductDraft shape on render so the user
		// edits canonical fields. The server re-validates with Zod on commit.
		rawProducts: Record<string, unknown>[];
		unmappedColumns?: string[];
		onCancel: () => void;
		onCompleted: (result: ProductImportResult) => void;
	};

	let { brandId, rawProducts, unmappedColumns = [], onCancel, onCompleted }: Props = $props();

	type EditableProduct = {
		style_number: string;
		name: string;
		wholesale_price: string;
		retail_price: string;
		category: string;
		subcategory: string;
		description: string;
		sizes: string;
		colors: string;
		image_url: string;
		_originalIndex: number;
		_existing: boolean;
	};

	function toEditable(raw: Record<string, unknown>, index: number): EditableProduct {
		const arrToStr = (v: unknown): string =>
			Array.isArray(v) ? v.join(', ') : typeof v === 'string' ? v : '';
		return {
			style_number: String(raw.style_number ?? '').trim(),
			name: String(raw.name ?? '').trim(),
			wholesale_price: raw.wholesale_price != null ? String(raw.wholesale_price) : '',
			retail_price: raw.retail_price != null ? String(raw.retail_price) : '',
			category: String(raw.category ?? '').trim(),
			subcategory: String(raw.subcategory ?? '').trim(),
			description: String(raw.description ?? '').trim(),
			sizes: arrToStr(raw.sizes),
			colors: arrToStr(raw.colors),
			image_url: String(raw.image_url ?? '').trim(),
			_originalIndex: index,
			_existing: false
		};
	}

	// svelte-ignore state_referenced_locally
	let products = $state<EditableProduct[]>(rawProducts.map(toEditable));
	let onConflict = $state<'skip' | 'replace'>('skip');
	let submitting = $state(false);

	// Existing-style detection. Lookup once on mount so dedupe badges
	// render before the user starts editing. We use the user-scoped
	// `supabase` client (RLS-respecting) because the user already has
	// brand visibility on this page.
	onMount(async () => {
		const styleNumbers = Array.from(
			new Set(products.map((p) => p.style_number).filter((s) => s.length > 0))
		);
		if (styleNumbers.length === 0) return;
		const { data: existing } = await supabase
			.from('products')
			.select('style_number')
			.eq('brand_id', brandId)
			.in('style_number', styleNumbers);
		const set = new Set((existing ?? []).map((r) => r.style_number));
		products = products.map((p) => ({ ...p, _existing: set.has(p.style_number) }));
	});

	function removeRow(index: number) {
		products = products.filter((_, i) => i !== index);
	}

	const collisionCount = $derived(products.filter((p) => p._existing).length);

	function toDraft(p: EditableProduct): ProductDraft {
		const splitCsv = (s: string) =>
			s
				.split(/[,;|]/)
				.map((v) => v.trim())
				.filter((v) => v.length > 0);

		return {
			style_number: p.style_number,
			name: p.name,
			wholesale_price: Number(p.wholesale_price) || 0,
			retail_price: p.retail_price ? Number(p.retail_price) || null : null,
			category: p.category || null,
			subcategory: p.subcategory || null,
			description: p.description || null,
			sizes: splitCsv(p.sizes),
			colors: splitCsv(p.colors),
			season_id: null, // resolved by the user post-import via Edit Product
			product_year: null,
			image_url: p.image_url || null
		};
	}

	async function handleImport() {
		// Client-side guard: every row needs the three required fields.
		const invalid = products.filter(
			(p) => !p.style_number.trim() || !p.name.trim() || !p.wholesale_price.toString().trim()
		);
		if (invalid.length > 0) {
			toast.error(
				`${invalid.length} product${invalid.length === 1 ? '' : 's'} missing required fields. Fill in style number, name, and wholesale price.`
			);
			return;
		}

		submitting = true;
		try {
			const res = await fetch('/api/products/import', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					brandId,
					onConflict,
					products: products.map(toDraft)
				})
			});
			if (!res.ok) {
				const body = (await res.json().catch(() => null)) as { error?: string } | null;
				toast.error(body?.error ?? 'Import failed.');
				return;
			}
			const result = (await res.json()) as ProductImportResult;
			const parts: string[] = [];
			if (result.inserted > 0) parts.push(`${result.inserted} added`);
			if (result.updated > 0) parts.push(`${result.updated} updated`);
			if (result.skipped > 0) parts.push(`${result.skipped} skipped`);
			toast.success(parts.length > 0 ? parts.join(' · ') : 'Nothing imported.');
			if (result.imageFailures.length > 0) {
				const previewList = result.imageFailures
					.slice(0, 3)
					.map((f) => f.style_number)
					.join(', ');
				const more =
					result.imageFailures.length > 3 ? ` (+${result.imageFailures.length - 3} more)` : '';
				toast.error(`${result.imageFailures.length} image link(s) failed: ${previewList}${more}`);
			}
			onCompleted(result);
		} catch (err) {
			console.error('[ProductImportPreview] import failed', err);
			toast.error('Import failed — check your connection and try again.');
		} finally {
			submitting = false;
		}
	}
</script>

<div class="space-y-5">
	<header class="space-y-1">
		<h2 class="text-lg font-semibold">
			Review {products.length} product{products.length === 1 ? '' : 's'}
		</h2>
		<p class="text-sm text-muted-foreground">
			Edit anything that looks off, then commit.
			{#if collisionCount > 0}
				{collisionCount} of these match existing style numbers — pick how to handle them below.
			{/if}
		</p>
	</header>

	{#if collisionCount > 0}
		<fieldset class="rounded-md border bg-muted/30 px-4 py-3">
			<legend class="px-2 text-sm font-medium">Existing style numbers</legend>
			<div class="flex gap-4 pt-1">
				<label class="flex items-center gap-2 text-sm">
					<input type="radio" bind:group={onConflict} value="skip" /> Skip duplicates
				</label>
				<label class="flex items-center gap-2 text-sm">
					<input type="radio" bind:group={onConflict} value="replace" /> Replace existing
				</label>
			</div>
		</fieldset>
	{/if}

	<div class="overflow-x-auto rounded-lg border">
		<table class="w-full text-sm">
			<thead class="border-b bg-muted/40">
				<tr>
					<th class="px-3 py-2 text-left font-medium">Style</th>
					<th class="px-3 py-2 text-left font-medium">Name</th>
					<th class="px-3 py-2 text-left font-medium">Wholesale</th>
					<th class="px-3 py-2 text-left font-medium">Retail</th>
					<th class="px-3 py-2 text-left font-medium">Category</th>
					<th class="px-3 py-2 text-left font-medium">Sizes</th>
					<th class="px-3 py-2 text-left font-medium">Colors</th>
					<th class="px-3 py-2 text-left font-medium">Image URL</th>
					<th class="px-3 py-2 text-right font-medium">&nbsp;</th>
				</tr>
			</thead>
			<tbody class="divide-y">
				{#each products as p, i (p._originalIndex)}
					<tr>
						<td class="px-3 py-2">
							<div class="space-y-1">
								<Input bind:value={p.style_number} class="w-28" />
								{#if p._existing}
									<Badge variant="outline" class="text-xs">Already exists</Badge>
								{/if}
							</div>
						</td>
						<td class="px-3 py-2"><Input bind:value={p.name} class="w-44" /></td>
						<td class="px-3 py-2"><Input bind:value={p.wholesale_price} class="w-24" /></td>
						<td class="px-3 py-2"><Input bind:value={p.retail_price} class="w-24" /></td>
						<td class="px-3 py-2">
							<div class="space-y-1">
								<Input bind:value={p.category} class="w-32" placeholder="Category" />
								<Input bind:value={p.subcategory} class="w-32" placeholder="Subcategory" />
							</div>
						</td>
						<td class="px-3 py-2">
							<Input bind:value={p.sizes} class="w-32" placeholder="S, M, L" />
						</td>
						<td class="px-3 py-2">
							<Input bind:value={p.colors} class="w-32" placeholder="Black, Navy" />
						</td>
						<td class="px-3 py-2">
							<Input bind:value={p.image_url} class="w-44" placeholder="https://…" />
						</td>
						<td class="px-3 py-2 text-right">
							<Button type="button" variant="outline" size="sm" onclick={() => removeRow(i)}>
								Remove
							</Button>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	{#if unmappedColumns.length > 0}
		<p class="text-sm text-muted-foreground">
			Skipped {unmappedColumns.length} unmapped column{unmappedColumns.length === 1 ? '' : 's'}:
			<span class="font-mono">{unmappedColumns.join(', ')}</span>
		</p>
	{/if}

	<div class="flex justify-between gap-2 pt-2">
		<Button type="button" variant="outline" onclick={onCancel} disabled={submitting}>Back</Button>
		<Button type="button" onclick={handleImport} disabled={submitting || products.length === 0}>
			{submitting
				? 'Importing…'
				: `Import ${products.length} product${products.length === 1 ? '' : 's'}`}
		</Button>
	</div>
</div>

{#if products.length === 0}
	<div class="py-10 text-center">
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
				d="M20 13V7a2 2 0 00-2-2H6a2 2 0 00-2 2v10a2 2 0 002 2h7m5-5l-3 3m0 0l-3-3m3 3V8"
			/>
		</svg>
		<p class="mt-4 text-lg font-semibold">No products to import</p>
		<p class="mt-2 text-sm text-muted-foreground">Removed every row. Go back to start over.</p>
	</div>
{/if}
