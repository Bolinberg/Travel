import type { Day, Mode, Place, Trip } from './types';
import { findPlace } from './geo';
import { mapProxyBase } from './sync';

/*
 * 交通方式与路线：
 * - 每天有默认交通方式（day.mode，默认自驾），每一段可单独指定（day.legModes，按「到达点名称」记录，
 *   这样途经点调整顺序后不会错位）。
 * - 自驾/步行/骑行用 OSRM 计算真实道路（FOSSGIS routing.openstreetmap.de，自驾失败时回退 project-osrm.org）；
 *   公交火车、轮渡、飞机没有免费的路线服务，画示意线（飞机为大圆弧线），并明确标注。
 */

export const MODES: Record<Mode, { label: string; icon: string; profile?: 'car' | 'foot' | 'bike'; gmaps?: string; kmh: number }> = {
  drive: { label: '自驾', icon: '🚗', profile: 'car', gmaps: 'driving', kmh: 80 },
  walk: { label: '步行', icon: '🚶', profile: 'foot', gmaps: 'walking', kmh: 4.5 },
  bike: { label: '骑行', icon: '🚲', profile: 'bike', gmaps: 'bicycling', kmh: 15 },
  transit: { label: '公交/火车/电车', icon: '🚆', gmaps: 'transit', kmh: 40 },
  ferry: { label: '轮渡', icon: '⛴️', kmh: 30 },
  flight: { label: '飞机', icon: '✈️', kmh: 600 },
};
export const MODE_KEYS = Object.keys(MODES) as Mode[];

export const dayMode = (d: Day): Mode => d.mode ?? 'drive';

/** 当天按顺序经过的地点名称 */
export function dayPointNames(d: Day): string[] {
  const names = [d.from, ...d.stops, d.to].map((n) => n.trim()).filter(Boolean);
  return names.filter((n, i) => i === 0 || n.toLowerCase() !== names[i - 1].toLowerCase());
}

/** 到达某点的这一段用什么交通方式 */
export function legMode(d: Day, toName: string): Mode {
  return d.legModes?.[toName.trim()] ?? dayMode(d);
}

export interface Leg {
  from: Place;
  to: Place;
  mode: Mode;
}

/** 当天各段（缺坐标的点跳过，连接前后有坐标的点） */
export function dayLegs(trip: Trip, d: Day): Leg[] {
  const pts = dayPointNames(d)
    .map((n) => ({ n, p: findPlace(trip, n) }))
    .filter((x): x is { n: string; p: Place } => !!x.p);
  const legs: Leg[] = [];
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].p === pts[i - 1].p) continue;
    legs.push({ from: pts[i - 1].p, to: pts[i].p, mode: legMode(d, pts[i].n) });
  }
  return legs;
}

/** 当天交通方式概要，如「🚗 自驾」或「🚗 自驾 + 🚆 公交」 */
export function modeSummary(d: Day): string {
  const names = dayPointNames(d);
  const used = new Set<Mode>(names.slice(1).map((n) => legMode(d, n)));
  if (!used.size) used.add(dayMode(d));
  return [...used].map((m) => `${MODES[m].icon} ${MODES[m].label}`).join(' + ');
}

/** 当天是否以自驾为主（用于油费） */
export function isDriveDay(d: Day): boolean {
  return dayMode(d) === 'drive';
}

/* ---------- 几何 ---------- */

const R = 6371;
const rad = (x: number) => (x * Math.PI) / 180;

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** 大圆弧线上的点（飞机航线） */
export function greatCircle(a: Place, b: Place, n = 32): [number, number][] {
  const φ1 = rad(a.lat), λ1 = rad(a.lng), φ2 = rad(b.lat), λ2 = rad(b.lng);
  const d = 2 * Math.asin(Math.sqrt(Math.sin((φ2 - φ1) / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin((λ2 - λ1) / 2) ** 2));
  if (d === 0) return [[a.lat, a.lng]];
  const out: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
    const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
    const z = A * Math.sin(φ1) + B * Math.sin(φ2);
    out.push([(Math.atan2(z, Math.sqrt(x * x + y * y)) * 180) / Math.PI, (Math.atan2(y, x) * 180) / Math.PI]);
  }
  return out;
}

/* ---------- 路线服务 ---------- */

export interface RoutedSegment {
  mode: Mode;
  path: [number, number][];
  km: number;
  hours: number;
  /** true = 真实道路；false = 示意线 */
  routed: boolean;
}

