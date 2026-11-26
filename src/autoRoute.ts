import type { Day, Place, Trip } from './types';
import { findPlace, geocode } from './geo';
import { haversineKm, routeDay } from './route';

type Update = (mutate: (draft: Trip) => void) => void;

/** 决定里程和车程的那组输入：地址 + 交通方式 */
export const routeKey = (d: Day) =>
  JSON.stringify([d.from.trim(), ...d.stops.map((s) => s.trim()).filter(Boolean), d.to.trim(), d.mode ?? 'drive', d.legModes ?? {}]);

const inAustralia = (p: { lat: number; lng: number }) => p.lat < -9 && p.lat > -45 && p.lng > 112 && p.lng < 155;
const shortName = (place: string) =>
  place.replace(/,?\s+(VIC|NSW|QLD|SA|WA|TAS|NT|ACT)$/i, '').replace(/,\s*(Australia|New Zealand)$/i, '');

export interface AutoRouteResult {
  km: number;
  hours: number;
  /** 没能走真实道路、按直线估算的段数 */
  estimated: number;
  /** 查不到位置的地址 */
  missing: string[];
  /** 自动改了当天的交通方式 */
  modeChanged?: Day['mode'];
}

/** 按地点间的直线距离判断：步行 / 骑车走不了的距离改成自驾；同城 3 km 内来回改成步行 */
export function autoMode(trip: Trip, day: Day): Day['mode'] {
  const pts = [day.from, ...day.stops, day.to].map((n) => findPlace(trip, n)).filter((p): p is Place => !!p);
  let longest = 0;
  for (let i = 1; i < pts.length; i++) longest = Math.max(longest, haversineKm(pts[i - 1], pts[i]));
  const mode = day.mode ?? 'drive';
  if ((mode === 'walk' && longest > 5) || (mode === 'bike' && longest > 25)) return 'drive';
  if (mode === 'drive' && pts.length >= 2 && day.from.trim() === day.to.trim() && longest < 3 && !Object.keys(day.legModes ?? {}).length) return 'walk';
  return day.mode;
}

/**
 * 只给地址，自动完成其余的：查坐标（加进地图）→ 按真实道路算里程和车程 → 写回这一天。
 * 地址在计算过程中又被改了，就不写回（以最新的为准）。
 */
export async function autoRouteDay(
  trip: Trip,
  day: Day,
  update: Update,
  onStatus: (s: string) => void = () => {},
): Promise<AutoRouteResult | null> {
  const key = routeKey(day);
  const names = [...new Set([day.from, ...day.stops, day.to].map((n) => n.trim()).filter(Boolean))];
  if (!day.from.trim() || !day.to.trim()) return null;

  // 1. 查坐标：行程里的地点都在澳洲时，只在澳洲范围内找，避免查到别国的同名小镇
  const country = trip.places.length && trip.places.every(inAustralia) ? 'au' : undefined;
  const found: Place[] = [];
  const missing: string[] = [];
  const unknown = names.filter((n) => !findPlace(trip, n));
  for (let i = 0; i < unknown.length; i++) {
    const name = unknown[i];
    onStatus(`正在查「${shortName(name)}」的位置…`);
    const hit = await geocode(name, country);
    if (hit) found.push({ name, label: shortName(name), ...hit });
    else missing.push(name);
  }
  if (found.length) {
    update((t) => {
      for (const p of found) if (!findPlace(t, p.name)) t.places.push(p);
    });
  }

  // 2. 交通方式也自动定：地点相距较远却设成步行 / 骑车 → 改成自驾；同城短距离来回 → 改成步行
  const withPlaces: Trip = { ...trip, places: [...trip.places, ...found] };
  const mode = autoMode(withPlaces, day);
  const routed: Day = mode === (day.mode ?? 'drive') ? day : { ...day, mode };

  // 3. 按真实道路算里程和车程
  onStatus('正在按真实道路计算里程和时间…');
  // 有地址查不到位置：不写回（只算了一部分路，会误导），等地址改好再算
  if (missing.length) return { km: 0, hours: 0, estimated: 0, missing };
  const r = await routeDay(withPlaces, routed);
  if (!r.segments.length) return { km: 0, hours: 0, estimated: 0, missing };

  update((t) => {
    const d = t.days.find((x) => x.id === day.id);
    if (!d || d.manualRoute || routeKey(d) !== key) return;
    if (routed.mode !== d.mode) d.mode = routed.mode;
    d.km = r.km;
    d.driveHours = r.hours;
    d.routeKey = routeKey(d);
  });
  return { km: r.km, hours: r.hours, estimated: r.failed, missing, modeChanged: routed.mode !== day.mode ? routed.mode : undefined };
}

/** 这一天需要重新算里程车程吗（地址改过、还没算过、或有地址还没上地图） */
export function needsRoute(trip: Trip, d: Day): boolean {
  if (d.manualRoute || !d.from.trim() || !d.to.trim() || d.from.trim() === d.to.trim()) return false;
  if (!d.km) return true;
  if (d.routeKey !== undefined && d.routeKey !== routeKey(d)) return true;
  return [d.from, ...d.stops, d.to].some((n) => n.trim() && !findPlace(trip, n));
}
