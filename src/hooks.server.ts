import { createServerClient } from '@supabase/ssr';
import { redirect, type Handle } from '@sveltejs/kit';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';

const PUBLIC_ROUTES = ['/login', '/signup', '/invite'];

export const handle: Handle = async ({ event, resolve }) => {
	const supabase = createServerClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
		cookies: {
			getAll: () => event.cookies.getAll(),
			setAll: (cookiesToSet) => {
				cookiesToSet.forEach(({ name, value, options }) => {
					event.cookies.set(name, value, { ...options, path: '/' });
				});
			}
		}
	});

	event.locals.supabase = supabase;

	event.locals.safeGetSession = async () => {
		const {
			data: { session }
		} = await supabase.auth.getSession();
		if (!session) return { session: null, user: null };

		const {
			data: { user },
			error
		} = await supabase.auth.getUser();
		if (error) return { session: null, user: null };
		return { session, user };
	};

	const { session, user } = await event.locals.safeGetSession();
	event.locals.session = session;

	const isPublicRoute = PUBLIC_ROUTES.some((r) => event.url.pathname.startsWith(r));

	// Redirect unauthenticated users to login
	if (!session && !isPublicRoute && event.url.pathname !== '/') {
		throw redirect(303, '/login');
	}

	// Root path: redirect based on auth state
	if (event.url.pathname === '/') {
		if (session) {
			throw redirect(303, '/dashboard');
		} else {
			throw redirect(303, '/login');
		}
	}

	// Load user context for authenticated routes
	if (session && user && !isPublicRoute) {
		const { data: profile } = await supabase
			.from('profiles')
			.select('*')
			.eq('id', user.id)
			.single();

		const { data: membership } = await supabase
			.from('organization_members')
			.select('*, organizations(*)')
			.eq('profile_id', user.id)
			.single();

		// Load brand scoping for member/guest roles
		let brandScope: string[] | null = null;
		if (membership && ['member', 'guest'].includes(membership.role)) {
			const { data: brandAccess } = await supabase
				.from('member_brand_access')
				.select('brand_id')
				.eq('member_id', membership.id);
			brandScope = brandAccess?.length ? brandAccess.map((b: { brand_id: string }) => b.brand_id) : null;
		}

		event.locals.user = profile;
		event.locals.membership = membership;
		event.locals.organization = membership?.organizations ?? null;
		event.locals.brandScope = brandScope;
	}

	return resolve(event, {
		filterSerializedResponseHeaders(name) {
			return name === 'content-range' || name === 'x-supabase-api-version';
		}
	});
};
