import type { LayoutServerLoad } from './$types';
import { supabaseAdmin } from '$lib/server/supabase.js';
import type { CartItem } from '$lib/stores/cart.js';

export const load: LayoutServerLoad = async ({ locals, depends }) => {
	// Root layout load only reads from `locals` — without a dependency, SvelteKit
	// reuses its cached output across client-side navigations and the navbar ends
	// up stuck on whatever user/org state was set when this first ran (notably
	// null on public routes like /connect/[code]). Invalidate via `app:auth`.
	depends('app:auth');
	depends('data:cart');

	let agents: { id: string; name: string; slug: string; description: string | null }[] = [];

	if (locals.organization && locals.session) {
		const { data } = await locals.supabase
			.from('org_agents')
			.select('id, name, slug, description')
			.eq('organization_id', locals.organization.id)
			.eq('is_active', true)
			.order('name');
		agents = data ?? [];
	}

	let cartItems: CartItem[] = [];
	if (locals.isBuyer && locals.user) {
		type ProductRow = {
			id: string;
			name: string;
			style_number: string;
			wholesale_price: number | null;
			brand_id: string;
			brands: { id: string; name: string } | { id: string; name: string }[] | null;
			product_variants: { color: string | null; size: string | null }[] | null;
			product_images: { id: string; is_primary: boolean }[] | null;
		};
		type CartRow = {
			added_at: string;
			products: ProductRow | ProductRow[] | null;
		};

		const { data } = await supabaseAdmin
			.from('cart_items')
			.select(
				'added_at, products(id, name, style_number, wholesale_price, brand_id, brands(id, name), product_variants(color, size), product_images(id, is_primary))'
			)
			.eq('profile_id', locals.user.id)
			.order('added_at', { ascending: true });

		cartItems = ((data ?? []) as unknown as CartRow[])
			.map((row): CartItem | null => {
				const p = Array.isArray(row.products) ? row.products[0] : row.products;
				if (!p) return null;
				const brand = Array.isArray(p.brands) ? p.brands[0] : p.brands;
				const colors = Array.from(
					new Set((p.product_variants ?? []).map((v) => v.color).filter((v): v is string => !!v))
				);
				const sizes = Array.from(
					new Set((p.product_variants ?? []).map((v) => v.size).filter((v): v is string => !!v))
				);
				const primaryImage =
					(p.product_images ?? []).find((img) => img.is_primary) ?? (p.product_images ?? [])[0];

				return {
					productId: p.id,
					brandId: p.brand_id,
					productName: p.name,
					styleNumber: p.style_number,
					brandName: brand?.name ?? 'Unknown',
					price: p.wholesale_price ?? 0,
					imageUrl: primaryImage ? `/api/products/${p.id}/images/${primaryImage.id}` : null,
					colors,
					sizes,
					addedAt: row.added_at
				};
			})
			.filter((row): row is CartItem => row !== null);
	}

	return {
		session: locals.session,
		user: locals.user,
		membership: locals.membership,
		organization: locals.organization,
		orgType: locals.orgType,
		allMemberships: locals.allMemberships,
		brandScope: locals.brandScope,
		scopedBrandNames: locals.scopedBrandNames,
		isBuyer: locals.isBuyer,
		buyerAccounts: locals.buyerAccounts,
		buyerBrandIds: locals.buyerBrandIds,
		agents,
		cartItems
	};
};
