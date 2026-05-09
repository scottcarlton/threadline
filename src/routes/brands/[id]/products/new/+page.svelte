<script lang="ts">
	import { page } from '$app/stores';
	import CreateProductForm from '$lib/components/products/CreateProductForm.svelte';

	let { data } = $props();
	const brandId = $derived($page.params.id);
</script>

<CreateProductForm
	formData={data.form}
	brand={data.brand}
	seasons={data.seasons}
	cancelHref={`/brands/${brandId}/products`}
	successHref={(productId) => `/brands/${brandId}/products/${productId}`}
/>
