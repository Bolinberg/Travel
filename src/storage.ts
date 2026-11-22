import type { Trip } from './types';
import { migrateTrip } from './defaultTrip';

const KEY = 'travel-planner.trip.v1';

export function loadTrip(): Trip | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return migrateTrip(JSON.parse(raw));
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

export { migrateTrip };

export function downloadJson(trip: Trip): void {
  const blob = new Blob([JSON.stringify(trip, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${trip.name || 'trip'}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}
