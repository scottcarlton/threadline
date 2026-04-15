<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { Card, CardContent } from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import type { IntegrationConnection, IntegrationSyncLog } from '$lib/types/database.js';
	import type { ExportDataType } from '$lib/server/integrations/google-sheets.js';

	let { data } = $props();
	const connection = $derived(data.connection as IntegrationConnection);
	const syncLogs = $derived(data.syncLogs as IntegrationSyncLog[]);
	const provider = $derived(data.provider as string);

	let exporting = $state(false);
	let exportResult = $state<{ url: string; rows: number } | null>(null);
	let exportError = $state('');
	let selectedDataType = $state<ExportDataType>('orders');
	let sendingTest = $state(false);
	let testResult = $state<'success' | 'error' | null>(null);

	// Notion state
	let notionDatabases = $state<{ id: string; title: string }[]>([]);
	let loadingDatabases = $state(false);
	let selectedNotionDb = $state('');
	let notionSyncType = $state<'orders' | 'accounts' | 'brands'>('orders');
	let syncing = $state(false);
	let syncResult = $state<{ created: number; updated: number } | null>(null);
	let syncError = $state('');

	// Microsoft state
	let msExporting = $state(false);
	let msExportResult = $state<{ url: string; rows: number } | null>(null);
	let msExportError = $state('');
	let msDataType = $state<ExportDataType>('orders');

	const providerNames: Record<string, string> = {
		google_sheets: 'Google Sheets',
		slack: 'Slack',
		notion: 'Notion',
		microsoft: 'Microsoft 365'
	};

	const dataTypes: { value: ExportDataType; label: string }[] = [
		{ value: 'orders', label: 'Orders' },
		{ value: 'accounts', label: 'Accounts' },
		{ value: 'brands', label: 'Brands' }
	];

	async function exportData() {
		exporting = true;
		exportResult = null;
		exportError = '';

		try {
			const res = await fetch('/api/integrations/google-sheets/export', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ dataType: selectedDataType })
			});

			const body = await res.json();

			if (!res.ok) {
				exportError = body.error ?? 'Export failed';
				return;
			}

			exportResult = { url: body.spreadsheetUrl, rows: body.rowCount };
			await invalidateAll();
		} catch {
			exportError = 'Export failed. Please try again.';
		} finally {
			exporting = false;
		}
	}

	async function loadNotionDatabases() {
		loadingDatabases = true;
		try {
			const res = await fetch('/api/integrations/notion/databases');
			const body = await res.json();
			notionDatabases = body.databases ?? [];
			if (notionDatabases.length > 0 && !selectedNotionDb) {
				selectedNotionDb = notionDatabases[0].id;
			}
		} finally {
			loadingDatabases = false;
		}
	}

	async function syncToNotion() {
		syncing = true;
		syncResult = null;
		syncError = '';
		try {
			const res = await fetch('/api/integrations/notion/sync', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ dataType: notionSyncType, databaseId: selectedNotionDb })
			});
			const body = await res.json();
			if (!res.ok) {
				syncError = body.error ?? 'Sync failed';
				return;
			}
			syncResult = { created: body.created, updated: body.updated };
			await invalidateAll();
		} catch {
			syncError = 'Sync failed. Please try again.';
		} finally {
			syncing = false;
		}
	}

	async function exportToExcel() {
		msExporting = true;
		msExportResult = null;
		msExportError = '';
		try {
			const res = await fetch('/api/integrations/microsoft/export', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ dataType: msDataType })
			});
			const body = await res.json();
			if (!res.ok) {
				msExportError = body.error ?? 'Export failed';
				return;
			}
			msExportResult = { url: body.webUrl, rows: body.rowCount };
			await invalidateAll();
		} catch {
			msExportError = 'Export failed. Please try again.';
		} finally {
			msExporting = false;
		}
	}

	// Auto-load databases when on Notion page
	$effect(() => {
		if (provider === 'notion' && connection?.status === 'active') {
			loadNotionDatabases();
		}
	});

	async function sendTestMessage() {
		sendingTest = true;
		testResult = null;
		try {
			const res = await fetch('/api/integrations/slack/test', { method: 'POST' });
			testResult = res.ok ? 'success' : 'error';
		} catch {
			testResult = 'error';
		} finally {
			sendingTest = false;
		}
	}

	function formatDate(dateStr: string): string {
		return new Date(dateStr).toLocaleString();
	}

	function formatAction(action: string): string {
		return action
			.replace('export_', 'Export ')
			.replace('_', ' ')
			.replace(/\b\w/g, (c) => c.toUpperCase());
	}
