<script lang="ts">
	type Props = {
		open: boolean;
		ontoggle: () => void;
		entityType: string;
		columns: { key: string; label: string; required?: boolean }[];
		onimport: (rows: Record<string, string>[]) => Promise<{ success: number; errors: string[] }>;
		enableLinesheet?: boolean;
	};

	let { open, ontoggle, entityType, columns, onimport, enableLinesheet = false }: Props = $props();

	let mode = $state<'paste' | 'file' | 'linesheet'>(enableLinesheet ? 'linesheet' : 'paste');
	let pasteValue = $state('');
	let parsedRows = $state<Record<string, string>[]>([]);
	let parseError = $state('');
	let importing = $state(false);
	let result = $state<{ success: number; errors: string[] } | null>(null);
	let fileInput: HTMLInputElement | undefined = $state();

	// Linesheet state
	let linesheetFile = $state<File | null>(null);
	let linesheetInput: HTMLInputElement | undefined = $state();
	let parsing = $state(false);
	let parsingStatus = $state('');
	let parsingStatusIndex = $state(0);
	let parsingInterval: ReturnType<typeof setInterval> | undefined;

	const parsingMessages = [
		'Reading document...',
		'Scanning for products...',
		'Identifying style numbers...',
		'Extracting prices...',
		'Detecting categories...',
		'Parsing product details...',
		'Building product list...',
		'Almost there...'
	];

	function startParsingMessages() {
		parsingStatusIndex = 0;
		parsingStatus = parsingMessages[0];
		parsingInterval = setInterval(() => {
			parsingStatusIndex = Math.min(parsingStatusIndex + 1, parsingMessages.length - 1);
			parsingStatus = parsingMessages[parsingStatusIndex];
		}, 4000);
	}

	function stopParsingMessages() {
		if (parsingInterval) {
			clearInterval(parsingInterval);
			parsingInterval = undefined;
		}
	}

	function reset() {
		mode = enableLinesheet ? 'linesheet' : 'paste';
		pasteValue = '';
		parsedRows = [];
		parseError = '';
		importing = false;
		result = null;
		linesheetFile = null;
		parsing = false;
		stopParsingMessages();
	}

	$effect(() => {
		if (open) reset();
	});

	function parseCSV(text: string): Record<string, string>[] {
		const lines = text.trim().split('\n').map((l) => l.trim()).filter((l) => l);
		if (lines.length < 2) return [];

		const headerLine = lines[0];
		const headers = parseCSVLine(headerLine).map((h) => h.trim().toLowerCase());

		const rows: Record<string, string>[] = [];
		for (let i = 1; i < lines.length; i++) {
			const values = parseCSVLine(lines[i]);
			const row: Record<string, string> = {};
			for (let j = 0; j < headers.length; j++) {
				row[headers[j]] = values[j]?.trim() ?? '';
			}
			rows.push(row);
		}
		return rows;
	}

	function parseCSVLine(line: string): string[] {
		const result: string[] = [];
		let current = '';
		let inQuotes = false;

		for (let i = 0; i < line.length; i++) {
			const ch = line[i];
			if (ch === '"') {
				if (inQuotes && line[i + 1] === '"') {
					current += '"';
					i++;
				} else {
					inQuotes = !inQuotes;
				}
			} else if (ch === ',' && !inQuotes) {
				result.push(current);
				current = '';
			} else {
				current += ch;
			}
		}
		result.push(current);
		return result;
	}

	function matchColumns(rawRows: Record<string, string>[]): Record<string, string>[] {
		return rawRows.map((raw) => {
			const mapped: Record<string, string> = {};
			for (const col of columns) {
				const key = col.key.toLowerCase();
				const label = col.label.toLowerCase();
				// Try exact key match, then label match, then partial match
				const value = raw[key] ?? raw[label] ??
					Object.entries(raw).find(([k]) => k.includes(key) || k.includes(label))?.[1] ?? '';
				mapped[col.key] = value;
			}
			return mapped;
		});
	}

	function handleParse() {
		parseError = '';
		const raw = parseCSV(pasteValue);
		if (raw.length === 0) {
			parseError = 'No data found. Make sure to include a header row.';
			return;
		}
		parsedRows = matchColumns(raw);
	}

	function handleFile() {
		const files = fileInput?.files;
		if (!files || files.length === 0) return;

		const reader = new FileReader();
		reader.onload = (e) => {
			pasteValue = (e.target?.result as string) ?? '';
			handleParse();
		};
		reader.readAsText(files[0]);
		if (fileInput) fileInput.value = '';
	}

	function handleLinesheetSelect() {
		const files = linesheetInput?.files;
		if (!files || files.length === 0) return;
		const file = files[0];
		if (file.size > 20 * 1024 * 1024) {
			parseError = 'File is too large. Maximum size is 20MB.';
			linesheetFile = null;
			return;
		}
		parseError = '';
		linesheetFile = file;
		if (linesheetInput) linesheetInput.value = '';
	}

	async function handleLinesheetParse() {
		if (!linesheetFile) return;
		parsing = true;
		parseError = '';
		startParsingMessages();
		try {
			const formData = new FormData();
			formData.append('file', linesheetFile);
			const res = await fetch('/api/products/parse-linesheet', { method: 'POST', body: formData });
			const data = await res.json();
			if (!res.ok) {
				parseError = data.error || 'Failed to parse linesheet.';
				return;
			}
			if (!data.products || data.products.length === 0) {
				parseError = 'No products found in this file. Try a clearer image or use CSV import.';
				return;
			}
			// Flatten any array fields (e.g. sizes, colors) to comma-separated strings for preview
			const flattened = data.products.map((p: Record<string, unknown>) => {
				const row: Record<string, string> = {};
				for (const [k, v] of Object.entries(p)) {
					row[k] = Array.isArray(v) ? v.join(', ') : String(v ?? '');
				}
				return row;
			});
			parsedRows = matchColumns(flattened);
		} catch {
			parseError = 'Failed to connect to the server. Please try again.';
		} finally {
			stopParsingMessages();
			parsing = false;
		}
	}

	async function handleImport() {
		if (parsedRows.length === 0) return;
		importing = true;
		result = await onimport(parsedRows);
		importing = false;
	}

	const requiredColumns = $derived(columns.filter((c) => c.required));
	const sampleHeader = $derived(columns.map((c) => c.label).join(', '));
