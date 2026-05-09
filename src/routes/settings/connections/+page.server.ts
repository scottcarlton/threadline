import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// /settings/connections is retired. Connections live on /brands (MBISR side)
// and /organization/partners (BOA side).
export const load: PageServerLoad = async () => {
	throw redirect(303, '/brands');
};