</script>

<div class="space-y-6">
	<div class="flex items-center gap-3">
		<a
			href="/organization/integrations"
			class="text-sm text-muted-foreground hover:text-foreground"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="inline h-4 w-4"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="2"
			>
				<path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
			</svg>
			Integrations
		</a>
		<span class="text-muted-foreground">/</span>
		<span class="text-sm font-medium">{providerNames[provider] ?? provider}</span>
	</div>

	<!-- Connection info -->
	<Card>
		<CardContent class="pt-5 pb-5">
			<div class="flex items-center justify-between">
				<div>
					<div class="flex items-center gap-2">
						<h2 class="text-base font-medium">{providerNames[provider]}</h2>
						<Badge variant="success">Connected</Badge>
					</div>
					{#if connection.external_account_name}
						<p class="mt-1 font-mono text-sm text-muted-foreground">
							{connection.external_account_name}
						</p>
					{/if}
					<p class="mt-1 text-xs text-muted-foreground">
						Connected {formatDate(connection.created_at)}
					</p>
				</div>
			</div>
		</CardContent>
	</Card>

	<!-- Google Sheets export -->
	{#if provider === 'google_sheets'}
		<Card>
			<CardContent class="pt-5 pb-5">
				<h3 class="text-sm font-medium">Export Data</h3>
				<p class="mt-1 text-sm text-muted-foreground">
					Export your data to a new Google Spreadsheet
				</p>

				<div class="mt-4 flex items-end gap-3">
					<div>
						<label for="data-type" class="mb-1 block text-sm font-medium">Data type</label>
						<select
							id="data-type"
							bind:value={selectedDataType}
							class="rounded-md border bg-background px-3 py-2 text-sm"
						>
							{#each dataTypes as dt (dt.value)}
								<option value={dt.value}>{dt.label}</option>
							{/each}
						</select>
					</div>

					<Button onclick={exportData} disabled={exporting} size="sm">
						{#if exporting}
							<svg
								class="mr-2 h-3.5 w-3.5 animate-spin"
								xmlns="http://www.w3.org/2000/svg"
								fill="none"
								viewBox="0 0 24 24"
							>
								<circle
									class="opacity-25"
									cx="12"
									cy="12"
									r="10"
									stroke="currentColor"
									stroke-width="4"
								/>
								<path
									class="opacity-75"
									fill="currentColor"
									d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
								/>
							</svg>
							Exporting...
						{:else}
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="mr-1.5 h-3.5 w-3.5"
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
							Export to Sheets
						{/if}
					</Button>
				</div>

				{#if exportResult}
					<div
						class="mt-4 flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-4 w-4 text-green-600"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							stroke-width="2"
						>
							<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
						</svg>
						<p class="text-sm text-green-800">
							Exported {exportResult.rows} rows.
							<a
								href={exportResult.url}
								target="_blank"
								rel="noopener"
								class="font-medium underline">Open spreadsheet</a
							>
						</p>
					</div>
				{/if}

				{#if exportError}
					<div
						class="mt-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3"
					>
						<p class="text-sm text-red-800">{exportError}</p>
					</div>
				{/if}
			</CardContent>
		</Card>
	{/if}

	<!-- Microsoft 365 config -->
	{#if provider === 'microsoft'}
		{@const config = connection.config as Record<string, unknown>}

		<!-- Services overview -->
		<Card>
			<CardContent class="pt-5 pb-5">
				<h3 class="text-sm font-medium">Connected Services</h3>
				<p class="mt-1 text-sm text-muted-foreground">
					Your Microsoft 365 connection enables these features
				</p>
				<div class="mt-4 grid gap-3 sm:grid-cols-3">
					<div class="rounded-lg border p-3">
						<div class="flex items-center gap-2">
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
									d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"
								/>
							</svg>
							<span class="text-sm font-medium">Outlook</span>
						</div>
						<p class="mt-1 text-xs text-muted-foreground">Read and send email</p>
					</div>
					<div class="rounded-lg border p-3">
						<div class="flex items-center gap-2">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-4 w-4 text-purple-600"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								stroke-width="1.5"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155"
								/>
							</svg>
							<span class="text-sm font-medium">Teams</span>
						</div>
						<p class="mt-1 text-xs text-muted-foreground">Channel notifications</p>
					</div>
					<div class="rounded-lg border p-3">
						<div class="flex items-center gap-2">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-4 w-4 text-green-600"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								stroke-width="1.5"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0112 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M12 10.875v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125M13.125 12h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125M20.625 12c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5M12 14.625v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 14.625c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125m0 0v1.5c0 .621-.504 1.125-1.125 1.125"
								/>
							</svg>
							<span class="text-sm font-medium">Excel</span>
						</div>
						<p class="mt-1 text-xs text-muted-foreground">Export to OneDrive</p>
					</div>
				</div>
			</CardContent>
		</Card>

		<!-- Excel export -->
		<Card>
			<CardContent class="pt-5 pb-5">
				<h3 class="text-sm font-medium">Export to Excel</h3>
				<p class="mt-1 text-sm text-muted-foreground">Create an Excel file in your OneDrive</p>

				<div class="mt-4 flex items-end gap-3">
					<div>
						<label for="ms-data-type" class="mb-1 block text-sm font-medium">Data type</label>
						<select
							id="ms-data-type"
							bind:value={msDataType}
							class="rounded-md border bg-background px-3 py-2 text-sm"
						>
							{#each dataTypes as dt (dt.value)}
								<option value={dt.value}>{dt.label}</option>
							{/each}
						</select>
					</div>

					<Button onclick={exportToExcel} disabled={msExporting} size="sm">
						{#if msExporting}
							<svg
								class="mr-2 h-3.5 w-3.5 animate-spin"
								xmlns="http://www.w3.org/2000/svg"
								fill="none"
								viewBox="0 0 24 24"
							>
								<circle
									class="opacity-25"
									cx="12"
									cy="12"
									r="10"
									stroke="currentColor"
									stroke-width="4"
								/>
								<path
									class="opacity-75"
									fill="currentColor"
									d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
								/>
							</svg>
							Exporting...
						{:else}
							Export to Excel
						{/if}
					</Button>
				</div>

				{#if msExportResult}
					<div
						class="mt-4 flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-4 w-4 text-green-600"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							stroke-width="2"
						>
							<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
						</svg>
						<p class="text-sm text-green-800">
							Exported {msExportResult.rows} rows.
							<a
								href={msExportResult.url}
								target="_blank"
								rel="noopener"
								class="font-medium underline">Open in OneDrive</a
							>
						</p>
					</div>
				{/if}

				{#if msExportError}
					<div
						class="mt-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3"
					>
						<p class="text-sm text-red-800">{msExportError}</p>
					</div>
				{/if}
			</CardContent>
		</Card>
	{/if}

	<!-- Notion config -->
	{#if provider === 'notion'}
		<Card>
			<CardContent class="pt-5 pb-5">
				<h3 class="text-sm font-medium">Push Data to Notion</h3>
				<p class="mt-1 text-sm text-muted-foreground">
					Sync your Threadline data into a Notion database. Pages shared with the Threadline
					integration will appear below.
				</p>

				{#if loadingDatabases}
					<p class="mt-4 text-sm text-muted-foreground">Loading databases...</p>
				{:else if notionDatabases.length === 0}
					<div class="mt-4 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3">
						<p class="text-sm text-yellow-800">
							No databases found. Make sure you've shared at least one Notion database with the
							Threadline integration.
						</p>
					</div>
				{:else}
					<div class="mt-4 flex items-end gap-3">
						<div>
							<label for="notion-sync-type" class="mb-1 block text-sm font-medium">Data type</label>
							<select
								id="notion-sync-type"
								bind:value={notionSyncType}
								class="rounded-md border bg-background px-3 py-2 text-sm"
							>
								<option value="orders">Orders</option>
								<option value="accounts">Accounts</option>
								<option value="brands">Brands</option>
							</select>
						</div>

						<div>
							<label for="notion-db" class="mb-1 block text-sm font-medium">Target database</label>
							<select
								id="notion-db"
								bind:value={selectedNotionDb}
								class="rounded-md border bg-background px-3 py-2 text-sm"
							>
								{#each notionDatabases as db (db.id)}
									<option value={db.id}>{db.title}</option>
								{/each}
							</select>
						</div>

						<Button onclick={syncToNotion} disabled={syncing || !selectedNotionDb} size="sm">
							{#if syncing}
								<svg
									class="mr-2 h-3.5 w-3.5 animate-spin"
									xmlns="http://www.w3.org/2000/svg"
									fill="none"
									viewBox="0 0 24 24"
								>
									<circle
										class="opacity-25"
										cx="12"
										cy="12"
										r="10"
										stroke="currentColor"
										stroke-width="4"
									/>
									<path
										class="opacity-75"
										fill="currentColor"
										d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
									/>
								</svg>
								Syncing...
							{:else}
								Sync to Notion
							{/if}
						</Button>
					</div>

					{#if syncResult}
						<div
							class="mt-4 flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3"
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-4 w-4 text-green-600"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								stroke-width="2"
							>
								<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
							</svg>
							<p class="text-sm text-green-800">
								Synced: {syncResult.created} created, {syncResult.updated} updated
							</p>
						</div>
					{/if}

					{#if syncError}
						<div
							class="mt-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3"
						>
							<p class="text-sm text-red-800">{syncError}</p>
						</div>
					{/if}
				{/if}
			</CardContent>
		</Card>
	{/if}

	<!-- Slack config -->
	{#if provider === 'slack'}
		{@const config = connection.config as Record<string, unknown>}
		<Card>
			<CardContent class="pt-5 pb-5">
				<h3 class="text-sm font-medium">Channel</h3>
				<p class="mt-1 text-sm text-muted-foreground">
					Notifications are sent to <span class="font-mono font-medium">#{config.channel_name}</span
					>
					in <span class="font-medium">{config.team_name}</span>
				</p>

				<div class="mt-4">
					<h3 class="text-sm font-medium">Notifications</h3>
					<p class="mt-1 text-sm text-muted-foreground">Events that trigger a Slack message</p>
					<div class="mt-3 space-y-2">
						{#each [{ key: 'order_submitted', label: 'Order submitted' }, { key: 'order_confirmed', label: 'Order confirmed' }, { key: 'order_shipped', label: 'Order shipped' }, { key: 'order_cancelled', label: 'Order cancelled' }, { key: 'new_account', label: 'New account created' }] as event (event.key)}
							{@const notifyOn = (config.notify_on ?? []) as string[]}
							<label class="flex items-center gap-2.5">
								<input
									type="checkbox"
									checked={notifyOn.includes(event.key)}
									disabled
									class="h-4 w-4 rounded border-input"
								/>
								<span class="text-sm">{event.label}</span>
							</label>
						{/each}
					</div>
				</div>

				<div class="mt-5">
					<Button onclick={sendTestMessage} disabled={sendingTest} variant="outline" size="sm">
						{sendingTest ? 'Sending...' : 'Send Test Message'}
					</Button>

					{#if testResult === 'success'}
						<span class="ml-3 text-sm text-green-600">Sent! Check your Slack channel.</span>
					{:else if testResult === 'error'}
						<span class="ml-3 text-sm text-red-600">Failed to send. Check your webhook.</span>
					{/if}
				</div>
			</CardContent>
		</Card>
	{/if}

	<!-- Sync history -->
	{#if syncLogs.length > 0}
		<Card>
			<CardContent class="pt-5 pb-5">
				<h3 class="text-sm font-medium">Sync History</h3>
				<div class="mt-3 divide-y">
					{#each syncLogs as log (log.id)}
						<div class="flex items-center justify-between py-3 first:pt-0 last:pb-0">
							<div>
								<p class="text-sm font-medium">{formatAction(log.action)}</p>
								{#if log.details && typeof log.details === 'object'}
									{@const details = log.details as Record<string, unknown>}
									{#if details.row_count}
										<p class="text-xs text-muted-foreground">{details.row_count} rows</p>
									{/if}
								{/if}
							</div>
							<div class="flex items-center gap-3">
								{#if log.status === 'success'}
									<Badge variant="success">Success</Badge>
								{:else if log.status === 'error'}
									<Badge variant="destructive">Error</Badge>
								{:else}
									<Badge variant="secondary">Pending</Badge>
								{/if}
								<span class="text-xs text-muted-foreground">{formatDate(log.created_at)}</span>
								{#if log.details && typeof log.details === 'object'}
									{@const details = log.details as Record<string, unknown>}
									{#if details.spreadsheet_url}
										<a
											href={details.spreadsheet_url as string}
											target="_blank"
											rel="noopener"
											class="text-xs font-medium text-primary hover:underline"
										>
											Open
										</a>
									{/if}
								{/if}
							</div>
						</div>
					{/each}
				</div>
			</CardContent>
		</Card>
	{/if}
</div>
