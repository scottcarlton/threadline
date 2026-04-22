<script lang="ts">
	import { invalidate } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import { Input } from '$lib/components/ui/input';

	type Props = {
		variantId: string;
		stockQty: number | null;
		/** When true, the variant is mirrored from Shopify. Editor renders read-only. */
		isShopifyManaged: boolean;
		/** Invalidate key after successful save. Defaults to reloading the current page. */
		invalidateKey?: string;
	};

	let { variantId, stockQty, isShopifyManaged, invalidateKey }: Props = $props();

	let qty = $state<string>('');
	$effect(() => {
		qty = stockQty?.toString() ?? '';
	});
	let saving = $state(false);

	async function save() {
		if (isShopifyManaged) return;
		const parsed = qty === '' ? null : Number(qty);
		if (parsed !== null && (!Number.isInteger(parsed) || parsed < 0)) {
			toast.error('Stock must be a non-negative whole number');
			return;
		}
		saving = true;
		try {
			const res = await fetch(`/api/products/variants/${variantId}/stock`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ stock_qty: parsed })
			});
			if (!res.ok) {
				const body = (await res.json().catch(() => ({}))) as { error?: string };
				throw new Error(body.error ?? 'Failed to save stock');
			}
			toast.success('Stock updated');
			if (invalidateKey) await invalidate(invalidateKey);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Failed to save stock');
		} finally {
			saving = false;
		}
	}
</script>

{#if isShopifyManaged}
	<span class="text-sm text-muted-foreground">Managed by Shopify</span>
{:else}
	<Input
		type="number"
		min="0"
		step="1"
		bind:value={qty}
		onblur={save}
		disabled={saving}
		class="w-24"
		aria-label="Stock quantity"
	/>
{/if}
