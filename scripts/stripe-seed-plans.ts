/**
 * Creates or updates the Stripe catalog for platform billing:
 *
 *   - one Product per plan in src/lib/billing/plans.ts, with a monthly Price
 *     whose lookup_key is `${plan}_monthly` (what /api/billing/checkout uses)
 *   - one Customer Portal configuration per track (rep, brand), tagged with
 *     metadata.threadline_track (what /api/billing/portal uses)
 *
 * Re-running is safe. A plan whose price amount changed gets a new Price, and
 * the lookup_key moves to it; existing subscribers stay on the old Price until
 * they change plan.
 *
 * Required env: STRIPE_SECRET_KEY (sandbox key while developing).
 *
 * Usage:
 *   bun run scripts/stripe-seed-plans.ts
 */
import Stripe from 'stripe';
import {
	PLAN_KEYS,
	PLANS,
	monthlyLookupKey,
	type PlanKey,
	type PlanTrack
} from '../src/lib/billing/plans.ts';
import { PORTAL_TRACK_METADATA_KEY } from '../src/lib/server/billing/portal.ts';

const key = process.env.STRIPE_SECRET_KEY;
if (!key) throw new Error('STRIPE_SECRET_KEY is not set');
const stripe = new Stripe(key);

async function ensurePlanPrice(plan: PlanKey): Promise<{ product: string; price: string }> {
	const spec = PLANS[plan];
	const lookupKey = monthlyLookupKey(plan);
	const unitAmount = spec.monthlyPrice * 100;

	const existing = (await stripe.prices.list({ lookup_keys: [lookupKey], limit: 1 })).data[0];
	if (existing && existing.unit_amount === unitAmount && existing.active) {
		const product = typeof existing.product === 'string' ? existing.product : existing.product.id;
		console.log(`${plan}: up to date (${existing.id})`);
		return { product, price: existing.id };
	}

	const productId = existing
		? typeof existing.product === 'string'
			? existing.product
			: existing.product.id
		: (
				await stripe.products.create({
					name: `Threadline ${spec.name}`,
					metadata: { threadline_plan: plan, threadline_track: spec.track }
				})
			).id;

	const price = await stripe.prices.create({
		product: productId,
		currency: 'usd',
		unit_amount: unitAmount,
		recurring: { interval: 'month' },
		lookup_key: lookupKey,
		transfer_lookup_key: !!existing,
		metadata: { threadline_plan: plan }
	});
	console.log(`${plan}: ${existing ? 'new price' : 'created'} (${price.id})`);
	return { product: productId, price: price.id };
}

async function ensurePortalConfiguration(
	track: PlanTrack,
	products: Array<{ product: string; price: string }>
): Promise<void> {
	const features: Stripe.BillingPortal.ConfigurationCreateParams.Features = {
		invoice_history: { enabled: true },
		payment_method_update: { enabled: true },
		customer_update: { enabled: true, allowed_updates: ['email', 'address', 'tax_id'] },
		subscription_cancel: { enabled: true, mode: 'at_period_end' },
		subscription_update: {
			enabled: true,
			default_allowed_updates: ['price'],
			proration_behavior: 'create_prorations',
			products: products.map((p) => ({ product: p.product, prices: [p.price] }))
		}
	};

	const configurations = await stripe.billingPortal.configurations.list({ limit: 100 });
	const existing = configurations.data.find(
		(c) => c.metadata?.[PORTAL_TRACK_METADATA_KEY] === track
	);
	if (existing) {
		await stripe.billingPortal.configurations.update(existing.id, { active: true, features });
		console.log(`portal ${track}: updated (${existing.id})`);
	} else {
		const created = await stripe.billingPortal.configurations.create({
			name: `Threadline ${track} plans`,
			features,
			metadata: { [PORTAL_TRACK_METADATA_KEY]: track }
		});
		console.log(`portal ${track}: created (${created.id})`);
	}
}

const byTrack: Record<PlanTrack, Array<{ product: string; price: string }>> = {
	rep: [],
	brand: []
};
for (const plan of PLAN_KEYS) {
	byTrack[PLANS[plan].track].push(await ensurePlanPrice(plan));
}
await ensurePortalConfiguration('rep', byTrack.rep);
await ensurePortalConfiguration('brand', byTrack.brand);