function cacheGet<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}
function cacheSet(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* 忽略 */
  }
}

// 公共路线服务有频率限制：最多同时 2 个请求
let active = 0;
const waiting: (() => void)[] = [];
async function limited<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= 2) await new Promise<void>((r) => waiting.push(r));
  active++;
  try {
    return await fn();
  } finally {
    active--;
    waiting.shift()?.();
  }
}

const PUBLIC_ENDPOINTS: Record<'car' | 'foot' | 'bike', string[]> = {
  car: ['https://routing.openstreetmap.de/routed-car/route/v1/driving/', 'https://router.project-osrm.org/route/v1/driving/'],
  foot: ['https://routing.openstreetmap.de/routed-foot/route/v1/driving/'],
  bike: ['https://routing.openstreetmap.de/routed-bike/route/v1/driving/'],
};

// 随页面一起发布的预算路线（public/route-cache.json），不能联网时也能画真实道路
let bundled: Promise<Record<string, { path: [number, number][]; km: number; hours: number }>> | null = null;
function bundledRoutes() {
  bundled ??= fetch('./route-cache.json')
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}));
  return bundled;
}

export async function fetchRoadRoute(
  points: Place[],
  profile: 'car' | 'foot' | 'bike',
): Promise<{ path: [number, number][]; km: number; hours: number } | null> {
  if (points.length < 2) return null;
  const coords = points.map((p) => `${p.lng.toFixed(5)},${p.lat.toFixed(5)}`).join(';');
  const key = `route3:${profile}:${coords}`;
  const cached = cacheGet<{ path: [number, number][]; km: number; hours: number }>(key);
  if (cached) return cached;
  const pre = (await bundledRoutes())[key];
  if (pre) return pre;
  // 有自己的后端时先走后端代理（同源访问、服务端缓存），再直连公共服务
  const proxy = mapProxyBase();
  const endpoints = [...(proxy ? [`${proxy}/api/map/route/${profile}/`] : []), ...PUBLIC_ENDPOINTS[profile]];
  for (const base of endpoints) {
    try {
      const r = await limited(() =>
        fetch(`${base}${coords}?overview=simplified&geometries=geojson`, { signal: AbortSignal.timeout(15000) }),
      );
      if (!r.ok) continue;
      const j = await r.json();
      const route = j.routes?.[0];
      if (j.code !== 'Ok' || !route) continue;
      const info = {
        path: route.geometry.coordinates.map(([lng, lat]: [number, number]) => [lat, lng] as [number, number]),
        km: Math.round(route.distance / 1000),
        hours: Math.round((route.duration / 3600) * 10) / 10,
      };
      cacheSet(key, info);
      return info;
    } catch {
      /* 换下一个服务 */
    }
  }
  return null;
}

/** 把连续、同一种可算路的交通方式合并成一次请求 */
export function groupLegs(legs: Leg[]): { mode: Mode; points: Place[] }[] {
  const groups: { mode: Mode; points: Place[] }[] = [];
  for (const l of legs) {
    const g = groups[groups.length - 1];
    if (g && g.mode === l.mode && MODES[l.mode].profile && g.points[g.points.length - 1] === l.from) {
      g.points.push(l.to);
    } else {
      groups.push({ mode: l.mode, points: [l.from, l.to] });
    }
  }
  return groups;
}

/** 示意线（无路线服务的交通方式，或请求失败时） */
export function sketchSegment(mode: Mode, points: Place[]): RoutedSegment {
  let km = 0;
  for (let i = 1; i < points.length; i++) km += haversineKm(points[i - 1], points[i]);
  const path =
    mode === 'flight'
      ? points.slice(1).flatMap((p, i) => greatCircle(points[i], p))
      : points.map((p) => [p.lat, p.lng] as [number, number]);
  // 地面方式按直线距离 × 1.3 估算实际路程
  const factor = mode === 'flight' || mode === 'ferry' ? 1 : 1.3;
  km = Math.round(km * factor);
  const hours = Math.round((km / MODES[mode].kmh + (mode === 'flight' ? 2 : 0)) * 10) / 10;
  return { mode, path, km, hours, routed: false };
}

export async function routeGroup(g: { mode: Mode; points: Place[] }): Promise<RoutedSegment> {
  const profile = MODES[g.mode].profile;
  if (profile) {
    const r = await fetchRoadRoute(g.points, profile);
    if (r) return { mode: g.mode, ...r, routed: true };
  }
  return sketchSegment(g.mode, g.points);
}

