export const CARRIERS = ['FedEx', 'UPS', 'USPS', 'Other'] as const;
export type Carrier = (typeof CARRIERS)[number];

export const SERVICE_LEVELS = ['Ground', 'Next Day Air', 'Overnight'] as const;
export type ServiceLevel = (typeof SERVICE_LEVELS)[number];

const TRACKING_URLS: Partial<Record<Carrier, (trackingNumber: string) => string>> = {
	UPS: (t) => `https://www.ups.com/track?tracknum=${encodeURIComponent(t)}`,
	FedEx: (t) => `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(t)}`,
	USPS: (t) => `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(t)}`,
	DHL: (t) => `https://www.dhl.com/us-en/home/tracking.html?tracking-id=${encodeURIComponent(t)}`
};

export function trackingUrl(carrier: string | null, trackingNumber: string | null): string | null {
	if (!carrier || !trackingNumber) return null;
	const builder = TRACKING_URLS[carrier as Carrier];
	return builder ? builder(trackingNumber) : null;
}
