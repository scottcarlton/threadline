import { supabaseAdmin } from '$lib/server/supabase.js';
import type { ParsedOrder, ParsedOrderItem } from './parser.js';

// ── Confidence thresholds (tunable) ──────────────────────────

export const THRESHOLDS = {
	ACCOUNT_MIN: 0.6,
	ACCOUNT_AMBIGUITY_DELTA: 0.05,
	PRODUCT_MIN: 0.7,
	PRODUCT_AMBIGUITY_DELTA: 0.05,
	BRAND_MIN: 0.7
} as const;

// ── Types ────────────────────────────────────────────────────

export type OrgCandidate = {
	organizationId: string;
	userId: string;
};

export type ResolvedLine = {
	lineIndex: number;
	rawText: string;
	matchedProductId: string | null;
	matchedProductName: string | null;
	confidence: number;
	variants: Array<{
		size: string;
		qty: number;
		variantId: string | null;
		unitPrice: number;
	}>;
	issues: Array<{ code: string; detail: string }>;
};

export type ResolvedOrder =
	| {
			kind: 'resolved';
			organizationId: string;
			userId: string;
			accountId: string | null;
			accountName: string | null;
			accountConfidence: number;
			brandId: string | null;
			brandName: string | null;
			startShipDate: string | null;
			expectedShipDate: string | null;
			lines: ResolvedLine[];
			notes: string | null;
	  }
	| { kind: 'ambiguous' };

// ── Ship window parsing ──────────────────────────────────────

/**
 * Parse a ship window into start/end ISO date strings.
 * Accepts: "M/D", "M/D-M/D", "M/D M/D", "M/D/YY", "MMM D".
 * Year inference: if month is within 12 months forward of referenceDate, use current year; else next year.
 */
export function parseShipDate(
	dateStr: string | null,
	referenceDate: Date = new Date()
): string | null {
	if (!dateStr) return null;
	const trimmed = dateStr.trim();
	if (!trimmed) return null;

	// Try M/D or M/D/YY format
	const mdMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
	if (mdMatch) {
		const month = parseInt(mdMatch[1], 10);
		const day = parseInt(mdMatch[2], 10);
		let year: number;

		if (mdMatch[3]) {
			year = parseInt(mdMatch[3], 10);
			if (year < 100) year += 2000;
		} else {
			year = inferYear(month, referenceDate);
		}

		return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
	}

	// Try MMM D format (e.g. "May 20")
	const mmmMatch = trimmed.match(/^([A-Za-z]+)\s+(\d{1,2})$/);
	if (mmmMatch) {
		const month = monthNameToNumber(mmmMatch[1]);
		if (month === null) return null;
		const day = parseInt(mmmMatch[2], 10);
		const year = inferYear(month, referenceDate);
		return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
	}

	return null;
}

/**
 * Parse a ship window range string into start/end dates.
 */
export function parseShipWindow(
	window: { start: string | null; end: string | null } | null,
	referenceDate: Date = new Date()
): { start: string | null; end: string | null } {
	if (!window) return { start: null, end: null };
	return {
		start: parseShipDate(window.start, referenceDate),
		end: parseShipDate(window.end, referenceDate)
	};
}

function inferYear(month: number, referenceDate: Date): number {
	const refMonth = referenceDate.getMonth() + 1; // 1-based
	const refYear = referenceDate.getFullYear();

	// If the month is within 12 months forward, keep current year
	// Otherwise, use next year
	if (month >= refMonth) {
		return refYear;
	}
	// Month is earlier in the year — it's likely next year
	return refYear + 1;
}

const MONTH_NAMES: Record<string, number> = {
	jan: 1,
	january: 1,
	feb: 2,
	february: 2,
	mar: 3,
	march: 3,
	apr: 4,
	april: 4,
	may: 5,
	jun: 6,
	june: 6,
	jul: 7,
	july: 7,
	aug: 8,
	august: 8,
	sep: 9,
	september: 9,
	oct: 10,
	october: 10,
	nov: 11,
	november: 11,
	dec: 12,
	december: 12
};

function monthNameToNumber(name: string): number | null {
	return MONTH_NAMES[name.toLowerCase()] ?? null;
}

// ── Entity resolution ────────────────────────────────────────

/**
 * Resolve parsed order entities against the database using trigram matching.
 */
