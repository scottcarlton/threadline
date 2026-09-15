<script lang="ts">
	import type { AuditLogRow } from '$lib/server/audit/query.js';

	type Row = AuditLogRow & { description: string };

	type Props = {
		rows: Row[];
		/** Copy for the empty state, which differs per surface. */
		emptyTitle: string;
		emptySubtitle: string;
		/** Hide the org column when the whole page is already one org. */
		showOrganization?: boolean;
	};

	let { rows, emptyTitle, emptySubtitle, showOrganization = true }: Props = $props();

	const timeFormat = new Intl.DateTimeFormat('en-US', {
		month: 'short',
		day: 'numeric',
		hour: 'numeric',
		minute: '2-digit'
	});

	function formatTime(iso: string): string {
		return timeFormat.format(new Date(iso));
	}

	/** Group consecutive rows from one request so a multi-step action reads as one story. */
	const groups = $derived.by(() => {
		const out: { correlationId: string | null; rows: Row[] }[] = [];
		for (const row of rows) {
			const last = out[out.length - 1];
			if (last && row.correlation_id && last.correlationId === row.correlation_id) {
				last.rows.push(row);
			} else {
				out.push({ correlationId: row.correlation_id, rows: [row] });
			}
		}
		return out;
	});

	function hasDetail(row: Row): boolean {
		return Boolean(
			row.changes ||
			(row.metadata && Object.keys(row.metadata).length > 0) ||
			row.error_message ||
			row.route
		);
	}
</script>

{#if rows.length === 0}
	<div class="py-12 text-center">
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
				d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
			/>
		</svg>
		<p class="mt-4 text-lg font-semibold">{emptyTitle}</p>
		<p class="mt-2 text-sm text-muted-foreground">{emptySubtitle}</p>
	</div>
{:else}
	<ol class="divide-y divide-border">
		{#each groups as group (group.rows[0].id)}
			<li class="py-3">
				{#each group.rows as row, i (row.id)}
					<div class="flex items-baseline gap-3" class:mt-2={i > 0}>
						<time
							class="w-28 shrink-0 font-mono text-sm text-muted-foreground"
							datetime={row.created_at}
						>
							{i === 0 ? formatTime(row.created_at) : ''}
						</time>

						<div class="min-w-0 flex-1">
							<p class="text-sm">
								{row.description}
								{#if row.on_behalf_of}
									<span class="text-muted-foreground">(acting as another user)</span>
								{/if}
							</p>

							<p class="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
								{#if showOrganization && row.organization_name}
									<span>{row.organization_name}</span>
								{/if}
								{#if row.status === 'failure'}
									<span class="font-medium text-destructive">
										Failed{row.http_status ? ` (${row.http_status})` : ''}
									</span>
								{/if}
								{#if row.actor_kind === 'service'}
									<span>Automated: {row.actor_service}</span>
								{/if}
							</p>

							{#if hasDetail(row)}
								<details class="mt-1">
									<summary
										class="cursor-pointer text-sm text-muted-foreground underline decoration-transparent transition-colors hover:decoration-current"
									>
										Details
									</summary>
									<dl class="mt-2 space-y-1 rounded-md bg-muted/50 p-3 text-sm">
										{#if row.changes}
											{#each Object.entries(row.changes) as [field, diff] (field)}
												<div class="flex gap-2">
													<dt class="font-medium">{field}</dt>
													<dd class="text-muted-foreground">
														{JSON.stringify(diff.before)} → {JSON.stringify(diff.after)}
													</dd>
												</div>
											{/each}
										{/if}
										{#if row.error_message}
											<div class="flex gap-2">
												<dt class="font-medium">Error</dt>
												<dd class="text-destructive">{row.error_message}</dd>
											</div>
										{/if}
										{#if row.route}
											<div class="flex gap-2">
												<dt class="font-medium">Route</dt>
												<dd class="font-mono text-muted-foreground">
													{row.method}
													{row.route}
												</dd>
											</div>
										{/if}
										{#if row.metadata && Object.keys(row.metadata).length > 0}
											<div class="flex gap-2">
												<dt class="font-medium">Data</dt>
												<dd class="min-w-0 font-mono break-all text-muted-foreground">
													{JSON.stringify(row.metadata)}
												</dd>
											</div>
										{/if}
									</dl>
								</details>
							{/if}
						</div>
					</div>
				{/each}
			</li>
		{/each}
	</ol>
{/if}
