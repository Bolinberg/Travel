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

/* ---------- 地点查询 ---------- */

export async function geocode(name: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const r = await fetch(
      'https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(name),
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

/** 行程中所有还没有坐标的地点名 */
export function missingPlaces(trip: Trip): string[] {
  const names = trip.days.flatMap((d) => [d.from, ...d.stops, d.to]).map((n) => n.trim()).filter(Boolean);
  return [...new Set(names.filter((n) => !findPlace(trip, n)))];
}

/** 依次为多个地点查坐标（Nominatim 要求每秒不超过 1 次） */
export async function geocodeAll(
  names: string[],
  onFound: (name: string, hit: { lat: number; lng: number } | null) => void,
): Promise<void> {
  for (let i = 0; i < names.length; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, 1100));
    onFound(names[i], await geocode(names[i]));
  }
}
