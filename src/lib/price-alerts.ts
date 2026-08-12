
/**
 * Price alert utilities (issue #294).
 * Detects when a bond yield crosses a user-configured threshold and
 * persists alerts in localStorage so they survive reloads.
 */
export type AlertDirection = "above" | "below";

export interface PriceAlert {
  id: string;
  bondId: string;
  threshold: number;
  direction: AlertDirection;
  triggered: boolean;
  lastPrice: number | null;
}

const STORAGE_KEY = "heliobond-price-alerts";

export function evaluatePriceAlerts(
  alerts: PriceAlert[],
  price: number,
): PriceAlert[] {
  return alerts.map((alert) => {
    const crossed =
      alert.direction === "above"
        ? price >= alert.threshold
        : price <= alert.threshold;
    if (crossed && !alert.triggered) {
      return { ...alert, triggered: true, lastPrice: price };
    }
    return alert;
  });
}

export function newlyTriggered(
  before: PriceAlert[],
  after: PriceAlert[],
): PriceAlert[] {
  const beforeIds = new Set(
    before.filter((a) => a.triggered).map((a) => a.id),
  );
  return after.filter((a) => a.triggered && !beforeIds.has(a.id));
}

export function loadAlerts(): PriceAlert[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PriceAlert[]) : [];
  } catch {
    return [];
  }
}

export function saveAlert(alert: PriceAlert): void {
  const alerts = loadAlerts().filter((a) => a.id !== alert.id);
  alerts.push(alert);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(alerts));
}

export function removeAlert(id: string): void {
  const alerts = loadAlerts().filter((a) => a.id !== id);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(alerts));
}

export function makeAlertId(bondId: string, direction: AlertDirection): string {
  return [bondId, direction, Date.now()].join("-");
}
