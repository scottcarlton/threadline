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
		downloadCsvTemplate,
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
			fill="currentColor"
			viewBox="0 0 24 24"
		>
			<path
				d="M18.364 5.63604L16.9497 7.05025C15.683 5.7835 13.933 5 12 5C8.13401 5 5 8.13401 5 12C5 15.866 8.13401 19 12 19C15.866 19 19 15.866 19 12H21C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C14.4853 3 16.7353 4.00736 18.364 5.63604Z"
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
			<div class="inline-flex rounded-lg bg-muted p-1.5">
				<button
					type="button"
					class="rounded-md px-8 py-2.5 text-sm font-medium transition-colors {activeTab ===
					'upload'
						? 'bg-background text-foreground shadow-sm'
						: 'text-muted-foreground hover:text-foreground'}"
					onclick={() => {
						activeTab = 'upload';
						errorMessage = '';
					}}
				>
					Upload File
				</button>
				<button
					type="button"
					class="rounded-md px-8 py-2.5 text-sm font-medium transition-colors {activeTab === 'paste'
						? 'bg-background text-foreground shadow-sm'
						: 'text-muted-foreground hover:text-foreground'}"
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
						fill="currentColor"
						class="h-7 w-7 text-destructive"
					>
						<path
							d="M15 4H5V20H19V8H15V4ZM3 2.9918C3 2.44405 3.44749 2 3.9985 2H16L20.9997 7L21 20.9925C21 21.5489 20.5551 22 20.0066 22H3.9934C3.44476 22 3 21.5447 3 21.0082V2.9918ZM11 15H13V17H11V15ZM11 7H13V13H11V7Z"
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
						fill="currentColor"
						class="h-7 w-7 text-foreground"
					>
						<path
							d="M3 19H21V21H3V19ZM13 5.82843V17H11V5.82843L4.92893 11.8995L3.51472 10.4853L12 2L20.4853 10.4853L19.0711 11.8995L13 5.82843Z"
						/>
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
				onclick={() => downloadCsvTemplate()}
				class="inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 24 24"
					fill="currentColor"
					class="h-4 w-4"
				>
					<path
						d="M3 19H21V21H3V19ZM13 13.1716L19.0711 7.1005L20.4853 8.51472L12 17L3.51472 8.51472L4.92893 7.1005L11 13.1716V2H13V13.1716Z"
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
					fill="currentColor"
					class="h-4 w-4"
				>
					<path
						d="M10 6V8H5V19H16V14H18V20C18 20.5523 17.5523 21 17 21H4C3.44772 21 3 20.5523 3 20V7C3 6.44772 3.44772 6 4 6H10ZM21 3V11H19L18.9999 6.413L11.2071 14.2071L9.79289 12.7929L17.5849 5H13V3H21Z"
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
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 24 24"
					fill="currentColor"
					class="h-5 w-5 text-emerald-500"
				>
					<path
						d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22ZM17.4571 9.45711L11 15.9142L6.79289 11.7071L8.20711 10.2929L11 13.0858L16.0429 8.04289L17.4571 9.45711Z"
					/>
				</svg>
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
