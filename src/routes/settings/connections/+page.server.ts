import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// /settings/connections is retired. Connections live on /brands (MBISR) and /reps (BOA).
export const load: PageServerLoad = async () => {
	throw redirect(303, '/brands');
};
