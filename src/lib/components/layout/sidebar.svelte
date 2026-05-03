<script lang="ts">
	import { page } from '$app/stores';
	import { resolve } from '$app/paths';
	import { cn } from '$lib/utils.js';
	import { unreadCount } from '$lib/stores/unread.js';
	import { upcomingAppointmentCount } from '$lib/stores/appointments.js';
	import { orderAttentionCount } from '$lib/stores/orderAttention.js';
	import type { UserRole, OrgType } from '$lib/types/database.js';
	import { OverlayPanel } from '$lib/components/ui/overlay-panel/index.js';

	type NavItem = {
		label: string;
		href: string;
		icon: string;
		fillIcon?: boolean;
		viewBox?: string;
	};

	type Props = {
		role: UserRole | null;
		orgType?: OrgType;
		brandScope?: string[] | null;
		isBuyer?: boolean;
		isNxBlsr?: boolean;
		isSystemAdmin?: boolean;
		showHelp?: boolean;
		mode?: 'push' | 'overlay';
		open?: boolean;
		onclose?: () => void;
	};

	let {
		role,
		orgType = 'rep',
		brandScope = null,
		isBuyer = false,
		isNxBlsr = false,
		isSystemAdmin = false,
		showHelp = $bindable(false),
		mode = 'push',
		open = true,
		onclose = () => {}
	}: Props = $props();

	const isSales = $derived(role === 'sales');
	const isBrandScoped = $derived(
		isBuyer ||
			(brandScope !== null &&
				brandScope.length > 0 &&
				(role === 'member' || role === 'sales' || role === 'guest'))
	);

	const isBrandOrg = $derived(orgType === 'brand');

	// Rep org primary nav
	const repNav: NavItem[] = [
		{
			label: 'Insight',
			href: '/insight',
			icon: 'M14.2458 10C14.6255 10 14.9393 10.2822 14.9889 10.6482L14.9958 10.75V12.2475C14.9958 13.7083 13.8567 14.9034 12.4177 14.9922L12.2504 14.9975L10.7513 15C10.3371 15.0007 10.0007 14.6655 10 14.2513C9.99936 13.8716 10.281 13.5573 10.647 13.507L10.7487 13.5L12.2479 13.4975C12.8943 13.4964 13.4255 13.0047 13.4893 12.3751L13.4958 12.2475V10.75C13.4958 10.3358 13.8316 10 14.2458 10ZM1.75 10C2.16421 10 2.5 10.3358 2.5 10.75V12.2475C2.5 12.937 3.05836 13.4963 3.74789 13.4975L5.24703 13.5C5.66125 13.5007 5.99646 13.8371 5.99576 14.2513C5.99506 14.6655 5.65871 15.0007 5.2445 15L3.74535 14.9975C2.22839 14.9949 1 13.7644 1 12.2475V10.75C1 10.3358 1.33579 10 1.75 10ZM8 6C9.10457 6 10 6.89543 10 8C10 9.10457 9.10457 10 8 10C6.89543 10 6 9.10457 6 8C6 6.89543 6.89543 6 8 6ZM10.7513 1L12.2504 1.00254C13.7674 1.0051 14.9958 2.23556 14.9958 3.75253V5.25C14.9958 5.66422 14.66 6 14.2458 6C13.8316 6 13.4958 5.66422 13.4958 5.25V3.75253C13.4958 3.063 12.9374 2.5037 12.2479 2.50253L10.7487 2.5C10.3345 2.4993 9.9993 2.16295 10 1.74873C10.0007 1.33452 10.3371 0.999302 10.7513 1ZM5.24873 1C5.66295 0.999303 5.9993 1.33452 6 1.74873C6.0007 2.16295 5.66548 2.4993 5.25127 2.5L3.75212 2.50253C3.06259 2.5037 2.50424 3.063 2.50424 3.75253V5.25C2.50424 5.66422 2.16845 6 1.75424 6C1.34002 6 1.00424 5.66422 1.00424 5.25V3.75253C1.00424 2.23556 2.23262 1.0051 3.74959 1.00254L5.24873 1Z',
			fillIcon: true,
			viewBox: '0 0 16 16'
		},
		{
			label: 'Accounts',
			href: '/accounts',
			icon: 'M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016c.896 0 1.7-.393 2.25-1.016a3.001 3.001 0 003.75.614m-16.5 0a3.004 3.004 0 01-.621-4.72L4.318 3.44A1.5 1.5 0 015.378 3h13.243a1.5 1.5 0 011.06.44l1.19 1.189a3 3 0 01-.621 4.72m-13.5 8.65h3.75a.75.75 0 00.75-.75V13.5a.75.75 0 00-.75-.75H6.75a.75.75 0 00-.75.75v3.75c0 .415.336.75.75.75z'
		},
		{
			label: 'Orders',
			href: '/orders',
			icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z'
		},
		{
			label: 'Products',
			href: '/products',
			icon: 'M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z'
		},
		{
			label: 'Brands',
			href: '/brands',
			icon: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10'
		},
		{
			label: 'Expenses',
			href: '/expenses',
			icon: 'M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z'
		},
		{
			label: 'Reports',
			href: '/reports',
			icon: 'M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z'
		}
	];

	// Brand org primary nav
	const brandNav: NavItem[] = [
		{
			label: 'Insight',
			href: '/insight',
			icon: 'M14.2458 10C14.6255 10 14.9393 10.2822 14.9889 10.6482L14.9958 10.75V12.2475C14.9958 13.7083 13.8567 14.9034 12.4177 14.9922L12.2504 14.9975L10.7513 15C10.3371 15.0007 10.0007 14.6655 10 14.2513C9.99936 13.8716 10.281 13.5573 10.647 13.507L10.7487 13.5L12.2479 13.4975C12.8943 13.4964 13.4255 13.0047 13.4893 12.3751L13.4958 12.2475V10.75C13.4958 10.3358 13.8316 10 14.2458 10ZM1.75 10C2.16421 10 2.5 10.3358 2.5 10.75V12.2475C2.5 12.937 3.05836 13.4963 3.74789 13.4975L5.24703 13.5C5.66125 13.5007 5.99646 13.8371 5.99576 14.2513C5.99506 14.6655 5.65871 15.0007 5.2445 15L3.74535 14.9975C2.22839 14.9949 1 13.7644 1 12.2475V10.75C1 10.3358 1.33579 10 1.75 10ZM8 6C9.10457 6 10 6.89543 10 8C10 9.10457 9.10457 10 8 10C6.89543 10 6 9.10457 6 8C6 6.89543 6.89543 6 8 6ZM10.7513 1L12.2504 1.00254C13.7674 1.0051 14.9958 2.23556 14.9958 3.75253V5.25C14.9958 5.66422 14.66 6 14.2458 6C13.8316 6 13.4958 5.66422 13.4958 5.25V3.75253C13.4958 3.063 12.9374 2.5037 12.2479 2.50253L10.7487 2.5C10.3345 2.4993 9.9993 2.16295 10 1.74873C10.0007 1.33452 10.3371 0.999302 10.7513 1ZM5.24873 1C5.66295 0.999303 5.9993 1.33452 6 1.74873C6.0007 2.16295 5.66548 2.4993 5.25127 2.5L3.75212 2.50253C3.06259 2.5037 2.50424 3.063 2.50424 3.75253V5.25C2.50424 5.66422 2.16845 6 1.75424 6C1.34002 6 1.00424 5.66422 1.00424 5.25V3.75253C1.00424 2.23556 2.23262 1.0051 3.74959 1.00254L5.24873 1Z',
			fillIcon: true,
			viewBox: '0 0 16 16'
		},
		{
			label: 'Accounts',
			href: '/accounts',
			icon: 'M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016c.896 0 1.7-.393 2.25-1.016a3.001 3.001 0 003.75.614m-16.5 0a3.004 3.004 0 01-.621-4.72L4.318 3.44A1.5 1.5 0 015.378 3h13.243a1.5 1.5 0 011.06.44l1.19 1.189a3 3 0 01-.621 4.72m-13.5 8.65h3.75a.75.75 0 00.75-.75V13.5a.75.75 0 00-.75-.75H6.75a.75.75 0 00-.75.75v3.75c0 .415.336.75.75.75z'
		},
		{
			label: 'Orders',
			href: '/orders',
			icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z'
		},
		{
			label: 'Products',
			href: '/products',
			icon: 'M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z'
		},
		{
			label: 'Expenses',
			href: '/expenses',
			icon: 'M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z'
		},
		{
			label: 'Reports',
			href: '/reports',
			icon: 'M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z'
		}
	];

	// Nx-BLSR portal: rep-style nav with Products folded in. Acts across all the
	// user's brand-org memberships as a single unified context.
	const nxBlsrNav: NavItem[] = (() => {
		const productsItem = brandNav.find((it) => it.label === 'Products')!;
		const order = ['Insight', 'Accounts', 'Orders', 'Products', 'Brands', 'Expenses', 'Reports'];
		return order
			.map((label) => {
				if (label === 'Products') return productsItem;
				return repNav.find((it) => it.label === label)!;
			})
			.filter(Boolean);
	})();

	// System super-admin nav: standalone, above-org. No role/org context applies.
	const systemNav: NavItem[] = [
		{
			label: 'Overview',
			href: '/system',
			icon: 'M14.2458 10C14.6255 10 14.9393 10.2822 14.9889 10.6482L14.9958 10.75V12.2475C14.9958 13.7083 13.8567 14.9034 12.4177 14.9922L12.2504 14.9975L10.7513 15C10.3371 15.0007 10.0007 14.6655 10 14.2513C9.99936 13.8716 10.281 13.5573 10.647 13.507L10.7487 13.5L12.2479 13.4975C12.8943 13.4964 13.4255 13.0047 13.4893 12.3751L13.4958 12.2475V10.75C13.4958 10.3358 13.8316 10 14.2458 10ZM1.75 10C2.16421 10 2.5 10.3358 2.5 10.75V12.2475C2.5 12.937 3.05836 13.4963 3.74789 13.4975L5.24703 13.5C5.66125 13.5007 5.99646 13.8371 5.99576 14.2513C5.99506 14.6655 5.65871 15.0007 5.2445 15L3.74535 14.9975C2.22839 14.9949 1 13.7644 1 12.2475V10.75C1 10.3358 1.33579 10 1.75 10ZM8 6C9.10457 6 10 6.89543 10 8C10 9.10457 9.10457 10 8 10C6.89543 10 6 9.10457 6 8C6 6.89543 6.89543 6 8 6ZM10.7513 1L12.2504 1.00254C13.7674 1.0051 14.9958 2.23556 14.9958 3.75253V5.25C14.9958 5.66422 14.66 6 14.2458 6C13.8316 6 13.4958 5.66422 13.4958 5.25V3.75253C13.4958 3.063 12.9374 2.5037 12.2479 2.50253L10.7487 2.5C10.3345 2.4993 9.9993 2.16295 10 1.74873C10.0007 1.33452 10.3371 0.999302 10.7513 1ZM5.24873 1C5.66295 0.999303 5.9993 1.33452 6 1.74873C6.0007 2.16295 5.66548 2.4993 5.25127 2.5L3.75212 2.50253C3.06259 2.5037 2.50424 3.063 2.50424 3.75253V5.25C2.50424 5.66422 2.16845 6 1.75424 6C1.34002 6 1.00424 5.66422 1.00424 5.25V3.75253C1.00424 2.23556 2.23262 1.0051 3.74959 1.00254L5.24873 1Z',
			fillIcon: true,
			viewBox: '0 0 16 16'
		},
		{
			label: 'Organizations',
			href: '/system/organizations',
			icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4'
		},
		{
			label: 'Users',
			href: '/system/users',
			icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z'
		},
		{
			label: 'Feature flags',
			href: '/system/flags',
			icon: 'M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z'
		},
		{
			label: 'Invites',
			href: '/system/invites',
			icon: 'M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75'
		}
	];

	const primaryNav = $derived(
		isSystemAdmin ? systemNav : isNxBlsr ? nxBlsrNav : isBrandOrg ? brandNav : repNav
	);

	// Items a brand-scoped member (not sales) sees
	const brandScopedNav = ['Insight', 'Accounts', 'Orders', 'Expenses', 'Reports'];
	// Brand-org sales reps: everything except Reps
	const salesBrandNav = ['Insight', 'Accounts', 'Orders', 'Products', 'Expenses', 'Reports'];
	// Rep-org sales members: existing reduced set
	const salesRepNav = ['Insight', 'Accounts', 'Orders', 'Expenses', 'Reports'];
	const shopNav: NavItem = {
		label: 'Shop',
		href: '/shop',
		icon: 'M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z'
	};
	const buyerHomeNav: NavItem = {
		label: 'Home',
		href: '/dashboard',
		icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1'
	};
	const salesAllowed = $derived(isBrandOrg ? salesBrandNav : salesRepNav);
	const filteredPrimaryNav = $derived(
		isSystemAdmin
			? primaryNav
			: isBuyer
				? [buyerHomeNav, shopNav, ...primaryNav.filter((item) => item.label === 'Orders')]
				: isNxBlsr
					? primaryNav
					: isSales
						? primaryNav.filter((item) => salesAllowed.includes(item.label))
						: isBrandScoped
							? primaryNav.filter((item) => brandScopedNav.includes(item.label))
							: primaryNav
	);

	const inboxNav: NavItem = {
		label: 'Inbox',
		href: '/inbox',
		icon: 'M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75'
	};
	const appointmentsNav: NavItem = {
		label: 'Appointments',
		href: '/appointments',
		icon: 'M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5'
	};
	const orgNav: NavItem = {
		label: 'Organization',
		href: '/organization',
		icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4'
	};

	const showOrg = $derived(role === 'admin' || role === 'owner');
	const isSingleBrandScoped = $derived(isBrandScoped && brandScope?.length === 1);
	const brandLink = $derived(isSingleBrandScoped ? `/brands/${brandScope![0]}` : '/organization');

	const kbdClass = 'rounded border bg-muted px-1.5 py-0.5 text-xs font-mono';

	function isActive(href: string): boolean {
		if (href === '/dashboard') return $page.url.pathname === '/dashboard';
		return $page.url.pathname === href || $page.url.pathname.startsWith(href + '/');
	}
