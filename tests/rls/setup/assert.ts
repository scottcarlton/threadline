import { expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Which of `candidateIds` this client can see in `table`.
 *
 * A SELECT blocked by RLS returns zero rows, not an error. Any error here
 * is a genuine problem (missing table, bad column, stale PostgREST schema
 * cache) and is rethrown rather than silently read as "not visible".
 */
export async function visibleIds(
	client: SupabaseClient,
	table: string,
	candidateIds: string[]
): Promise<string[]> {
	const { data, error } = await client.from(table).select('id').in('id', candidateIds);
	if (error) {
		throw new Error(`${table}: unexpected select error ${error.code}: ${error.message}`);
	}
	return (data ?? []).map((row) => (row as { id: string }).id);
}

export async function expectVisible(
	client: SupabaseClient,
	table: string,
	id: string
): Promise<void> {
	const seen = await visibleIds(client, table, [id]);
	expect(seen, `${table}:${id} should be visible`).toEqual([id]);
}

export async function expectHidden(
	client: SupabaseClient,
	table: string,
	id: string
): Promise<void> {
	const seen = await visibleIds(client, table, [id]);
	expect(seen, `${table}:${id} should be hidden`).toEqual([]);
}

/** An INSERT blocked by a WITH CHECK clause raises Postgres error 42501. */
export async function expectInsertDenied(
	client: SupabaseClient,
	table: string,
	row: Record<string, unknown>
): Promise<void> {
	const { error } = await client.from(table).insert(row);
	expect(error?.code, `${table} insert should be denied by RLS`).toBe('42501');
}

/** Returns the new row id so callers can clean up or chain assertions. */
export async function expectInsertAllowed(
	client: SupabaseClient,
	table: string,
	row: Record<string, unknown>
): Promise<string> {
	const { data, error } = await client.from(table).insert(row).select('id').single();
	expect(error, `${table} insert should be allowed, got ${error?.message}`).toBeNull();
	return (data as { id: string }).id;
}

/**
 * An UPDATE can be blocked two ways: the USING clause hides the row (no
 * error, zero rows affected) or the WITH CHECK clause rejects the new
 * values (42501). Both count as denied.
 */
export async function expectUpdateDenied(
	client: SupabaseClient,
	table: string,
	id: string,
	patch: Record<string, unknown>
): Promise<void> {
	const { data, error } = await client.from(table).update(patch).eq('id', id).select('id');
	if (error) {
		expect(error.code, `${table}:${id} update should be denied by RLS`).toBe('42501');
		return;
	}
	expect(data ?? [], `${table}:${id} update should affect no rows`).toEqual([]);
}

export async function expectUpdateAllowed(
	client: SupabaseClient,
	table: string,
	id: string,
	patch: Record<string, unknown>
): Promise<void> {
	const { data, error } = await client.from(table).update(patch).eq('id', id).select('id');
	expect(error, `${table}:${id} update should be allowed`).toBeNull();
	expect(data ?? [], `${table}:${id} update should affect one row`).toEqual([{ id }]);
}

/**
 * A DELETE can be blocked the same two ways an UPDATE can: the USING
 * clause hides the row (no error, zero rows affected) or, for a table
 * with no DELETE-capable policy at all, PostgREST/Postgres raises 42501.
 * Both count as denied.
 *
 * Same caveat as expectUpdateDenied: a bare pass here cannot by itself
 * distinguish "denied by RLS" from "the row never existed" -- both look
 * like zero affected rows. Callers must seed the row with a
 * privileged/service-role client and confirm the insert succeeded before
 * calling this, or a typo'd id would pass vacuously.
 */
export async function expectDeleteDenied(
	client: SupabaseClient,
	table: string,
	id: string
): Promise<void> {
	const { data, error } = await client.from(table).delete().eq('id', id).select('id');
	if (error) {
		expect(error.code, `${table}:${id} delete should be denied by RLS`).toBe('42501');
		return;
	}
	expect(data ?? [], `${table}:${id} delete should affect no rows`).toEqual([]);
}

export async function expectDeleteAllowed(
	client: SupabaseClient,
	table: string,
	id: string
): Promise<void> {
	const { data, error } = await client.from(table).delete().eq('id', id).select('id');
	expect(error, `${table}:${id} delete should be allowed`).toBeNull();
	expect(data ?? [], `${table}:${id} delete should affect one row`).toEqual([{ id }]);
}

/**
 * Keyless counterparts of the helpers above, for tables addressed by a
 * composite primary key instead of a single `id` column (e.g.
 * member_territories, order_views). Every `eq` filter clause is applied in
 * turn, exactly matching one row by construction.
 */
type FilterResult = { data: unknown[] | null; error: { code?: string; message: string } | null };

/**
 * Chains one `.eq()` call per filter entry onto a query builder. Typed as
 * `any` in and out deliberately: the real Postgrest builder generics are
 * deep enough that a generic wrapper here trips "excessively deep"
 * instantiation in svelte-check. Every call site re-types the awaited
 * result explicitly, so `any` never actually leaks to a caller.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyFilter(query: any, filter: Record<string, unknown>): any {
	let result = query;
	for (const [column, value] of Object.entries(filter)) {
		result = result.eq(column, value);
	}
	return result;
}

export async function visibleByFilter(
	client: SupabaseClient,
	table: string,
	filter: Record<string, unknown>
): Promise<boolean> {
	const { data, error } = (await applyFilter(
		client.from(table).select('*'),
		filter
	)) as FilterResult;
	if (error) {
		throw new Error(`${table}: unexpected select error ${error.code}: ${error.message}`);
	}
	return (data ?? []).length > 0;
}

export async function expectVisibleByFilter(
	client: SupabaseClient,
	table: string,
	filter: Record<string, unknown>
): Promise<void> {
	const seen = await visibleByFilter(client, table, filter);
	expect(seen, `${table}:${JSON.stringify(filter)} should be visible`).toBe(true);
}

export async function expectHiddenByFilter(
	client: SupabaseClient,
	table: string,
	filter: Record<string, unknown>
): Promise<void> {
	const seen = await visibleByFilter(client, table, filter);
	expect(seen, `${table}:${JSON.stringify(filter)} should be hidden`).toBe(false);
}

export async function expectUpdateDeniedByFilter(
	client: SupabaseClient,
	table: string,
	filter: Record<string, unknown>,
	patch: Record<string, unknown>
): Promise<void> {
	const { data, error } = (await applyFilter(
		client.from(table).update(patch),
		filter
	).select()) as FilterResult;
	if (error) {
		expect(error.code, `${table}:${JSON.stringify(filter)} update should be denied by RLS`).toBe(
			'42501'
		);
		return;
	}
	expect(data ?? [], `${table}:${JSON.stringify(filter)} update should affect no rows`).toEqual([]);
}

export async function expectUpdateAllowedByFilter(
	client: SupabaseClient,
	table: string,
	filter: Record<string, unknown>,
	patch: Record<string, unknown>
): Promise<void> {
	const { data, error } = (await applyFilter(
		client.from(table).update(patch),
		filter
	).select()) as FilterResult;
	expect(error, `${table}:${JSON.stringify(filter)} update should be allowed`).toBeNull();
	expect(
		(data ?? []).length,
		`${table}:${JSON.stringify(filter)} update should affect one row`
	).toBe(1);
}

export async function expectDeleteDeniedByFilter(
	client: SupabaseClient,
	table: string,
	filter: Record<string, unknown>
): Promise<void> {
	const { data, error } = (await applyFilter(
		client.from(table).delete(),
		filter
	).select()) as FilterResult;
	if (error) {
		expect(error.code, `${table}:${JSON.stringify(filter)} delete should be denied by RLS`).toBe(
			'42501'
		);
		return;
	}
	expect(data ?? [], `${table}:${JSON.stringify(filter)} delete should affect no rows`).toEqual([]);
}

export async function expectDeleteAllowedByFilter(
	client: SupabaseClient,
	table: string,
	filter: Record<string, unknown>
): Promise<void> {
	const { data, error } = (await applyFilter(
		client.from(table).delete(),
		filter
	).select()) as FilterResult;
	expect(error, `${table}:${JSON.stringify(filter)} delete should be allowed`).toBeNull();
	expect(
		(data ?? []).length,
		`${table}:${JSON.stringify(filter)} delete should affect one row`
	).toBe(1);
}

/** Insert denial doesn't need an id; keyless tables reuse expectInsertDenied
 * as-is. This is the keyless counterpart of expectInsertAllowed, for tables
 * where the caller already knows the full key from the input row and
 * doesn't need one selected back. */
export async function expectInsertAllowedNoId(
	client: SupabaseClient,
	table: string,
	row: Record<string, unknown>
): Promise<void> {
	const { error } = await client.from(table).insert(row);
	expect(error, `${table} insert should be allowed, got ${error?.message}`).toBeNull();
}
