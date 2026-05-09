// App-layer admin/owner gate for routes that mutate sensitive settings.
// Returns null when the call is allowed, or { error, status } describing
// why the call should be rejected. Used by /organization/{taxes, shipping,
// returns, payments} settings actions and the brand commerce modal actions
// on /brands/[id].
//
// We enforce this at the app layer (rather than via column-level RLS)
// because Postgres has no native column-level RLS — the alternatives are
// triggers or xmax checks, both ugly. The brand UPDATE policy stays at
// admin/owner+scoped-members for identity edits; commerce columns are
// guarded by this helper at the form action level.
export function requireAdmin(locals: App.Locals): { error: string; status: number } | null {
	if (!locals.session || !locals.user || !locals.organization) {
		return { error: 'Not authenticated', status: 401 };
	}
	const role = locals.membership?.role;
	if (!role || !['admin', 'owner'].includes(role)) {
		return { error: 'Admin or owner required', status: 403 };
	}
	return null;
}
