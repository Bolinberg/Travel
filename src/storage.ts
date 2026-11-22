import type { Trip } from './types';

const KEY = 'travel-planner.trip.v1';

export function loadTrip(): Trip | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const t = JSON.parse(raw);
    return isTrip(t) ? t : null;
  } catch {
    return null;
  }
}

export function saveTrip(trip: Trip): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(trip));
  } catch {
    /* 隐私模式等情况下忽略 */
  }
}

export function isTrip(t: unknown): t is Trip {
  const o = t as Trip;
  return !!o && o.version === 1 && Array.isArray(o.days) && Array.isArray(o.expenses) && Array.isArray(o.checklist);
}

export function downloadJson(trip: Trip): void {
  const blob = new Blob([JSON.stringify(trip, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${trip.name || 'trip'}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}
