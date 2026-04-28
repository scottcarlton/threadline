<script lang="ts">
	import { fade } from 'svelte/transition';
	import { Button } from '$lib/components/ui/button/index.js';
	import { SelectField } from '$lib/components/ui/select/index.js';
	import { parseCSV as parseProductCSV } from '$lib/utils/csv-parse.js';
	import {
		SCANNING_MIN_MS,
		PARSING_MIN_MS,
		PREPARING_MIN_MS,
		TOTAL_LOADING_MIN_MS,
		buildPreviewFromCsv,
		detectHintFromCsvRows,
		detectHintFromText,
		ensureMinElapsed,
		formatPreviewPrice,
		matchSeasonId,
		mergeHints,
		normalizeImageUrl,
		preloadPreviewImages,
		yearOptions,
		type ImportHint,
		type Season
	} from './product-import-helpers.js';

	// Shared product-import flow: tabs (Upload | Paste CSV) → loading
	// stages → preview list → Continue. Owns all parsing + preview state;
	// the parent only supplies a way to resolve the destination brand_id
	// and a callback for "import landed successfully — what next?".
	type Props = {
		// String when the parent already knows the brand id (e.g. /products
		// modal opened from a single-brand context). Function when the
		// resolution is async / lazy (e.g. onboarding looking up the
		// auto-created self-brand the first time the user clicks Continue).
		brand: string | (() => Promise<string | null>);
		// Org seasons (already loaded by the parent's load fn). Every
		// brand-org has at least the seeded set (Spring/Summer/Fall/Resort/
		// Holiday) — empty array is treated as "no detection / no apply".
		seasons?: Season[];
		// Commit-button copy. Onboarding uses "Continue" (wizard advance);
		// the products modal uses "Save Items" (one-shot action).
		commitLabel?: string;
		commitPendingLabel?: string;
		onComplete: () => void;
	};

	let {
		brand,
		seasons = [],
		commitLabel = 'Continue',
		commitPendingLabel = 'Importing…',
		onComplete
	}: Props = $props();

	// ─── State ──────────────────────────────────────────────────────
	type ChooseView = 'choose' | 'preview';
	let view = $state<ChooseView>('choose');
	let activeTab = $state<'upload' | 'paste'>('upload');
	let parsingStage = $state<'scanning' | 'parsing' | 'preparing' | null>(null);
	let errorMessage = $state('');
	let pasteValue = $state('');
	let previewRows = $state<Record<string, unknown>[]>([]);
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	let previewUnmapped = $state<string[]>([]);
	let committing = $state(false);

	// Cascade detection results. `detectedHint` holds whatever the
	// filename/content/AI cascade produced (read-only after detection).
	// `chosenSeasonId` / `chosenYear` are user-bindable — initialized from
	// the cascade and editable via the dropdowns when confidence is low.
	let detectedHint = $state<ImportHint>({ seasonName: null, year: null });
	let chosenSeasonId = $state<string | null>(null);
	let chosenYear = $state<number | null>(null);

	const matchedSeason = $derived(seasons.find((s) => s.id === chosenSeasonId) ?? null);
	const isHighConfidence = $derived(
		!!matchedSeason && !!detectedHint.year && chosenYear === detectedHint.year
	);

	const seasonItems = $derived(seasons.map((s) => ({ value: s.id, label: s.name })));
	const yearItems = $derived(yearOptions().map((y) => ({ value: String(y), label: String(y) })));

	const loadingCopy = $derived(
		parsingStage === 'scanning'
			? { title: 'Scanning your data...', subtitle: 'Extracting rows and checking formatting' }
			: parsingStage === 'parsing'
				? { title: 'Parsing your data...', subtitle: 'Identifying assets and verifying data' }
				: parsingStage === 'preparing'
					? { title: 'Preparing preview...', subtitle: 'Generating summary for review' }
					: { title: '', subtitle: '' }
	);

	// ─── Brand resolution ──────────────────────────────────────────
	// Cache after first resolution so retry-on-Continue doesn't refetch.
	// Reading `brand` once at init is intentional — if a string is passed
	// we treat it as fixed; if a resolver is passed we call it lazily.
	// svelte-ignore state_referenced_locally
	let resolvedBrandId = $state<string | null>(typeof brand === 'string' ? brand : null);
	async function resolveBrandId(): Promise<string | null> {
		if (resolvedBrandId) return resolvedBrandId;
		if (typeof brand === 'string') {
			resolvedBrandId = brand;
			return brand;
		}
		const id = await brand();
		if (id) resolvedBrandId = id;
		return id;
	}

	// ─── Handlers ──────────────────────────────────────────────────
	async function handleFile(file: File) {
		errorMessage = '';
		const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
		const isCsv = file.type === 'text/csv' || file.name.toLowerCase().endsWith('.csv');
		if (!isPdf && !isCsv) {
			errorMessage = 'Unsupported file. Drop a PDF or CSV.';
			return;
		}

		parsingStage = 'scanning';
		const scanStart = Date.now();
		try {
			if (isPdf) {
				const form = new FormData();
				form.append('file', file);
				await ensureMinElapsed(scanStart, SCANNING_MIN_MS);

				parsingStage = 'parsing';
				const parseStart = Date.now();
				const res = await fetch('/api/products/parse-linesheet', {
					method: 'POST',
					body: form
				});
				const body = await res.json();
				if (!res.ok) {
					errorMessage = body.error ?? 'Parse failed';
					return;
				}
				const products = (body.products ?? []) as Record<string, unknown>[];
				if (products.length === 0) {
					errorMessage = 'No products detected. Try a clearer linesheet.';
					return;
				}
				await ensureMinElapsed(parseStart, PARSING_MIN_MS);

				parsingStage = 'preparing';
				const prepStart = Date.now();
				previewRows = products;
				previewUnmapped = [];
				// Cascade for PDF: filename → AI response.
				const fromFilename = detectHintFromText(file.name);
				const fromAi = {
					seasonName: typeof body.season === 'string' ? body.season : null,
					year: typeof body.year === 'number' ? body.year : null
				};
				resolveDetection(mergeHints(fromFilename, fromAi));
				await Promise.all([
					preloadPreviewImages(products),
					ensureMinElapsed(prepStart, PREPARING_MIN_MS),
					ensureMinElapsed(scanStart, TOTAL_LOADING_MIN_MS)
				]);
				view = 'preview';
				return;
			}

			// CSV
			const text = await file.text();
			const { headers, rows } = parseProductCSV(text);
			if (rows.length === 0) {
				errorMessage = 'No rows found. Make sure your CSV has a header row.';
				return;
			}
			await ensureMinElapsed(scanStart, SCANNING_MIN_MS);

			parsingStage = 'preparing';
			const prepStart = Date.now();
			const built = buildPreviewFromCsv(headers, rows);
			previewRows = built.previewRows;
			previewUnmapped = built.previewUnmapped;
			// Cascade for CSV file: filename → mapped columns → raw text.
			resolveDetection(
				mergeHints(
					detectHintFromText(file.name),
					detectHintFromCsvRows(built.previewRows),
					detectHintFromText(text)
				)
			);
			await Promise.all([
				preloadPreviewImages(previewRows),
				ensureMinElapsed(prepStart, PREPARING_MIN_MS),
				ensureMinElapsed(scanStart, TOTAL_LOADING_MIN_MS)
			]);
			view = 'preview';
		} catch (e) {
			errorMessage = (e as Error).message;
		} finally {
			parsingStage = null;
		}
	}

	async function handlePaste() {
		errorMessage = '';
		if (!pasteValue.trim()) {
			errorMessage = 'Paste some CSV data first.';
			return;
		}
		parsingStage = 'scanning';
		const scanStart = Date.now();
		try {
			const { headers, rows } = parseProductCSV(pasteValue);
			if (rows.length === 0) {
				errorMessage = 'No rows found. Make sure your CSV has a header row.';
				return;
			}
			await ensureMinElapsed(scanStart, SCANNING_MIN_MS);

			parsingStage = 'preparing';
			const prepStart = Date.now();
			const built = buildPreviewFromCsv(headers, rows);
			previewRows = built.previewRows;
			previewUnmapped = built.previewUnmapped;
			// Cascade for paste: mapped columns → raw text. No filename.
			resolveDetection(
				mergeHints(detectHintFromCsvRows(built.previewRows), detectHintFromText(pasteValue))
			);
			await Promise.all([
				preloadPreviewImages(previewRows),
				ensureMinElapsed(prepStart, PREPARING_MIN_MS),
				ensureMinElapsed(scanStart, TOTAL_LOADING_MIN_MS)
			]);
			view = 'preview';
		} catch (e) {
			errorMessage = (e as Error).message;
		} finally {
			parsingStage = null;
		}
	}

	function resolveDetection(hint: ImportHint) {
		detectedHint = hint;
		chosenSeasonId = matchSeasonId(hint.seasonName, seasons);
		chosenYear = hint.year ?? new Date().getFullYear();
	}

	async function commitImport() {
		if (previewRows.length === 0) return;
		errorMessage = '';
		committing = true;
		try {
			const brandId = await resolveBrandId();
			if (!brandId) {
				if (!errorMessage) errorMessage = 'Brand not ready yet. Refresh and try again.';
				return;
			}
			// Batch-apply chosen season + year to any row missing its own.
			// Per-row values from CSV columns win over the batch. Also
			// normalize image URLs so the server's fetch+upload step gets
			// raw image bytes (Dropbox sharing URLs default to an HTML
			// preview page that returns no image).
			const rowsToPost = previewRows.map((row) => ({
				...row,
				image_url: normalizeImageUrl(row.image_url) ?? row.image_url ?? null,
				season_id: row.season_id ?? chosenSeasonId,
				product_year: row.product_year ?? chosenYear
			}));
			const res = await fetch('/api/products/import', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					brandId,
					onConflict: 'skip',
					products: rowsToPost
				})
			});
			const body = await res.json();
			if (!res.ok) {
				errorMessage = body.error ?? 'Import failed';
				return;
			}
			onComplete();
		} catch (e) {
			errorMessage = (e as Error).message;
		} finally {
			committing = false;
		}
	}