</script>

{#snippet sidebarContent()}
	<!-- Primary Navigation -->
	<nav class="flex-1 space-y-px px-5 pt-5">
		{#each filteredPrimaryNav as item (item.href)}
			<a
				href={resolve(item.href as '/orders')}
				class={cn(
					'group flex items-center gap-3 rounded-none px-4 py-3.5 text-base transition-colors lg:px-3 lg:py-2.5 lg:text-sm',
					isActive(item.href)
						? 'bg-ghost font-medium text-foreground'
						: 'text-muted-foreground hover:bg-ghost/50 hover:text-foreground'
				)}
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-[18px] w-[18px] shrink-0"
					fill={item.fillIcon ? 'currentColor' : 'none'}
					viewBox={item.viewBox ?? '0 0 24 24'}
					stroke={item.fillIcon ? 'none' : 'currentColor'}
					stroke-width={item.fillIcon ? 0 : 2.25}
				>
					{#if !item.fillIcon}<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d={item.icon}
						/>{:else}<path d={item.icon} />{/if}
				</svg>
				<span class="flex-1">{item.label}</span>
				{#if item.label === 'Orders' && $orderAttentionCount > 0}
					<span
						class="flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-[10px] font-bold text-white"
						>{$orderAttentionCount}</span
					>
				{/if}
			</a>
		{/each}

		{#if !isSystemAdmin && !isBuyer && (!isBrandScoped || isSales)}
			<div class="mt-6">
				{#if !isBrandScoped || isSales}
					<a
						href={resolve(inboxNav.href as '/inbox')}
						class={cn(
							'group flex items-center gap-3 rounded-none px-4 py-3.5 text-base transition-colors lg:px-3 lg:py-2.5 lg:text-sm',
							isActive(inboxNav.href)
								? 'bg-ghost font-medium text-foreground'
								: 'text-muted-foreground hover:bg-ghost/60 hover:text-foreground'
						)}
					>
						<div class="relative shrink-0">
							<svg
								class="h-[18px] w-[18px]"
								viewBox="0 0 16 16"
								fill="currentColor"
								xmlns="http://www.w3.org/2000/svg"
							>
								<path
									fill-rule="evenodd"
									clip-rule="evenodd"
									d="M11.0069 1.00879C12.0235 1.09224 12.8967 1.78967 13.1944 2.78027L14.8907 8.42871C15.0034 8.80411 15.0258 9.20103 14.9571 9.58691L14.5069 12.1143L14.4375 12.4219C14.0542 13.8306 12.8312 14.8559 11.378 14.9863L11.0625 15H4.92875L4.6143 14.9863C3.16087 14.8561 1.93819 13.8307 1.55473 12.4219L1.48539 12.1143L1.03422 9.58691C0.974045 9.24914 0.984493 8.90311 1.06352 8.57031L1.1016 8.42871L2.79691 2.78027C3.09453 1.78948 3.96862 1.09214 4.98539 1.00879L5.19047 1H10.8018L11.0069 1.00879ZM2.96098 11.8516C3.13119 12.8053 3.96043 13.4999 4.92875 13.5H11.0625C12.031 13.5 12.8611 12.8054 13.0313 11.8516L13.2715 10.5H11.6211C11.2249 10.5 10.8512 10.6738 10.5957 10.9697L10.4932 11.1035C10.1201 11.6634 9.49195 11.9999 8.81938 12H7.17191C6.54154 11.9998 5.95019 11.7042 5.57133 11.2061L5.49809 11.1035C5.24687 10.7266 4.82396 10.5 4.37113 10.5H2.71977L2.96098 11.8516ZM5.19047 2.5C4.80433 2.50005 4.45748 2.72173 4.29203 3.06055L4.23246 3.21191L2.53715 8.86035C2.5234 8.90613 2.514 8.95293 2.50688 9H4.37113C5.32524 9.00001 6.21689 9.47715 6.74613 10.2715L6.78422 10.3223C6.88083 10.4341 7.02214 10.4998 7.17191 10.5H8.81938C8.99076 10.4999 9.15106 10.4142 9.24613 10.2715L9.34965 10.126C9.88713 9.41919 10.7268 9 11.6211 9H13.4854C13.4785 8.95295 13.4689 8.90616 13.4551 8.86035L11.7588 3.21191C11.6318 2.78947 11.2427 2.50018 10.8018 2.5H5.19047Z"
								/>
							</svg>
						</div>
						<span class="flex-1">{inboxNav.label}</span>
						{#if $unreadCount > 0}
							<span
								class="flex h-5 min-w-5 items-center justify-center rounded-full bg-secondary px-1.5 text-[10px] font-bold text-secondary-foreground"
								>{$unreadCount > 99 ? '99+' : $unreadCount}</span
							>
						{/if}
					</a>
				{/if}

				<a
					href={resolve(appointmentsNav.href as '/appointments')}
					class={cn(
						'group flex items-center gap-3 rounded-none px-4 py-3.5 text-base transition-colors lg:px-3 lg:py-2.5 lg:text-sm',
						isActive(appointmentsNav.href)
							? 'bg-ghost font-medium text-foreground'
							: 'text-muted-foreground hover:bg-ghost/60 hover:text-foreground'
					)}
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-[18px] w-[18px] shrink-0"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="2.25"
					>
						<path stroke-linecap="round" stroke-linejoin="round" d={appointmentsNav.icon} />
					</svg>
					<span class="flex-1">{appointmentsNav.label}</span>
					{#if $upcomingAppointmentCount > 0}
						<span
							class="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground"
							>{$upcomingAppointmentCount > 99 ? '99+' : $upcomingAppointmentCount}</span
						>
					{/if}
				</a>
			</div>

			<!-- Workspace -->
			<div class="mt-6">
				<a
					href={resolve('/workspace')}
					class={cn(
						'group flex items-center gap-3 rounded-none px-4 py-3.5 text-base transition-colors lg:px-3 lg:py-2.5 lg:text-sm',
						isActive('/workspace')
							? 'bg-ghost font-medium text-foreground'
							: 'text-muted-foreground hover:bg-ghost/60 hover:text-foreground'
					)}
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-[18px] w-[18px] shrink-0"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="2.25"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z"
						/>
					</svg>
					<span class="flex-1">Workspace</span>
				</a>
				<a
					href={resolve('/sheets')}
					class={cn(
						'group flex items-center gap-3 rounded-none px-4 py-3.5 text-base transition-colors lg:px-3 lg:py-2.5 lg:text-sm',
						isActive('/sheets')
							? 'bg-ghost font-medium text-foreground'
							: 'text-muted-foreground hover:bg-ghost/60 hover:text-foreground'
					)}
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-[18px] w-[18px] shrink-0"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="2.25"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0112 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M12 10.875v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125M10.875 12c-.621 0-1.125.504-1.125 1.125M12 10.875c-.621 0-1.125.504-1.125 1.125m0 0v1.5c0 .621.504 1.125 1.125 1.125m-1.125-2.625c0 .621.504 1.125 1.125 1.125m0 0c.621 0 1.125.504 1.125 1.125m-1.125-1.125c-.621 0-1.125.504-1.125 1.125m1.125-1.125c.621 0 1.125.504 1.125 1.125M12 15.375v-1.5"
						/>
					</svg>
					<span class="flex-1">Sheets</span>
				</a>
				<a
					href={resolve('/plan')}
					class={cn(
						'group flex items-center gap-3 rounded-none px-4 py-3.5 text-base transition-colors lg:px-3 lg:py-2.5 lg:text-sm',
						isActive('/plan')
							? 'bg-ghost font-medium text-foreground'
							: 'text-muted-foreground hover:bg-ghost/60 hover:text-foreground'
					)}
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-[18px] w-[18px] shrink-0"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="2.25"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M9 6.75V15m6-6v8.25m.503 3.498 4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 0 0-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0Z"
						/>
					</svg>
					<span class="flex-1">Plan</span>
				</a>
			</div>
		{/if}
	</nav>

	<!-- Bottom section -->
	<div class="px-5 pb-5">
		{#if isBuyer}
			<a
				href={resolve('/account')}
				class={cn(
					'group flex items-center gap-3 rounded-none px-4 py-3.5 text-base transition-colors lg:px-3 lg:py-2.5 lg:text-sm',
					isActive('/account')
						? 'bg-ghost font-medium text-foreground'
						: 'text-muted-foreground hover:bg-ghost/50 hover:text-foreground'
				)}
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-[18px] w-[18px] shrink-0"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="2.25"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21"
					/>
				</svg>
				<span>Account</span>
			</a>
		{:else if !isSales && (showOrg || isSingleBrandScoped)}
			<a
				href={resolve(brandLink as '/organization')}
				class={cn(
					'group flex items-center gap-3 rounded-none px-4 py-3.5 text-base transition-colors lg:px-3 lg:py-2.5 lg:text-sm',
					isActive(brandLink)
						? 'bg-ghost font-medium text-foreground'
						: 'text-muted-foreground hover:bg-ghost/50 hover:text-foreground'
				)}
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-[18px] w-[18px] shrink-0"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="2.25"
				>
					<path stroke-linecap="round" stroke-linejoin="round" d={orgNav.icon} />
				</svg>
				<span>{orgNav.label}</span>
			</a>
		{/if}

		<button
			onclick={() => (showHelp = true)}
			class="group flex w-full items-center gap-3 rounded-none px-4 py-3.5 text-base font-normal text-muted-foreground transition-colors hover:bg-ghost/50 hover:text-foreground lg:px-3 lg:py-2.5 lg:text-sm"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-[18px] w-[18px] shrink-0"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="2.25"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z"
				/>
			</svg>
			<span>Help & Support</span>
		</button>

		{#if showOrg}
			<a
				href={resolve('/organization/billing')}
				class="mt-3 flex w-full items-center justify-center rounded-none bg-accent px-4 py-3.5 text-base font-medium text-accent-foreground transition-colors lg:px-3 lg:py-2.5 lg:text-sm"
			>
				Upgrade to Pro
			</a>
		{/if}
	</div>
{/snippet}

{#if mode === 'overlay'}
	<OverlayPanel
		{open}
		{onclose}
		ariaLabel="Main navigation"
		side="left"
		width="100vw"
		closeOnEscape={false}
	>
		<aside class="flex h-full w-full flex-col overflow-y-auto bg-background text-foreground">
			{@render sidebarContent()}
		</aside>
	</OverlayPanel>
{:else}
	<aside class="flex h-full w-60 flex-col bg-background text-foreground">
		{@render sidebarContent()}
	</aside>
{/if}

<!-- Help & Support Drawer -->
{#if showHelp}
	<button
		class="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
		onclick={() => (showHelp = false)}
		aria-label="Close help panel"
	></button>
{/if}

<div
	class={cn(
		'fixed top-3 right-3 bottom-3 z-50 w-[calc(100vw-5rem)] overflow-hidden rounded-none border bg-background shadow-xl transition-transform duration-300 ease-in-out sm:w-[28rem]',
		showHelp ? 'translate-x-0' : 'translate-x-[calc(100%+1rem)]'
	)}
>
	<div class="flex h-full flex-col">
		<div class="flex items-center justify-between border-b px-5 py-4">
			<h2 class="text-lg font-semibold">Help & Support</h2>
			<button
				onclick={() => (showHelp = false)}
				class="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
				aria-label="Close help"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-5 w-5"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="2.25"
				>
					<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
				</svg>
			</button>
		</div>

		<div class="flex-1 space-y-6 overflow-y-auto px-5 py-5">
			<div class="space-y-2">
				<h3 class="text-sm font-medium">Getting Started</h3>
				<p class="text-sm text-muted-foreground">
					New to Threadline? Check out our guides to get up and running quickly.
				</p>
				<button disabled class="mt-1 text-sm font-medium text-primary opacity-60"
					>View guides (Coming soon)</button
				>
			</div>

			<div class="h-px bg-border"></div>

			<div class="space-y-2">
				<h3 class="text-sm font-medium">Documentation</h3>
				<p class="text-sm text-muted-foreground">
					Browse our full documentation for in-depth information on features and workflows.
				</p>
				<button disabled class="mt-1 text-sm font-medium text-primary opacity-60"
					>Open docs (Coming soon)</button
				>
			</div>

			<div class="h-px bg-border"></div>

			<div class="space-y-2">
				<h3 class="text-sm font-medium">Contact Support</h3>
				<p class="text-sm text-muted-foreground">
					Need help with something specific? Reach out to our support team and we'll get back to you
					within 24 hours.
				</p>
				<button disabled class="mt-1 text-sm font-medium text-primary opacity-60"
					>Send a message (Coming soon)</button
				>
			</div>

			<div class="h-px bg-border"></div>

			<div class="space-y-4">
				<h3 class="text-sm font-medium">Keyboard Shortcuts</h3>
				<div class="space-y-3 text-sm text-muted-foreground">
					<p class="text-xs font-medium tracking-wider text-muted-foreground/60 uppercase">
						General
					</p>
					<div class="flex items-center justify-between">
						<span>Command bar</span>
						<div class="flex items-center gap-1">
							<kbd class={kbdClass}>⌘</kbd><kbd class={kbdClass}>K</kbd>
						</div>
					</div>
					<div class="flex items-center justify-between">
						<span>Toggle sidebar</span>
						<div class="flex items-center gap-1">
							<kbd class={kbdClass}>⌘</kbd><kbd class={kbdClass}>/</kbd>
						</div>
					</div>
					<div class="flex items-center justify-between">
						<span>Stitch</span>
						<div class="flex items-center gap-1">
							<kbd class={kbdClass}>/</kbd><kbd class={kbdClass}>K</kbd>
						</div>
					</div>

					<p class="pt-2 text-xs font-medium tracking-wider text-muted-foreground/60 uppercase">
						Create
					</p>
					<div class="flex items-center justify-between">
						<span>New order</span>
						<div class="flex items-center gap-1">
							<kbd class={kbdClass}>⌘</kbd><kbd class={kbdClass}>O</kbd>
						</div>
					</div>
					<div class="flex items-center justify-between">
						<span>New account</span>
						<div class="flex items-center gap-1">
							<kbd class={kbdClass}>⌘</kbd><kbd class={kbdClass}>A</kbd>
						</div>
					</div>
					<div class="flex items-center justify-between">
						<span>New brand</span>
						<div class="flex items-center gap-1">
							<kbd class={kbdClass}>⌘</kbd><kbd class={kbdClass}>B</kbd>
						</div>
					</div>
					<div class="flex items-center justify-between">
						<span>New appointment</span>
						<div class="flex items-center gap-1">
							<kbd class={kbdClass}>Shift</kbd><kbd class={kbdClass}>⌘</kbd><kbd class={kbdClass}
								>A</kbd
							>
						</div>
					</div>

					<p class="pt-2 text-xs font-medium tracking-wider text-muted-foreground/60 uppercase">
						Navigate
					</p>
					<div class="flex items-center justify-between">
						<span>Orders</span>
						<kbd class={kbdClass}>O</kbd>
					</div>
					<div class="flex items-center justify-between">
						<span>Accounts</span>
						<kbd class={kbdClass}>A</kbd>
					</div>
					<div class="flex items-center justify-between">
						<span>Brands</span>
						<kbd class={kbdClass}>B</kbd>
					</div>
					<div class="flex items-center justify-between">
						<span>Reports</span>
						<kbd class={kbdClass}>R</kbd>
					</div>
					<div class="flex items-center justify-between">
						<span>Inbox</span>
						<div class="flex items-center gap-1">
							<kbd class={kbdClass}>Shift</kbd><kbd class={kbdClass}>I</kbd>
						</div>
					</div>
					<div class="flex items-center justify-between">
						<span>Appointments</span>
						<div class="flex items-center gap-1">
							<kbd class={kbdClass}>Shift</kbd><kbd class={kbdClass}>A</kbd>
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>
</div>
