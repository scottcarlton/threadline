---
name: rbac-change
description: Use when implementing any change that touches roles, permissions, brand scoping, org connections, or federation — before writing code, load the permissions implementation map, classify the change, and walk the preflight checklist. Triggers on "federation", "RLS", "permissions", "role check", "brand scope", "connection", "cross-org", or any migration under `supabase/migrations/` that creates or alters RLS policies.
---

# RBAC Change

Before writing any code for a change that touches roles, permissions, or federation:

1. **Read `docs/brd/permissions-implementation-map.md` in full.** Do not paraphrase from memory. Do not stop at the section you think is relevant — read it all.
2. **Classify the change** into one of these kinds:
   - **a.** Adding or renaming a scoped table
   - **b.** Changing who can see rows in an existing table
   - **c.** Changing who can write rows in an existing table
   - **d.** Adding or modifying a route or API endpoint that reads/writes a scoped table
   - **e.** Adding or modifying an RLS helper function
3. **List the tables touched.** For each, locate its entry in §A.3 of the map. If missing, STOP and add the entry before touching code.
4. **Pick the layer.** For each table:
   - Is this a federation read? → Layer 3 (RLS) only if implicit, or Layer 4 (app-layer) if explicit-link.
   - Is this an own-org list? → Always keep `.eq('organization_id', currentOrgId)` AND apply Layer 4 if Member/Sales/Guest.
   - Is this a write? → Role check at Layer 1 (route guard) AND Layer 2 (endpoint check) AND Layer 3 (RLS `WITH CHECK`).
5. **Inventory the routes.** For each table, list every route/endpoint from §A.4 / §A.5 that must change. Write them down before editing.
6. **Write the migration (if any).** Use existing helpers (`get_user_brand_ids`, `get_user_role`, `is_org_member`, `get_connected_org_ids`). Do not create a new helper without an ADR.
7. **Update routes and endpoints.** Each one must match the classification in the map. Do not delete an `.eq('organization_id', ...)` filter unless §A.4 says the route is a federation-view.
8. **Run the gates.**
   - `bun run check` — 0 errors
   - `bun run test:run` — all green
   - If `src/lib/server/__tests__/federation.test.ts` exists, it MUST pass. Do not skip.
9. **Self-review against the map.** For every file touched, confirm its row in §A.4 / §A.5 matches what you wrote. If you added a new route, add it to the map.

## When this skill applies

- "Implement federation for X"
- "Add role check to endpoint Y"
- "Change brand scoping for role Z"
- "Review this RLS migration"
- Anything touching `supabase/migrations/*rls*.sql`, `src/lib/server/federation.ts`, `src/hooks.server.ts`, or a `+page.server.ts` that reads a table listed in §A.3 of the map

## When it does NOT apply

- Purely UI/styling changes that don't touch server data fetches
- Changes to tables that aren't RBAC/federation-scoped (e.g., `notifications` for the current user only)
- Adding a new field to an already-scoped table without changing its visibility

## Anti-patterns (do not ship any of these)

- Deleting `.eq('organization_id', currentOrgId)` with a comment like "RLS handles it"
- Relying on a single helper (e.g., `get_connected_org_ids`) for both MBISR→BOA and BOA→MBISR federation
- Adding a new RLS policy that is looser than the old one without an accompanying test
- Creating a new federation helper without an ADR
