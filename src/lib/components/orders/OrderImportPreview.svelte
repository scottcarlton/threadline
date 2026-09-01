<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import { formatOrderPrice } from './order-import-helpers.js';
	import { groupOrderRows } from './group-order-rows.js';

	type Props = {
		rows: Record<string, unknown>[];
		onRowsChange: (rows: Record<string, unknown>[]) => void;
	};

	let { rows, onRowsChange }: Props = $props();

	let groups = $derived(
		groupOrderRows(
			rows.map((r) => ({
				account: String(r.account ?? ''),
				style_number: String(r.style_number ?? ''),
				qty: Number(r.qty) || 0,
				unit_price: r.unit_price != null && r.unit_price !== '' ? Number(r.unit_price) : null,
				color: r.color ? String(r.color) : null,
				size: r.size ? String(r.size) : null,
				expected_ship_date: r.expected_ship_date ? String(r.expected_ship_date) : null,
				notes: r.notes ? String(r.notes) : null
			}))
		)
	);

	let totalLines = $derived(groups.reduce((sum, g) => sum + g.lines.length, 0));

	function removeRow(groupIdx: number, lineIdx: number) {
		const group = groups[groupIdx];
		const line = group.lines[lineIdx];
		let found = false;
		const updated = rows.filter((r) => {
			if (found) return true;
			if (
				String(r.account ?? '').toLowerCase() === group.account.toLowerCase() &&
				String(r.style_number ?? '') === line.style_number &&
				String(r.qty ?? '') === String(line.qty) &&
				String(r.color ?? '') === String(line.color ?? '') &&
				String(r.size ?? '') === String(line.size ?? '')
			) {
				found = true;
				return false;
			}
			return true;
		});
		onRowsChange(updated);
	}

	function removeGroup(groupIdx: number) {
		const group = groups[groupIdx];
		const key = group.account.toLowerCase();
		const updated = rows.filter((r) => String(r.account ?? '').toLowerCase() !== key);
		onRowsChange(updated);
	}
</script>

<div class="space-y-3">
	<div class="flex items-center justify-between">
		<p class="text-sm text-muted-foreground">
			{groups.length} order{groups.length !== 1 ? 's' : ''} · {totalLines} line item{totalLines !==
			1
				? 's'
				: ''}
		</p>
	</div>

	<ul class="max-h-[20rem] space-y-2 overflow-y-auto pr-1">
		{#each groups as group, gi (group.account)}
			<li class="rounded-md border">
				<div class="flex items-center justify-between px-3 py-2">
					<p class="text-sm font-medium">
						{group.account}
						<span class="ml-1 text-muted-foreground">
							({group.lines.length} line{group.lines.length !== 1 ? 's' : ''})
						</span>
					</p>
					<button
						type="button"
						class="text-muted-foreground hover:text-destructive"
						onclick={() => removeGroup(gi)}
						aria-label="Remove {group.account}"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							viewBox="0 0 24 24"
							fill="currentColor"
							class="h-4 w-4"
						>
							<path
								d="M12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22ZM12 10.5858L9.17157 7.75736L7.75736 9.17157L10.5858 12L7.75736 14.8284L9.17157 16.2426L12 13.4142L14.8284 16.2426L16.2426 14.8284L13.4142 12L16.2426 9.17157L14.8284 7.75736L12 10.5858Z"
							/>
						</svg>
					</button>
				</div>
				<ul class="border-t">
					{#each group.lines as line, li (li)}
						<li
							class="flex items-center gap-3 px-3 py-1.5 text-sm {li > 0
								? 'border-t border-dashed'
								: ''}"
						>
							<span class="min-w-0 flex-1 truncate">
								<span class="font-medium">{line.style_number}</span>
								<span class="text-muted-foreground">
									× {line.qty}
									{#if line.size || line.color}
										· {[line.size, line.color].filter(Boolean).join(' / ')}
									{/if}
								</span>
							</span>
							<span class="shrink-0 text-muted-foreground">
								{formatOrderPrice(line.unit_price)}
							</span>
							<button
								type="button"
								class="shrink-0 text-muted-foreground hover:text-destructive"
								onclick={() => removeRow(gi, li)}
								aria-label="Remove line"
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									viewBox="0 0 24 24"
									fill="currentColor"
									class="h-3.5 w-3.5"
								>
									<path
										d="M11.9997 10.5865L16.9495 5.63672L18.3637 7.05093L13.4139 12.0007L18.3637 16.9504L16.9495 18.3646L11.9997 13.4149L7.04996 18.3646L5.63574 16.9504L10.5855 12.0007L5.63574 7.05093L7.04996 5.63672L11.9997 10.5865Z"
									/>
								</svg>
							</button>
						</li>
					{/each}
				</ul>
			</li>
		{/each}
	</ul>
</div>
