/*
 * 住宿和餐厅在地图上的位置。
 * 有地址（粘贴的确认邮件里带的）就按地址查，否则按「名字 + 城镇」查；
 * 查到的位置离当天目的地超过 60 km 就不要（多半是别处的同名店）。
 */
import type { Day, GeoPin, Rec, Trip } from './types';
import { findPlace, geocodePoi } from './geo';
import { haversineKm } from './route';

export interface Poi {
  kind: 'stay' | 'dining';
  name: string;
  town: string;
  address: string;
  /** 已选 / 已订（不是只是候选） */
  chosen: boolean;
  booked: boolean;
  url?: string;
  info: string;
  geo?: GeoPin;
  /** 写回位置用 */
  ref: { day: string; kind: 'acc' | 'stay' | 'dining'; id?: string };
}

const STREET = /\b(st|street|rd|road|tce|terrace|ave|avenue|pde|parade|hwy|highway|dr|drive|lane|ln|pl|place|way|cres|crescent|esplanade|esp|blvd|boulevard|ct|court)\b/i;

export function addressFrom(text: string | undefined): string {
  if (!text) return '';
  const m = text.match(/地址[:：]\s*(.+)/);
  if (m) return m[1].trim();
  for (const part of text.split(/\s*[·\n|]\s*/)) if (/\d/.test(part) && STREET.test(part) && part.length < 120) return part.trim();
  return '';
}

/** 「Mount Gambier（Ob Flat，747 Glenelg River Rd）」→ 城镇 Mount Gambier、地址 747 Glenelg River Rd, Ob Flat */
export function splitWhere(where: string): { town: string; address: string } {
  const m = where.match(/^(.*?)\s*[（(](.+)[）)]\s*$/);
  if (!m) return { town: where.trim(), address: '' };
  const inner = m[2].split(/[，,]/).map((x) => x.trim()).filter(Boolean);
  const street = inner.find((x) => /\d/.test(x) && STREET.test(x));
  if (!street) return { town: m[1].trim(), address: '' };
  const rest = inner.filter((x) => x !== street);
  return { town: m[1].trim(), address: [street, ...rest, m[1].trim()].join(', ') };
}

const shortTown = (s: string) => s.replace(/,?\s+(VIC|NSW|QLD|SA|WA|TAS|NT|ACT)$/i, '').trim();

export const poiKey = (p: Pick<Poi, 'name' | 'town' | 'address'>) => [p.name.trim().toLowerCase(), p.town.trim().toLowerCase(), p.address.trim().toLowerCase()].join('|');

const recInfo = (r: Rec) => [r.type, r.price, r.rating].filter(Boolean).join(' · ');

/** 某一天要标在地图上的住宿和餐厅；withCandidates 时连候选也算上 */
export function dayPois(d: Day, withCandidates = false): Poi[] {
  return dayPoisRaw(d, withCandidates).map((p) => {
    const w = splitWhere(p.town);
    return { ...p, town: w.town, address: p.address || w.address };
  });
}

function dayPoisRaw(d: Day, withCandidates: boolean): Poi[] {
  const out: Poi[] = [];
  const town = d.to;
  const acc = d.accommodation;
  const accName = acc?.name.trim() ?? '';
  if (acc && accName) {
    const rec = d.stayOptions.find((r) => r.name.trim().toLowerCase() === accName.toLowerCase());
    out.push({
      kind: 'stay',
      name: accName,
      town: rec?.where || town,
      address: addressFrom(acc.notes) || addressFrom(rec?.note),
      chosen: true,
      booked: acc.booked,
      url: rec?.url || rec?.bookingUrl,
      info: [acc.cost ? `$${acc.cost}/晚` : '', rec ? recInfo(rec) : ''].filter(Boolean).join(' · '),
      geo: acc.geo ?? rec?.geo,
      ref: { day: d.id, kind: 'acc' },
    });
  }
  if (withCandidates) {
    for (const r of d.stayOptions) {
      if (r.name.trim().toLowerCase() === accName.toLowerCase()) continue;
      out.push({ kind: 'stay', name: r.name, town: r.where || town, address: addressFrom(r.note), chosen: false, booked: false, url: r.url || r.bookingUrl, info: recInfo(r), geo: r.geo, ref: { day: d.id, kind: 'stay', id: r.id } });
    }
  }
  for (const r of d.dining) {
    const chosen = r.picked || !!r.booked;
    if (!chosen && !withCandidates) continue;
    out.push({ kind: 'dining', name: r.name, town: r.where || town, address: addressFrom(r.note), chosen, booked: !!r.booked, url: r.url || r.bookingUrl, info: recInfo(r), geo: r.geo, ref: { day: d.id, kind: 'dining', id: r.id } });
  }
  return out.filter((p) => p.name.trim());
}

/** 位置是不是按现在的名字 / 地址查的 */
export const poiLocated = (p: Poi) => !!p.geo && p.geo.key === poiKey(p);

/** 查一个住宿 / 餐厅的位置；查不到或离当天目的地太远返回 null */
export async function locatePoi(trip: Trip, d: Day, p: Poi): Promise<GeoPin | null> {
  const near = findPlace(trip, d.to) ?? findPlace(trip, p.town);
  const hit = await geocodePoi(p.name, shortTown(p.town), p.address, near ?? undefined);
  if (!hit) return null;
  if (near && haversineKm(near, hit) > 60) return null;
  return { lat: hit.lat, lng: hit.lng, key: poiKey(p) };
}

/** 把查到的位置写回行程 */
export function savePoiGeo(t: Trip, ref: Poi['ref'], geo: GeoPin) {
  const d = t.days.find((x) => x.id === ref.day);
  if (!d) return;
  if (ref.kind === 'acc') {
    if (d.accommodation) d.accommodation.geo = geo;
    const rec = d.stayOptions.find((r) => r.name.trim().toLowerCase() === d.accommodation?.name.trim().toLowerCase());
    if (rec) rec.geo = geo;
  } else {
    const list = ref.kind === 'stay' ? d.stayOptions : d.dining;
    const r = list.find((x) => x.id === ref.id);
    if (r) r.geo = geo;
  }
}
