import type { PageServerLoad, Actions } from './$types';
import { loadOrderPrereqs } from '$lib/server/orders/load-order-prereqs.js';
import { submitOrder } from '$lib/server/orders/submit-order.js';

export const load: PageServerLoad = async ({ locals }) => loadOrderPrereqs(locals);

export const actions: Actions = {
	submit: async ({ request, locals }) => submitOrder(request, locals)
};