</script>

{#if parsingStage}
	<div class="flex min-h-[19rem] items-center justify-center gap-4">
		<svg
			xmlns="http://www.w3.org/2000/svg"
			class="h-7 w-7 animate-spin text-muted-foreground"
			fill="none"
			viewBox="0 0 24 24"
		>
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				stroke="currentColor"
				stroke-width="2"
				d="M21 12a9 9 0 11-6.219-8.56"
			/>
		</svg>
		<div class="grid text-left">
			{#key parsingStage}
				<div
					class="col-start-1 row-start-1"
					in:fade={{ duration: 350, delay: 200 }}
					out:fade={{ duration: 200 }}
				>
					<p class="text-base font-semibold">{loadingCopy.title}</p>
					<p class="text-sm text-muted-foreground">{loadingCopy.subtitle}</p>
				</div>
			{/key}
		</div>
	</div>
{:else if view === 'choose'}
	<div class="space-y-3">
		<!-- Tabs -->
		<div class="flex justify-center">
			<div class="inline-flex rounded-md bg-muted p-1">
				<button
					type="button"
					class="rounded-sm px-10 py-2 text-sm font-medium transition-colors {activeTab === 'upload'
						? 'bg-foreground text-background'
						: 'text-foreground'}"
					onclick={() => {
						activeTab = 'upload';
						errorMessage = '';
					}}
				>
					Upload
				</button>
				<button
					type="button"
					class="rounded-sm px-10 py-2 text-sm font-medium transition-colors {activeTab === 'paste'
						? 'bg-foreground text-background'
						: 'text-foreground'}"
					onclick={() => {
						activeTab = 'paste';
						errorMessage = '';
					}}
				>
					Paste CSV
				</button>
			</div>
		</div>

		{#if activeTab === 'upload'}
			<input
				id="product-import-file-input"
				type="file"
				accept=".pdf,.csv,application/pdf,text/csv"
				class="hidden"
				onchange={(e) => {
					const target = e.target as HTMLInputElement;
					const f = target.files?.[0];
					if (f) handleFile(f);
					target.value = '';
				}}
			/>
			{#if errorMessage}
				<!-- Drop zone (error) -->
				<label
					for="product-import-file-input"
					aria-label="Upload error"
					class="flex h-56 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-destructive px-6 text-center"
					ondragenter={(e) => e.preventDefault()}
					ondragover={(e) => {
						e.preventDefault();
						if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
					}}
					ondrop={(e) => {
						e.preventDefault();
						const f = e.dataTransfer?.files?.[0];
						if (f) handleFile(f);
					}}
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="1.5"
						class="h-7 w-7 text-destructive"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
						/>
					</svg>
					<p class="mt-2 text-sm text-destructive">{errorMessage}</p>
					<p class="text-sm text-muted-foreground">
						Drop a file or
						<span class="text-foreground underline underline-offset-2">select</span>
						to try again. PDF or CSV up to 20MB.
					</p>
				</label>
			{:else}
				<!-- Drop zone -->
				<label
					for="product-import-file-input"
					aria-label="Upload products file"
					class="flex h-56 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border px-6 text-center"
					ondragenter={(e) => e.preventDefault()}
					ondragover={(e) => {
						e.preventDefault();
						if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
					}}
					ondrop={(e) => {
						e.preventDefault();
						const f = e.dataTransfer?.files?.[0];
						if (f) handleFile(f);
					}}
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="1.5"
						class="h-7 w-7 text-foreground"
					>
						<path stroke-linecap="round" stroke-linejoin="round" d="M12 19V5m-7 7l7-7 7 7" />
					</svg>
					<p class="mt-2 text-base font-semibold">Upload a File</p>
					<p class="text-sm text-muted-foreground">
						Drag and Drop or
						<span class="text-foreground underline underline-offset-2">Select File</span>
					</p>
					<p class="text-sm text-muted-foreground">Support PDF or CSV up to 20MB</p>
				</label>
			{/if}
		{:else if errorMessage}
			<!-- Paste CSV (error) -->
			<div class="flex h-56 flex-col items-center justify-center gap-3 text-center">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="1.5"
					stroke-linecap="round"
					stroke-linejoin="round"
					class="h-7 w-7 text-destructive"
				>
					<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
					<path d="M14 2v6h6" />
					<path d="M12 11v3" />
					<circle cx="12" cy="17.25" r="0.6" fill="currentColor" stroke="none" />
				</svg>
				<p class="text-sm text-destructive">{errorMessage}</p>
				<Button
					variant="outline"
					onclick={() => {
						errorMessage = '';
						pasteValue = '';
					}}
				>
					Try Again
				</Button>
			</div>
		{:else}
			<!-- Paste CSV -->
			<textarea
				bind:value={pasteValue}
				onpaste={() => {
					setTimeout(() => {
						if (pasteValue.trim()) handlePaste();
					}, 0);
				}}
				placeholder="Paste your CSV text here."
				class="h-56 w-full resize-none rounded-md border border-border bg-background p-4 text-sm placeholder:text-muted-foreground"
			></textarea>
		{/if}

		<!-- Footer links -->
		<div class="flex items-center justify-between text-sm text-muted-foreground">
			<button
				type="button"
				class="inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="1.5"
					class="h-4 w-4"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
					/>
				</svg>
				Download CSV Template
			</button>
			<button
				type="button"
				class="inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="1.5"
					class="h-4 w-4"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
					/>
				</svg>
				Learn about imports
			</button>
		</div>
	</div>
{:else}
	<!-- Preview -->
	<div class="space-y-3">
		<div class="flex items-center justify-between">
			<div class="inline-flex items-center gap-2 text-sm">
				<span class="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="3"
						class="h-3 w-3 text-white"
					>
						<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
					</svg>
				</span>
				{#if isHighConfidence && matchedSeason && chosenYear}
					{matchedSeason.name} {chosenYear} imported
				{:else}
					Import successful
				{/if}
			</div>
			<p class="text-sm text-muted-foreground">
				Showing {Math.min(previewRows.length, 10)} of {previewRows.length} items
			</p>
		</div>

		{#if !isHighConfidence && seasons.length > 0}
			<div class="grid grid-cols-2 gap-2">
				<SelectField
					value={chosenSeasonId ?? ''}
					items={seasonItems}
					placeholder="Season"
					onValueChange={(v) => (chosenSeasonId = v || null)}
				/>
				<SelectField
					value={chosenYear != null ? String(chosenYear) : ''}
					items={yearItems}
					placeholder="Year"
					onValueChange={(v) => (chosenYear = v ? Number(v) : null)}
				/>
			</div>
		{/if}

		<ul class="h-[16.5rem] space-y-2 overflow-y-auto pr-1">
			{#each previewRows.slice(0, 10) as row, i (i)}
				{@const imgSrc = normalizeImageUrl(row.image_url)}
				<li class="flex items-center gap-4 rounded-md border p-3">
					<div class="h-12 w-12 shrink-0 overflow-hidden rounded bg-muted">
						{#if imgSrc}
							<img
								src={imgSrc}
								alt=""
								class="h-full w-full object-cover"
								onerror={(e) => {
									(e.currentTarget as HTMLImageElement).style.display = 'none';
								}}
							/>
						{/if}
					</div>
					<div class="min-w-0 flex-1 truncate text-sm">
						<span class="font-medium">{(row.name as string) || 'Untitled'}</span>
						{#if row.style_number}
							<span class="text-muted-foreground"> · {row.style_number as string}</span>
						{/if}
					</div>
					<p class="shrink-0 text-sm text-muted-foreground">
						{formatPreviewPrice(row.wholesale_price)}
					</p>
				</li>
			{/each}
		</ul>

		<Button size="lg" class="h-12 w-full text-base" disabled={committing} onclick={commitImport}>
			{committing ? commitPendingLabel : commitLabel}
		</Button>

		{#if errorMessage}
			<p class="text-sm text-destructive">{errorMessage}</p>
		{/if}
	</div>
{/if}
