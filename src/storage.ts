import type { Trip } from './types';
import { migrateTrip } from './defaultTrip';

const KEY = 'travel-planner.v2';
const OLD_KEY = 'travel-planner.trip.v1';

export interface Store {
  activeId: string;
  trips: Trip[];
}

export function loadStore(): Store | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as Store;
      const trips = (s.trips ?? []).map(migrateTrip).filter((t): t is Trip => !!t);
      if (!trips.length) return null;
      const activeId = trips.some((t) => t.id === s.activeId) ? s.activeId : trips[0].id;
      return { activeId, trips };
    }
    // 旧版只存一份行程
    const old = localStorage.getItem(OLD_KEY);
    const t = old ? migrateTrip(JSON.parse(old)) : null;
    return t ? { activeId: t.id, trips: [t] } : null;
  } catch {
    return null;
  }
}

export function saveStore(store: Store): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
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
