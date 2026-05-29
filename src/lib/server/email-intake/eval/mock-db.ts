/**
 * In-process mock of the SupabaseClient subset that resolve.ts uses.
 * Operates against a DbSeed loaded from __fixtures__/seeds/.
 *
 * Supported builder methods: .from().select().eq().in().ilike().order().limit()
 * Supported RPC: trigram_match_accounts, trigram_match_brands, trigram_match_products
 *
 * // extend when resolve.ts adds new calls
 */

import { trigramSimilarity } from './trigram';

export type DbSeed = {
	organizations: Array<{ id: string; name: string; org_type: 'brand' | 'rep' }>;
	users: Array<{ id: string; organization_id: string }>;
	accounts: Array<{
		id: string;
		organization_id: string;
		business_name: string;
		aliases?: string[];
	}>;
	brands: Array<{ id: string; organization_id: string; name: string; is_active: boolean }>;
	products: Array<{ id: string; brand_id: string; name: string; organization_id: string }>;
	product_variants: Array<{
		id: string;
		product_id: string;
		size: string;
		color: string | null;
		unit_price: number;
		wholesale_price?: number;
	}>;
};

type Row = Record<string, unknown>;

class MockQueryBuilder {
	private rows: Row[];
	private selectedFields: string[] | null = null;
	private limitCount: number | null = null;

	constructor(rows: Row[]) {
		this.rows = [...rows];
	}

	select(fields?: string): MockQueryBuilder {
		if (fields && fields !== '*') {
			this.selectedFields = fields.split(',').map((f) => f.trim());
		}
		return this;
	}

	eq(field: string, value: unknown): MockQueryBuilder {
		this.rows = this.rows.filter((r) => r[field] === value);
		return this;
	}

	in(field: string, values: unknown[]): MockQueryBuilder {
		const set = new Set(values);
		this.rows = this.rows.filter((r) => set.has(r[field]));
		return this;
	}

	ilike(field: string, pattern: string): MockQueryBuilder {
		const clean = pattern.replace(/%/g, '').toLowerCase();
		this.rows = this.rows.filter((r) => {
			const val = r[field];
			if (typeof val !== 'string') return false;
			return val.toLowerCase().includes(clean);
		});
		return this;
	}

	order(field: string, opts?: { ascending?: boolean }): MockQueryBuilder {
		const asc = opts?.ascending ?? true;
		this.rows.sort((a, b) => {
			const va = String(a[field] ?? '');
			const vb = String(b[field] ?? '');
			return asc ? va.localeCompare(vb) : vb.localeCompare(va);
		});
		return this;
	}

	limit(n: number): MockQueryBuilder {
		this.limitCount = n;
		return this;
	}

	then(
		resolve: (value: { data: Row[] | null; error: null }) => void,
		reject?: (reason: unknown) => void
	): void {
		try {
			resolve({ data: this.execute(), error: null });
		} catch (e) {
			if (reject) reject(e);
		}
	}

	private execute(): Row[] {
		let result = this.rows;
		if (this.limitCount !== null) {
			result = result.slice(0, this.limitCount);
		}
		if (this.selectedFields) {
			const fields = this.selectedFields;
			result = result.map((r) => {
				const out: Row = {};
				for (const f of fields) {
					if (f in r) out[f] = r[f];
				}
				return out;
			});
		}
		return result;
	}
}

export class MockSupabase {
	private seed: DbSeed;

	constructor(seed: DbSeed) {
		this.seed = seed;
	}

	from(table: string): MockQueryBuilder {
		const rows = this.getTable(table);
		return new MockQueryBuilder(rows);
	}

	rpc(
		fnName: string,
		args: Record<string, unknown>
	): { data: Row[] | null; error: null } | PromiseLike<{ data: Row[] | null; error: null }> {
		const result = this.executeRpc(fnName, args);
		return { data: result, error: null };
	}

	private getTable(table: string): Row[] {
		switch (table) {
			case 'organizations':
				return this.seed.organizations as Row[];
			case 'accounts':
				return this.seed.accounts as Row[];
			case 'brands':
				return this.seed.brands as Row[];
			case 'products':
				return this.seed.products as Row[];
			case 'product_variants':
				return this.seed.product_variants.map((v) => ({
					...v,
					wholesale_price: v.wholesale_price ?? v.unit_price
				})) as Row[];
			default:
				return [];
		}
	}

	private executeRpc(fnName: string, args: Record<string, unknown>): Row[] {
		const orgId = args.p_org_id as string;
		const search = args.p_search as string;
		const limit = (args.p_limit as number) ?? 5;

		switch (fnName) {
			case 'trigram_match_accounts': {
				const candidates = this.seed.accounts.filter((a) => a.organization_id === orgId);
				return candidates
					.map((a) => ({
						id: a.id,
						business_name: a.business_name,
						similarity: trigramSimilarity(search, a.business_name)
					}))
					.sort((a, b) => b.similarity - a.similarity)
					.slice(0, limit);
			}
			case 'trigram_match_brands': {
				const candidates = this.seed.brands.filter((b) => b.organization_id === orgId);
				return candidates
					.map((b) => ({
						id: b.id,
						name: b.name,
						similarity: trigramSimilarity(search, b.name)
					}))
					.sort((a, b) => b.similarity - a.similarity)
					.slice(0, limit);
			}
			case 'trigram_match_products': {
				const brandId = args.p_brand_id as string | undefined;
				let candidates = this.seed.products.filter((p) => p.organization_id === orgId);
				if (brandId) {
					candidates = candidates.filter((p) => p.brand_id === brandId);
				}
				return candidates
					.map((p) => ({
						id: p.id,
						name: p.name,
						similarity: trigramSimilarity(search, p.name)
					}))
					.sort((a, b) => b.similarity - a.similarity)
					.slice(0, limit);
			}
			default:
				return [];
		}
	}
}
