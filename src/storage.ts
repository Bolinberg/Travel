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

let warned = false;

/** 保存全部行程。空间不足时先清掉可重新下载的缓存（路线、维基）再试，仍失败则提醒一次。 */
export function saveStore(store: Store): boolean {
  const data = JSON.stringify(store);
  try {
    localStorage.setItem(KEY, data);
    return true;
  } catch {
    try {
      for (const k of Object.keys(localStorage)) {
        if (k.startsWith('route') || k.startsWith('wiki:')) localStorage.removeItem(k);
      }
      localStorage.setItem(KEY, data);
      return true;
    } catch {
      if (!warned && typeof alert === 'function') {
        warned = true;
        alert('浏览器存储空间不足或不可用，最新修改可能没有保存。请到「方案」删除一些旧版本，或在「设置」导出备份。');
      }
      return false;
    }
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
