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
