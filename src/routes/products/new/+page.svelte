<script lang="ts">
	import CreateProductForm from '$lib/components/products/CreateProductForm.svelte';

	let { data } = $props();
</script>

<CreateProductForm
	formData={data.form}
	brand={data.brand}
	seasons={data.seasons}
	cancelHref="/products"
	successHref={(productId) => `/products/${productId}`}
/>
