import type { Day, Rec, Trip } from './types';
import { newId } from './id';
import { VERIFIED_STAYS, STAYS_CHECKED } from './staysData';

/** 一条已核实的住宿：官网 / 大平台链接、评分、12 月估价 */
export interface VerifiedStay {
  name: string;
  town: string;
  type: string;
  officialUrl: string;
  bookingUrl: string;
  rating: string;
  priceNote: string;
  cost: number;
  note: string;
}

export { STAYS_CHECKED };

/** 过夜地（Day.to）→ 已核实的住宿 */
export function verifiedFor(place: string): VerifiedStay[] | undefined {
  return VERIFIED_STAYS[place];
}

const toRec = (s: VerifiedStay, i: number): Rec => ({
  id: newId(),
  name: s.name,
  where: s.town,
  type: s.type,
  price: s.priceNote,
  cost: s.cost || undefined,
  note: s.note,
  picked: false,
  ...(s.officialUrl ? { url: s.officialUrl } : {}),
  ...(s.bookingUrl ? { bookingUrl: s.bookingUrl } : {}),
  ...(s.rating ? { rating: s.rating } : {}),
  ...(i === 0 ? { top: true } : {}),
});

/**
 * 把过夜日的住宿推荐换成核实过的列表。
 * 已经「选这家」的保留（同名的沿用勾选状态）；不住宿的日子不动。返回是否有改动。
 */
export function applyVerifiedStaysToDay(d: Day): boolean {
  if (!d.accommodation) return false;
  const list = VERIFIED_STAYS[d.to];
  if (!list?.length) return false;
  const pickedName = d.stayOptions.find((r) => r.picked)?.name;
  const fresh = list.map(toRec);
  const same =
    d.stayOptions.length >= fresh.length &&
    fresh.every((f) => d.stayOptions.some((o) => o.name === f.name && o.url === f.url && o.bookingUrl === f.bookingUrl && o.rating === f.rating && !!o.top === !!f.top));
  if (same) return false;
  for (const r of fresh) r.picked = r.name === pickedName;
  const keep = d.stayOptions.filter((o) => o.picked && !fresh.some((f) => f.name === o.name));
  d.stayOptions = [...keep, ...fresh];
  return true;
}

/** 要提前订的项目的官方预订页 */
const BOOKING_PAGES: [RegExp, string][] = [
  [/sealink|渡轮/i, 'https://www.sealink.com.au/kangaroo-island/'],
  [/动物园|adelaide zoo/i, 'https://www.adelaidezoo.com.au/'],
];
function addBookingLinks(t: Trip): boolean {
  let changed = false;
  for (const e of t.expenses) {
    // 停车这类不用提前订：当成随手记的开销
    if (!e.quick && /停车|parking/i.test(e.title)) {
      e.quick = true;
      changed = true;
    }
    if (e.url) continue;
    const hit = BOOKING_PAGES.find(([re]) => re.test(e.title));
    if (hit) {
      e.url = hit[1];
      changed = true;
    }
  }
  return changed;
}

/** 行程本身和它保存的所有方案都换上核实过的住宿 */
export function applyVerifiedStays(trip: Trip): Trip {
  const t = structuredClone(trip);
  let changed = addBookingLinks(t);
  for (const v of t.versions ?? []) changed = addBookingLinks(v.snapshot) || changed;
  for (const d of t.days) changed = applyVerifiedStaysToDay(d) || changed;
  for (const v of t.versions ?? []) for (const d of v.snapshot.days) changed = applyVerifiedStaysToDay(d) || changed;
  return changed ? t : trip;
}
