<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import { SelectField } from '$lib/components/ui/select/index.js';
	import {
		suggestColumnMapping,
		PRODUCT_FIELD_LABELS,
		REQUIRED_PRODUCT_FIELDS,
		type ProductFieldKey
	} from '$lib/utils/csv-column-suggest.js';

	type Props = {
		uploadedHeaders: string[]; // preserved-case headers from parseCSV
		rawRows: Record<string, string>[]; // each row keyed by LOWERCASED header
		onConfirm: (mapped: Record<string, unknown>[], unmappedColumns: string[]) => void;
		onCancel: () => void;
	};

	let { uploadedHeaders, rawRows, onConfirm, onCancel }: Props = $props();

	// Mapping state — one entry per uploaded header. Default each to the
	// fuzzy suggestion (or null = "Skip"). User overrides via the dropdown.
	// svelte-ignore state_referenced_locally
	let mappings = $state<Record<string, ProductFieldKey | null>>(
		Object.fromEntries(uploadedHeaders.map((h) => [h, suggestColumnMapping(h)]))
	);

	// Sample values: first 3 non-empty entries per header. Computed once
	// from rawRows so rendering doesn't re-walk on every keystroke.
	const sampleValues = $derived.by(() => {
		const result: Record<string, string[]> = {};
		for (const header of uploadedHeaders) {
			const key = header.toLowerCase();
			const samples: string[] = [];
			for (const row of rawRows) {
				const v = row[key];
				if (v && v.trim()) {
					samples.push(v.trim());
					if (samples.length >= 3) break;
				}
			}
			result[header] = samples;
		}
		return result;
	});

	// Set of currently-mapped product fields (for the dropdown's disabled
	// state — once a field is taken by another column, it's not available
	// elsewhere). Each field can only be claimed once.
	const claimedFields = $derived(
		new Set(
			Object.entries(mappings)
				.filter(([, v]) => v !== null)
				.map(([, v]) => v as ProductFieldKey)
		)
	);

	// Items for each header's dropdown. The currently-selected field for
	// THIS header is always included; other fields are filtered if
	// already claimed elsewhere. "Skip" is always available.
	function itemsFor(header: string) {
		const current = mappings[header];
		const items: { value: string; label: string }[] = [{ value: '__skip__', label: 'Skip' }];
		const allFields = Object.keys(PRODUCT_FIELD_LABELS) as ProductFieldKey[];
		for (const f of allFields) {
			if (f === current || !claimedFields.has(f)) {
				items.push({ value: f, label: PRODUCT_FIELD_LABELS[f] });
			}
		}
		return items;
	}

	function valueFor(header: string): string {
		return mappings[header] ?? '__skip__';
	}

	function setMapping(header: string, value: string) {
		mappings = {
			...mappings,
			[header]: value === '__skip__' ? null : (value as ProductFieldKey)
		};
	}

	const missingRequired = $derived(REQUIRED_PRODUCT_FIELDS.filter((f) => !claimedFields.has(f)));

	const canContinue = $derived(missingRequired.length === 0);

	function buildMapped(): {
		mapped: Record<string, unknown>[];
		unmapped: string[];
	} {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- non-reactive transient computation
		const headerByField = new Map<ProductFieldKey, string>();
		for (const [header, field] of Object.entries(mappings)) {
			if (field) headerByField.set(field, header);
		}

		// Walk the original headers — anything not mapped to a product
		// field becomes an unmapped column we surface in the preview footer.
		const unmapped = uploadedHeaders.filter((h) => mappings[h] === null);

		const mapped = rawRows.map((row) => {
			const out: Record<string, unknown> = {};
			for (const [field, header] of headerByField) {
				const key = header.toLowerCase();
				out[field] = row[key] ?? '';
			}
			return out;
		});

		return { mapped, unmapped };
	}

	function handleContinue() {
		if (!canContinue) return;
		const { mapped, unmapped } = buildMapped();
		onConfirm(mapped, unmapped);
	}
</script>

<div class="space-y-5">
	<header class="space-y-1">
		<h2 class="text-lg font-semibold">Match your columns</h2>
		<p class="text-sm text-muted-foreground">
			We've guessed where each of your columns belongs. Adjust any that look off, then continue.
		</p>
	</header>

	<div class="overflow-hidden rounded-lg border">
		<table class="w-full text-sm">
			<thead class="border-b bg-muted/40">
				<tr>
					<th class="px-4 py-2.5 text-left font-medium">Your column</th>
					<th class="px-4 py-2.5 text-left font-medium">Sample values</th>
					<th class="px-4 py-2.5 text-left font-medium">Map to</th>
				</tr>
			</thead>
			<tbody class="divide-y">
				{#each uploadedHeaders as header (header)}
					<tr>
						<td class="px-4 py-3 align-top">
							<span class="font-mono text-sm">{header}</span>
						</td>
						<td class="px-4 py-3 align-top">
							{#if sampleValues[header].length > 0}
								<div class="space-y-0.5">
									{#each sampleValues[header] as v (v)}
										<p class="truncate text-sm text-muted-foreground">{v}</p>
									{/each}
								</div>
							{:else}
								<span class="text-sm text-muted-foreground/50">No sample data</span>
							{/if}
						</td>
						<td class="px-4 py-3 align-top">
							<SelectField
								value={valueFor(header)}
								items={itemsFor(header)}
								onValueChange={(v) => setMapping(header, v)}
								class="w-56"
							/>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	{#if missingRequired.length > 0}
		<div class="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm">
			<p class="font-medium text-destructive">Map these required fields to continue:</p>
			<ul class="mt-1 list-disc pl-5 text-destructive">
				{#each missingRequired as field (field)}
					<li>{PRODUCT_FIELD_LABELS[field]}</li>
				{/each}
			</ul>
		</div>
	{/if}

	<div class="flex justify-end gap-2 pt-2">
		<Button type="button" variant="outline" onclick={onCancel}>Back</Button>
		<Button type="button" onclick={handleContinue} disabled={!canContinue}>Continue</Button>
	</div>
</div>
