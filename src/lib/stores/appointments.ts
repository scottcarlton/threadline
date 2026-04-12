import { writable } from 'svelte/store';

export const upcomingAppointmentCount = writable(0);

let polling = false;

export async function fetchUpcomingCount() {
	try {
		const res = await fetch('/api/appointments/upcoming-count');
		if (res.ok) {
			const data = await res.json();
			upcomingAppointmentCount.set(data.count ?? 0);
		}
	} catch {
		// silently fail
	}
}

export function startAppointmentPolling(intervalMs = 60000) {
	if (polling) return;
	polling = true;
	fetchUpcomingCount();
	const timer = setInterval(fetchUpcomingCount, intervalMs);
	return () => {
		clearInterval(timer);
		polling = false;
	};
}
