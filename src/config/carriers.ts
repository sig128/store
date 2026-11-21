/**
 * Carriers offered when entering tracking. `trackingUrl` templates are a
 * convenience — verify them with your carrier agreement; any carrier can also be
 * entered with a pasted tracking URL.
 */
export const CARRIERS: { id: string; name: string; trackingUrl: string | null }[] = [
  { id: "posten-bring", name: "Posten/Bring", trackingUrl: "https://sporing.posten.no/sporing/{tracking}" },
  { id: "postnord", name: "PostNord", trackingUrl: null },
  { id: "helthjem", name: "Helthjem", trackingUrl: null },
  { id: "dhl", name: "DHL", trackingUrl: null },
  { id: "other", name: "Other", trackingUrl: null },
];

export function trackingUrlFor(carrierId: string, tracking: string): string | null {
  const c = CARRIERS.find((x) => x.id === carrierId);
  return c?.trackingUrl ? c.trackingUrl.replace("{tracking}", encodeURIComponent(tracking.trim())) : null;
}
