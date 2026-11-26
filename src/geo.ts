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

// 维基百科对同时大量请求会返回 429：最多同时 2 个
let wikiActive = 0;
const wikiQueue: (() => void)[] = [];
async function wikiSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (wikiActive >= 2) await new Promise<void>((r) => wikiQueue.push(r));
  wikiActive++;
  try {
    return await fn();
  } finally {
    wikiActive--;
    wikiQueue.shift()?.();
  }
}

/** 按维基媒体的 API 礼仪标明应用身份；遇到 429 限流按 Retry-After 退避重试 */
async function fetchWikiWithRetry(url: string): Promise<Response | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(url, { headers: { 'Api-User-Agent': 'TravelPlannerFamily/1.0 (family road-trip planner)' } });
    if (r.status !== 429) return r;
    const wait = Math.min(10, Number(r.headers.get('Retry-After')) || 2 ** (attempt + 1));
    await new Promise((res) => setTimeout(res, wait * 1000));
  }
  return null;
}

export function fetchWiki(title: string): Promise<WikiInfo | null> {
  const key = 'wiki:' + title;
  const cached = cacheGet<WikiInfo>(key);
  if (cached) return Promise.resolve(cached);
  if (!wikiMemo.has(title)) {
    const url = 'https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(title.replace(/ /g, '_'));
    wikiMemo.set(
      title,
      wikiSlot(() => fetchWikiWithRetry(url))
        .then((r) => (r && r.ok ? r.json() : null))
        .then((j) => {
          if (!j) {
            wikiMemo.delete(title); // 失败不缓存，下次展开时再试
            return null;
          }
          const info: WikiInfo = {
            thumb: j.thumbnail?.source,
            extract: j.extract,
            url: j.content_urls?.desktop?.page,
          };
          cacheSet(key, info);
          return info;
        })
        .catch(() => {
          wikiMemo.delete(title);
          return null;
        }),
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

/** country：两位国家代码（如 au），行程都在同一个国家时用来避免查到别国的同名地点 */
const AU_STATES: Record<string, string> = {
  VIC: 'Victoria',
  SA: 'South Australia',
  NSW: 'New South Wales',
  QLD: 'Queensland',
  WA: 'Western Australia',
  TAS: 'Tasmania',
  NT: 'Northern Territory',
  ACT: 'Australian Capital Territory',
};

/**
 * 一个地址的几种写法，从精确到宽松：
 * 「2 Bridge St, Murray Bridge SA 5253」→ 原样 → 州名写全 → 去掉门牌号 → 去掉邮编 → 只留城镇。
 * 免费的地点查询服务常常认不出带州名缩写、邮编、门牌号的完整地址，所以一种查不到就换下一种。
 */
export function geocodeCandidates(name: string): string[] {
  const raw = name.trim().replace(/\s+/g, ' ');
  const expand = (x: string) => {
    let y = x.replace(/\b(VIC|SA|NSW|QLD|WA|TAS|NT|ACT)\b/g, (m) => AU_STATES[m] ?? m);
    if (y !== x && !/,\s*australia\s*$/i.test(y)) y += ', Australia';
    return y.replace(/\s+,/g, ',');
  };
  const noNumber = raw.replace(/^(unit|shop|lot)?\s*\d+[a-z]?(\s*[-/]\s*\d+[a-z]?)?\s+/i, '');
  const noPost = (x: string) => x.replace(/,?\s*\b\d{4}\b\s*$/, '').replace(/\b\d{4}\b(?=,?\s*(australia)?$)/i, '').trim().replace(/,\s*$/, '');
  const parts = raw.split(',').map((x) => x.trim()).filter(Boolean);
  const town = parts.length > 1 ? parts.slice(1).join(', ') : '';
  const list = [raw, expand(raw), expand(noPost(raw)), expand(noPost(noNumber)), noPost(noNumber), town && expand(noPost(town)), town && noPost(town)];
  return [...new Set(list.map((x) => x.trim()).filter((x) => x.length > 2))];
}

async function geocodeOnce(q: string, country?: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const r = await fetch(
      'https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(q) + (country ? `&countrycodes=${country}` : ''),
    );
    if (!r.ok) return null;
    const [hit] = await r.json();
    return hit ? { lat: Number(hit.lat), lng: Number(hit.lon) } : null;
  } catch {
    return null;
  }
}

// 地点查询服务要求每秒不超过 1 次：所有查询排队
let geoQueue: Promise<unknown> = Promise.resolve();
let lastAt = 0;
function queued<T>(job: () => Promise<T>): Promise<T> {
  const run = geoQueue.then(async () => {
    const wait = lastAt + 1100 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    try {
      return await job();
    } finally {
      lastAt = Date.now();
    }
  });
  geoQueue = run.catch(() => undefined);
  return run;
}

const failedNames = new Set<string>();
/** 这个地址这次打开页面后已经查过、几种写法都没查到 */
export const geocodeFailed = (name: string) => failedNames.has(name.trim().toLowerCase());

export async function geocode(name: string, country?: string): Promise<{ lat: number; lng: number } | null> {
  for (const q of geocodeCandidates(name)) {
    const hit = await queued(() => geocodeOnce(q, country));
    if (hit) {
      failedNames.delete(name.trim().toLowerCase());
      return hit;
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return null;
  }
  failedNames.add(name.trim().toLowerCase());
  return null;
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
  for (const n of names) onFound(n, await geocode(n));
}
