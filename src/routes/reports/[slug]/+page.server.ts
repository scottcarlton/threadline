import type { PageServerLoad } from './$types';
import { loadReport } from '$lib/server/reports/load-report.js';

export const load: PageServerLoad = ({ locals, params, url }) =>
	loadReport(locals, params.slug, url);