</script>

{#if open}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" onclick={ontoggle}></div>

	<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="animate-in w-full max-w-2xl max-h-[85vh] overflow-hidden rounded-2xl bg-card shadow-2xl"
			onclick={(e) => e.stopPropagation()}
		>
			<!-- Header -->
			<div class="flex items-center justify-between px-6 py-5">
				<div>
					<h2 class="text-lg font-semibold">Import {entityType.charAt(0).toUpperCase() + entityType.slice(1) + 's'}</h2>
					<p class="mt-0.5 text-sm text-muted-foreground">{enableLinesheet ? 'Import from CSV, file upload, or AI-parsed linesheet' : 'Upload a CSV file or paste data directly'}</p>
				</div>
				<button
					class="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
					onclick={ontoggle}
					aria-label="Close"
				>
					<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<div class="overflow-y-auto px-6 pb-6 max-h-[calc(85vh-80px)]">
				{#if result}
					<!-- Result -->
					<div class="space-y-4">
						<div class="rounded-none border p-5 text-center">
							<p class="text-3xl font-semibold">{result.success}</p>
							<p class="mt-1 text-sm text-muted-foreground">{entityType + 's'} imported</p>
						</div>
						{#if result.errors.length > 0}
							<div class="rounded-none border border-destructive/30 bg-destructive/5 p-4">
								<p class="text-sm font-medium text-destructive">{result.errors.length} errors</p>
								<ul class="mt-2 space-y-1 text-sm text-muted-foreground">
									{#each result.errors.slice(0, 5) as err}
										<li>{err}</li>
									{/each}
									{#if result.errors.length > 5}
										<li>...and {result.errors.length - 5} more</li>
									{/if}
								</ul>
							</div>
						{/if}
						<button
							class="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
							onclick={ontoggle}
						>
							Done
						</button>
					</div>
				{:else if parsedRows.length > 0}
					<!-- Preview -->
					<div class="space-y-4">
						<div class="flex items-center justify-between">
							<p class="text-sm font-medium">{parsedRows.length} rows found</p>
							<button
								class="text-sm text-muted-foreground hover:text-foreground"
								onclick={() => { parsedRows = []; pasteValue = ''; }}
							>
								← Back
							</button>
						</div>

						<div class="overflow-x-auto rounded-none border">
							<table class="w-full">
								<thead>
									<tr class="border-b bg-muted/40">
										{#each columns as col}
											<th class="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
												{col.label}{col.required ? ' *' : ''}
											</th>
										{/each}
									</tr>
								</thead>
								<tbody class="divide-y">
									{#each parsedRows.slice(0, 10) as row}
										<tr>
											{#each columns as col}
												<td class="px-3 py-2 text-sm">{row[col.key] || '—'}</td>
											{/each}
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
						{#if parsedRows.length > 10}
							<p class="text-sm text-muted-foreground text-center">Showing first 10 of {parsedRows.length} rows</p>
						{/if}

						<button
							class="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
							disabled={importing}
							onclick={handleImport}
						>
							{importing ? 'Importing...' : `Import ${parsedRows.length} ${entityType + 's'}`}
						</button>
					</div>
				{:else}
					<!-- Input -->
					<div class="space-y-4">
						<!-- Mode toggle -->
						<div class="flex gap-1 rounded-lg bg-muted p-1 w-fit">
							{#if enableLinesheet}
								<button
									class="rounded-md px-4 py-1.5 text-sm font-medium transition-colors {mode === 'linesheet' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}"
									onclick={() => (mode = 'linesheet')}
								>Linesheet (AI)</button>
							{/if}
							<button
								class="rounded-md px-4 py-1.5 text-sm font-medium transition-colors {mode === 'paste' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}"
								onclick={() => (mode = 'paste')}
							>Paste CSV</button>
							<button
								class="rounded-md px-4 py-1.5 text-sm font-medium transition-colors {mode === 'file' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}"
								onclick={() => (mode = 'file')}
							>Upload File</button>
						</div>

						{#if mode === 'linesheet'}
							<!-- Linesheet AI parsing -->
							<div class="rounded-none border bg-muted/20 p-4">
								<p class="text-xs font-medium text-muted-foreground">Upload a linesheet</p>
								<p class="mt-1 text-sm">Upload a PDF or image of a linesheet and AI will extract the product data automatically.</p>
							</div>

							{#if linesheetFile && !parsing}
								<div class="flex items-center gap-3 rounded-none border p-4">
									<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
									<div class="flex-1 min-w-0">
										<p class="text-sm font-medium truncate">{linesheetFile.name}</p>
										<p class="text-xs text-muted-foreground">{(linesheetFile.size / 1024 / 1024).toFixed(1)} MB</p>
									</div>
									<button
										class="text-sm text-muted-foreground hover:text-foreground"
										onclick={() => (linesheetFile = null)}
									>Remove</button>
								</div>
								<button
									class="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
									onclick={handleLinesheetParse}
								>
									Parse with AI
								</button>
							{:else if parsing}
								<div class="flex flex-col items-center gap-6 rounded-none border border-dashed p-12">
									<div class="relative h-20 w-20">
										<div class="blob-1 absolute inset-0 rounded-[40%_60%_70%_30%/40%_50%_60%_50%] bg-primary/20"></div>
										<div class="blob-2 absolute inset-1 rounded-[60%_40%_30%_70%/60%_30%_70%_40%] bg-primary/15"></div>
										<div class="blob-3 absolute inset-2 rounded-[40%_60%_60%_40%/70%_30%_40%_60%] bg-primary/25"></div>
									</div>
									<div class="text-center">
										{#key parsingStatus}
											<p class="text-sm font-medium animate-fade-in">{parsingStatus}</p>
										{/key}
									</div>
								</div>
							{:else}
								<!-- svelte-ignore a11y_click_events_have_key_events -->
								<!-- svelte-ignore a11y_no_static_element_interactions -->
								<div
									class="flex cursor-pointer flex-col items-center gap-3 rounded-none border-2 border-dashed border-muted-foreground/20 p-8 transition-colors hover:border-primary/40 hover:bg-muted/30"
									onclick={() => linesheetInput?.click()}
									ondragover={(e) => { e.preventDefault(); (e.currentTarget as HTMLElement).classList.add('border-primary', 'bg-primary/5'); }}
									ondragleave={(e) => { (e.currentTarget as HTMLElement).classList.remove('border-primary', 'bg-primary/5'); }}
									ondrop={(e) => {
										e.preventDefault();
										(e.currentTarget as HTMLElement).classList.remove('border-primary', 'bg-primary/5');
										const file = e.dataTransfer?.files?.[0];
										if (file && (file.type === 'application/pdf' || file.type.startsWith('image/'))) {
											if (file.size > 20 * 1024 * 1024) { parseError = 'File is too large. Maximum size is 20MB.'; return; }
											parseError = '';
											linesheetFile = file;
										} else {
											parseError = 'Please drop a PDF or image file.';
										}
									}}
								>
									<svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" /></svg>
									<p class="text-sm font-medium">Drag & drop a linesheet here</p>
									<p class="text-sm text-muted-foreground">PDF or image — or click to browse</p>
									<input
										type="file"
										accept=".pdf,.jpg,.jpeg,.png,.webp"
										bind:this={linesheetInput}
										onchange={handleLinesheetSelect}
										class="hidden"
									/>
								</div>
							{/if}

							{#if parseError}
								<p class="text-sm text-destructive">{parseError}</p>
							{/if}
						{:else}
						<div class="rounded-none border bg-muted/20 p-4">
							<p class="text-xs font-medium text-muted-foreground">Expected columns</p>
							<p class="mt-1 text-sm">{sampleHeader}</p>
							{#if requiredColumns.length > 0}
								<p class="mt-1 text-xs text-muted-foreground">* Required: {requiredColumns.map((c) => c.label).join(', ')}</p>
							{/if}
						</div>

						{#if mode === 'paste'}
							<textarea
								bind:value={pasteValue}
								placeholder="Paste your CSV data here, including the header row..."
								rows="10"
								class="w-full resize-none rounded-none border bg-background px-4 py-3 text-sm font-mono placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-ring/20"
							></textarea>
							<button
								class="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
								disabled={!pasteValue.trim()}
								onclick={handleParse}
							>
								Preview Data
							</button>
						{:else}
							<div class="flex flex-col items-center gap-3 rounded-none border border-dashed p-8">
								<svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
									<path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
								</svg>
								<p class="text-sm text-muted-foreground">Choose a CSV file</p>
								<input
									type="file"
									accept=".csv,.txt"
									bind:this={fileInput}
									onchange={handleFile}
									class="hidden"
								/>
								<button
									class="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
									onclick={() => fileInput?.click()}
								>
									Select File
								</button>
							</div>
						{/if}

						{#if parseError}
							<p class="text-sm text-destructive">{parseError}</p>
						{/if}
					{/if}
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}

<svelte:window onkeydown={(e) => { if (e.key === 'Escape' && open) ontoggle(); }} />

<style>
	@keyframes blob-morph-1 {
		0%, 100% { border-radius: 40% 60% 70% 30% / 40% 50% 60% 50%; transform: rotate(0deg) scale(1); }
		25% { border-radius: 70% 30% 50% 50% / 30% 60% 40% 70%; transform: rotate(90deg) scale(1.05); }
		50% { border-radius: 50% 50% 30% 70% / 60% 40% 70% 30%; transform: rotate(180deg) scale(0.95); }
		75% { border-radius: 30% 70% 60% 40% / 50% 70% 30% 60%; transform: rotate(270deg) scale(1.05); }
	}
	@keyframes blob-morph-2 {
		0%, 100% { border-radius: 60% 40% 30% 70% / 60% 30% 70% 40%; transform: rotate(0deg) scale(1); }
		25% { border-radius: 40% 60% 50% 50% / 70% 40% 60% 30%; transform: rotate(-60deg) scale(1.08); }
		50% { border-radius: 70% 30% 60% 40% / 40% 60% 30% 70%; transform: rotate(-120deg) scale(0.92); }
		75% { border-radius: 50% 50% 40% 60% / 30% 70% 50% 50%; transform: rotate(-180deg) scale(1.06); }
	}
	@keyframes blob-morph-3 {
		0%, 100% { border-radius: 40% 60% 60% 40% / 70% 30% 40% 60%; transform: rotate(0deg) scale(1); }
		33% { border-radius: 60% 40% 40% 60% / 40% 60% 60% 40%; transform: rotate(120deg) scale(1.1); }
		66% { border-radius: 50% 50% 50% 50% / 50% 50% 50% 50%; transform: rotate(240deg) scale(0.9); }
	}
	.blob-1 { animation: blob-morph-1 2s ease-in-out infinite; }
	.blob-2 { animation: blob-morph-2 2.5s ease-in-out infinite; }
	.blob-3 { animation: blob-morph-3 3s ease-in-out infinite; }
</style>