export async function resolveEntities(
	parsed: ParsedOrder,
	orgCandidates: OrgCandidate[]
): Promise<ResolvedOrder> {
	if (orgCandidates.length === 0) {
		return { kind: 'ambiguous' };
	}

	// For now, if multiple candidates, try disambiguation
	let orgId: string;
	let userId: string;

	if (orgCandidates.length === 1) {
		orgId = orgCandidates[0].organizationId;
		userId = orgCandidates[0].userId;
	} else {
		// Multi-org disambiguation cascade
		const resolved = await disambiguateOrg(parsed, orgCandidates);
		if (!resolved) return { kind: 'ambiguous' };
		orgId = resolved.organizationId;
		userId = resolved.userId;
	}

	// Resolve account
	const { accountId, accountName, accountConfidence } = await resolveAccount(
		parsed.account_name,
		orgId
	);

	// Resolve brand
	const { brandId, brandName } = await resolveBrand(parsed.brand_name, orgId);

	// Resolve ship window
	const shipWindow = parseShipWindow(parsed.ship_window);

	// Resolve lines
	const lines = await resolveLines(parsed.items, orgId, brandId);

	return {
		kind: 'resolved',
		organizationId: orgId,
		userId,
		accountId,
		accountName,
		accountConfidence,
		brandId,
		brandName,
		startShipDate: shipWindow.start,
		expectedShipDate: shipWindow.end,
		lines,
		notes: parsed.notes
	};
}

async function disambiguateOrg(
	parsed: ParsedOrder,
	candidates: OrgCandidate[]
): Promise<OrgCandidate | null> {
	const orgIds = candidates.map((c) => c.organizationId);

	// 1. Explicit org_hint
	if (parsed.org_hint) {
		const { data } = await supabaseAdmin.from('organizations').select('id, name').in('id', orgIds);

		const match = (data ?? []).find((o) =>
			o.name.toLowerCase().includes(parsed.org_hint!.toLowerCase())
		);

		if (match) {
			return candidates.find((c) => c.organizationId === match.id) ?? null;
		}
	}

	// 2. Brand name resolves to exactly one org
	if (parsed.brand_name) {
		const { data: brands } = await supabaseAdmin
			.from('brands')
			.select('id, organization_id')
			.in('organization_id', orgIds)
			.ilike('name', `%${parsed.brand_name}%`);

		const uniqueOrgs = new Set((brands ?? []).map((b) => b.organization_id));
		if (uniqueOrgs.size === 1) {
			const matchOrgId = [...uniqueOrgs][0];
			return candidates.find((c) => c.organizationId === matchOrgId) ?? null;
		}
	}

	// 3. Product inference: if all products match in the same org
	if (parsed.items.length > 0) {
		const orgHits = new Map<string, number>();
		for (const item of parsed.items) {
			for (const oid of orgIds) {
				// Check if any product with similar name exists in this org
				const { data: products } = await supabaseAdmin
					.from('products')
					.select('id')
					.eq('organization_id', oid)
					.ilike('name', `%${item.product_name.split(' ')[0]}%`)
					.limit(1);

				if (products && products.length > 0) {
					orgHits.set(oid, (orgHits.get(oid) ?? 0) + 1);
				}
			}
		}

		// If exactly one org matched all items
		const maxHits = Math.max(...orgHits.values(), 0);
		const winners = [...orgHits.entries()].filter(([, hits]) => hits === maxHits);
		if (winners.length === 1 && maxHits === parsed.items.length) {
			return candidates.find((c) => c.organizationId === winners[0][0]) ?? null;
		}
	}

	return null;
}

async function resolveAccount(
	accountName: string,
	orgId: string
): Promise<{ accountId: string | null; accountName: string | null; accountConfidence: number }> {
	const { data } = await supabaseAdmin
		.from('accounts')
		.select('id, business_name')
		.eq('organization_id', orgId)
		.order('business_name')
		.limit(50);

	if (!data || data.length === 0) {
		return { accountId: null, accountName: null, accountConfidence: 0 };
	}

	// Use pg_trgm similarity via RPC if available, otherwise fallback to basic matching
	const { data: matches } = await supabaseAdmin.rpc('trigram_match_accounts', {
		p_org_id: orgId,
		p_search: accountName,
		p_limit: 2
	});

	if (matches && matches.length > 0) {
		const top = matches[0] as { id: string; business_name: string; similarity: number };
		const second = matches[1] as
			| { id: string; business_name: string; similarity: number }
			| undefined;

		const isAmbiguous =
			second && Math.abs(top.similarity - second.similarity) < THRESHOLDS.ACCOUNT_AMBIGUITY_DELTA;

		if (top.similarity >= THRESHOLDS.ACCOUNT_MIN && !isAmbiguous) {
			return {
				accountId: top.id,
				accountName: top.business_name,
				accountConfidence: top.similarity
			};
		}

		return {
			accountId: top.id,
			accountName: top.business_name,
			accountConfidence: top.similarity
		};
	}

	// Fallback: case-insensitive substring match
	const fallback = data.find((a) =>
		a.business_name.toLowerCase().includes(accountName.toLowerCase())
	);

	return {
		accountId: fallback?.id ?? null,
		accountName: fallback?.business_name ?? null,
		accountConfidence: fallback ? 0.8 : 0
	};
}

