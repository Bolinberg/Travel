import { useEffect, useState } from 'react';
import type { Place, Trip } from './types';

/*
 * 在线服务（运行时在用户设备上请求，结果缓存在 localStorage）：
 * - 维基百科 REST API：景点照片与简介
 * - OSRM 公共路由：真实驾车路线、里程、时长
 * - Nominatim (OpenStreetMap)：为新增地点查坐标
 * 离线或请求失败时退化为直线连线 / 无图。
 */

function cacheGet<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

function cacheSet(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 存储满或不可用时忽略 */
  }
}

export function findPlace(trip: Trip, name: string): Place | undefined {
  const n = name.trim().toLowerCase();
  return trip.places.find((p) => p.name.toLowerCase() === n);
}

/* ---------- 维基百科 ---------- */

export interface WikiInfo {
  thumb?: string;
  extract?: string;
  url?: string;
}

const wikiMemo = new Map<string, Promise<WikiInfo | null>>();

export function fetchWiki(title: string): Promise<WikiInfo | null> {
  const key = 'wiki:' + title;
  const cached = cacheGet<WikiInfo>(key);
  if (cached) return Promise.resolve(cached);
  if (!wikiMemo.has(title)) {
    const url = 'https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(title.replace(/ /g, '_'));
    wikiMemo.set(
      title,
      fetch(url)
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
          if (!j) return null;
          const info: WikiInfo = {
            thumb: j.thumbnail?.source,
            extract: j.extract,
            url: j.content_urls?.desktop?.page,
          };
          cacheSet(key, info);
          return info;
        })
        .catch(() => null),
    );
  }
  return wikiMemo.get(title)!;
}

export function useWiki(title?: string): WikiInfo | null {
  const [info, setInfo] = useState<WikiInfo | null>(null);
  useEffect(() => {
    setInfo(null);
    if (!title) return;
    let alive = true;
    fetchWiki(title).then((i) => alive && setInfo(i));
    return () => {
      alive = false;
    };
  }, [title]);
  return info;
}

/* ---------- 路线 ---------- */

export interface RouteInfo {
  path: [number, number][];
  km: number;
  hours: number;
}

export async function fetchRoute(points: Place[]): Promise<RouteInfo | null> {
  if (points.length < 2) return null;
  const coords = points.map((p) => `${p.lng.toFixed(4)},${p.lat.toFixed(4)}`).join(';');
  const key = 'route:' + coords;
  const cached = cacheGet<RouteInfo>(key);
  if (cached) return cached;
  try {
    const r = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${coords}?overview=simplified&geometries=geojson`,
    );
    if (!r.ok) return null;
    const j = await r.json();
    const route = j.routes?.[0];
    if (!route) return null;
    const info: RouteInfo = {
      path: route.geometry.coordinates.map(([lng, lat]: [number, number]) => [lat, lng]),
      km: Math.round(route.distance / 1000),
      hours: Math.round((route.duration / 3600) * 10) / 10,
    };
    cacheSet(key, info);
    return info;
  } catch {
    return null;
  }
}

/* ---------- 地点查询 ---------- */

export async function geocode(name: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const r = await fetch(
      'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=au&q=' + encodeURIComponent(name),
    );
    if (!r.ok) return null;
    const [hit] = await r.json();
    return hit ? { lat: Number(hit.lat), lng: Number(hit.lon) } : null;
  } catch {
    return null;
  }
}

/* ---------- 外部链接 ---------- */

export const links = {
  googleMaps: (q: string) => 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q),
  tripadvisor: (q: string) => 'https://www.tripadvisor.com.au/Search?q=' + encodeURIComponent(q),
  booking: (town: string, checkin: string, checkout: string, adults: number) =>
    'https://www.booking.com/searchresults.html?' +
    new URLSearchParams({ ss: town, checkin, checkout, group_adults: String(adults), no_rooms: '1' }).toString(),
};