export interface DayRoute {
  segments: RoutedSegment[];
  km: number;
  hours: number;
  /** 应能算出真实道路、却失败了的段数 */
  failed: number;
}

export async function routeDay(trip: Trip, d: Day): Promise<DayRoute> {
  const groups = groupLegs(dayLegs(trip, d));
  const segments = await Promise.all(groups.map(routeGroup));
  return {
    segments,
    km: segments.reduce((s, x) => s + x.km, 0),
    hours: Math.round(segments.reduce((s, x) => s + x.hours, 0) * 10) / 10,
    failed: segments.filter((s) => !s.routed && MODES[s.mode].profile).length,
  };
}

/* ---------- 顺路排序 ---------- */

function pathLen(pts: { lat: number; lng: number }[]): number {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += haversineKm(pts[i - 1], pts[i]);
  return s;
}

/**
 * 按顺路重排途经点：≤8 个有坐标的途经点穷举，最多再用就近插入。
 * 没有坐标的途经点保持在末尾（顺序不变）。
 */
export function orderStops(trip: Trip, d: Day): string[] {
  const from = findPlace(trip, d.from);
  const to = findPlace(trip, d.to);
  const stops = d.stops.map((s) => s.trim()).filter(Boolean);
  const known = stops.filter((s) => findPlace(trip, s));
  const unknown = stops.filter((s) => !findPlace(trip, s));
  if (!from || !to || known.length < 2) return [...known, ...unknown];
  const P = known.map((s) => findPlace(trip, s)!);

  if (known.length <= 8) {
    let best = known.map((_, i) => i);
    let bestLen = Infinity;
    const perm = (arr: number[], rest: number[]) => {
      if (!rest.length) {
        const len = pathLen([from, ...arr.map((i) => P[i]), to]);
        if (len < bestLen) {
          bestLen = len;
          best = arr;
        }
        return;
      }
      for (let k = 0; k < rest.length; k++) perm([...arr, rest[k]], [...rest.slice(0, k), ...rest.slice(k + 1)]);
    };
    perm([], known.map((_, i) => i));
    return [...best.map((i) => known[i]), ...unknown];
  }
  let order: number[] = [];
  for (let i = 0; i < known.length; i++) order = insertAt(order, i, (o) => pathLen([from, ...o.map((k) => P[k]), to]));
  return [...order.map((i) => known[i]), ...unknown];
}

function insertAt(order: number[], item: number, cost: (o: number[]) => number): number[] {
  let best = [...order, item];
  let bestCost = cost(best);
  for (let pos = 0; pos < order.length; pos++) {
    const o = [...order.slice(0, pos), item, ...order.slice(pos)];
    const c = cost(o);
    if (c < bestCost) {
      bestCost = c;
      best = o;
    }
  }
  return best;
}

/** 把一个新地点插到当天途经点中最顺路的位置 */
export function insertStop(trip: Trip, d: Day, name: string): string[] {
  const stops = d.stops.map((s) => s.trim()).filter(Boolean);
  const p = findPlace(trip, name);
  const from = findPlace(trip, d.from);
  const to = findPlace(trip, d.to);
  if (!p || !from || !to) return [...stops, name];
  let best = [...stops, name];
  let bestCost = Infinity;
  for (let pos = 0; pos <= stops.length; pos++) {
    const o = [...stops.slice(0, pos), name, ...stops.slice(pos)];
    const pts = [from, ...o.map((s) => findPlace(trip, s)).filter((x): x is Place => !!x), to];
    const c = pathLen(pts);
    if (c < bestCost) {
      bestCost = c;
      best = o;
    }
  }
  return best;
}

/** Google 地图导航链接：带途经点和交通方式 */
export function googleDirections(d: Day): string {
  const names = dayPointNames(d);
  const p = new URLSearchParams({ api: '1', origin: names[0] ?? d.from, destination: names[names.length - 1] ?? d.to });
  const gm = MODES[dayMode(d)].gmaps;
  if (gm) p.set('travelmode', gm);
  const wp = names.slice(1, -1);
  // Google 公交模式不支持途经点
  if (wp.length && gm !== 'transit') p.set('waypoints', wp.join('|'));
  return 'https://www.google.com/maps/dir/?' + p.toString();
}