async function resolveBrand(
	brandName: string | null,
	orgId: string
): Promise<{ brandId: string | null; brandName: string | null }> {
	if (!brandName) {
		// Try to find the sole brand for this org
		const { data } = await supabaseAdmin
			.from('brands')
			.select('id, name')
			.eq('organization_id', orgId);

		if (data && data.length === 1) {
			return { brandId: data[0].id, brandName: data[0].name };
		}

		return { brandId: null, brandName: null };
	}

	const { data: matches } = await supabaseAdmin.rpc('trigram_match_brands', {
		p_org_id: orgId,
		p_search: brandName,
		p_limit: 1
	});

	if (matches && matches.length > 0) {
		const top = matches[0] as { id: string; name: string; similarity: number };
		if (top.similarity >= THRESHOLDS.BRAND_MIN) {
			return { brandId: top.id, brandName: top.name };
		}
	}

	// Fallback
	const { data } = await supabaseAdmin
		.from('brands')
		.select('id, name')
		.eq('organization_id', orgId)
		.ilike('name', `%${brandName}%`)
		.limit(1);

	if (data && data.length > 0) {
		return { brandId: data[0].id, brandName: data[0].name };
	}

	return { brandId: null, brandName: null };
}

async function resolveLines(
	items: ParsedOrderItem[],
	orgId: string,
	brandId: string | null
): Promise<ResolvedLine[]> {
	const lines: ResolvedLine[] = [];

	for (let i = 0; i < items.length; i++) {
		const item = items[i];
		const issues: Array<{ code: string; detail: string }> = [];

		// Match product via trigram
		const rpcArgs: Record<string, unknown> = {
			p_org_id: orgId,
			p_search: item.product_name,
			p_limit: 2
		};
		if (brandId) {
			rpcArgs.p_brand_id = brandId;
		}

		const { data: productMatches } = await supabaseAdmin.rpc('trigram_match_products', rpcArgs);

		let matchedProductId: string | null = null;
		let matchedProductName: string | null = null;
		let confidence = 0;

		if (productMatches && productMatches.length > 0) {
			const top = productMatches[0] as { id: string; name: string; similarity: number };
			const second = productMatches[1] as
				| { id: string; name: string; similarity: number }
				| undefined;

			matchedProductId = top.id;
			matchedProductName = top.name;
			confidence = top.similarity;

			if (confidence < THRESHOLDS.PRODUCT_MIN) {
				issues.push({
					code: 'low_confidence',
					detail: `Best match "${top.name}" has confidence ${top.similarity.toFixed(3)}`
				});
			}

			if (
				second &&
				Math.abs(top.similarity - second.similarity) < THRESHOLDS.PRODUCT_AMBIGUITY_DELTA
			) {
				issues.push({
					code: 'ambiguous_product',
					detail: `"${top.name}" (${top.similarity.toFixed(3)}) vs "${second.name}" (${second.similarity.toFixed(3)})`
				});
			}
		} else {
			issues.push({ code: 'no_match', detail: `No product found matching "${item.product_name}"` });
		}

		// Resolve variants
		const variants = await Promise.all(
			item.sizes.map(async ({ size, qty }) => {
				if (!matchedProductId) {
					return { size, qty, variantId: null, unitPrice: 0 };
				}

				const colorFilter = item.color
					? supabaseAdmin
							.from('product_variants')
							.select('id, wholesale_price')
							.eq('product_id', matchedProductId)
							.ilike('size', size)
							.ilike('color', item.color)
							.limit(1)
					: supabaseAdmin
							.from('product_variants')
							.select('id, wholesale_price')
							.eq('product_id', matchedProductId)
							.ilike('size', size)
							.limit(1);

				const { data: variantData } = await colorFilter;

				if (variantData && variantData.length > 0) {
					return {
						size,
						qty,
						variantId: variantData[0].id,
						unitPrice: Number(variantData[0].wholesale_price) || 0
					};
				}

				issues.push({
					code: 'unknown_variant',
					detail: `No variant for size "${size}"${item.color ? ` / color "${item.color}"` : ''} on "${matchedProductName}"`
				});

				return { size, qty, variantId: null, unitPrice: 0 };
			})
		);

		lines.push({
			lineIndex: i,
			rawText: item.raw_text,
			matchedProductId,
			matchedProductName,
			confidence,
			variants,
			issues
		});
	}

	return lines;
}
