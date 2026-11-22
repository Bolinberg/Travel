import type { AiReplan } from './ai';
import type { Accommodation, Day, Trip } from './types';
import { newId } from './id';
import { addDays, summarize } from './calc';

/*
 * 调整行程天数：生成「新方案」（不改动原行程），供对比后确认应用。
 * 规则引擎不需要联网；AI 引擎的结果也通过 buildProposal 转成同样的结构。
 */

export type ChangeKind = 'same' | 'merged' | 'split' | 'added' | 'edited';

export interface ProposedDay {
  day: Day;
  /** 来自原行程的哪几天（下标，从 0 开始） */
  sources: number[];
  kind: ChangeKind;
  /** 中文说明 */
  reason: string;
}

export interface Proposal {
  engine: 'rules' | 'ai';
  summary: string;
  days: ProposedDay[];
  /** 新方案需要的新地点（AI 可能给出） */
  newPlaces: Trip['places'];
}

const LONG_DRIVE = 6; // 小时

const clone = <T,>(x: T): T => structuredClone(x);
const uniq = (xs: string[]) => {
  const seen = new Set<string>();
  return xs.filter((x) => {
    const k = x.trim().toLowerCase();
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

function avgNightly(trip: Trip): number {
  const costs = trip.days.map((d) => d.accommodation?.cost ?? 0).filter((c) => c > 0);
  return costs.length ? Math.round(costs.reduce((a, b) => a + b, 0) / costs.length) : 0;
}

function emptyStay(place: string, cost: number): Accommodation {
  return { name: `${place} 住宿`, cost, booked: false, paid: false, notes: '' };
}

/** 合并相邻两天：a 的终点变成途经点，住宿取 b */
function mergeDays(a: Day, b: Day): Day {
  const via = a.to !== a.from && a.to !== b.to ? [a.to] : [];
  return {
    ...clone(b),
    title: a.title === b.title ? a.title : `${a.title} + ${b.title}`,
    from: a.from,
    stops: uniq([...a.stops, ...via, ...b.stops]).filter((s) => s !== a.from && s !== b.to),
    km: a.km + b.km,
    driveHours: Math.round((a.driveHours + b.driveHours) * 10) / 10,
    dining: [...clone(a.dining), ...clone(b.dining)],
    notes: [a.notes, b.notes].filter(Boolean).join('；'),
  };
}

function mergeCost(a: Day, b: Day): number {
  const h = a.driveHours + b.driveHours;
  const stops = a.stops.length + b.stops.length;
  // 越短越适合合并；超过 6 小时严重惩罚；同城两天合并最划算
  let score = h + Math.max(0, h - LONG_DRIVE) * 5 + stops * 0.3;
  if (a.from === a.to || b.from === b.to) score -= 1;
  return score;
}

/** 规则引擎 */
export function proposeByRules(trip: Trip, target: number): Proposal {
  const n = trip.days.length;
  target = Math.max(1, Math.min(60, Math.round(target)));
  let days: ProposedDay[] = trip.days.map((d, i) => ({ day: clone(d), sources: [i], kind: 'same', reason: '' }));
  const notes: string[] = [];

  // 缩短：每次合并「代价」最小的相邻两天
  while (days.length > target && days.length > 1) {
    let best = 0;
    let bestScore = Infinity;
    for (let i = 0; i < days.length - 1; i++) {
      const s = mergeCost(days[i].day, days[i + 1].day);
      if (s < bestScore) {
        bestScore = s;
        best = i;
      }
    }
    const a = days[best];
    const b = days[best + 1];
    const merged = mergeDays(a.day, b.day);
    const src = [...a.sources, ...b.sources];
    days.splice(best, 2, {
      day: merged,
      sources: src,
      kind: 'merged',
      reason: `合并原 ${src.map((i) => `D${i + 1}`).join('+')}，约 ${merged.driveHours} 小时车程`,
    });
  }

  // 延长：先拆超长车程日，否则在主要目的地加一天
  const nightly = avgNightly(trip);
  while (days.length < target) {
    let longest = -1;
    days.forEach((p, i) => {
      if (p.day.driveHours > 5 && p.day.stops.length > 0 && (longest < 0 || p.day.driveHours > days[longest].day.driveHours)) longest = i;
    });
    if (longest >= 0) {
      const p = days[longest];
      const d = p.day;
      const mid = Math.floor((d.stops.length - 1) / 2);
      const midPlace = d.stops[mid];
      const first: Day = {
        ...clone(d),
        id: newId(),
        title: `${d.title}（上）`,
        to: midPlace,
        stops: d.stops.slice(0, mid),
        km: Math.round(d.km / 2),
        driveHours: Math.round((d.driveHours / 2) * 10) / 10,
        accommodation: emptyStay(midPlace, nightly),
        stayOptions: [],
        dining: [],
      };
      const second: Day = {
        ...clone(d),
        title: `${d.title}（下）`,
        from: midPlace,
        stops: d.stops.slice(mid + 1),
        km: d.km - first.km,
        driveHours: Math.round((d.driveHours - first.driveHours) * 10) / 10,
      };
      days.splice(
        longest,
        1,
        { day: first, sources: p.sources, kind: 'split', reason: `拆分长途日，在 ${midPlace} 过夜` },
        { day: second, sources: p.sources, kind: 'split', reason: '拆分长途日的后半段' },
      );
      continue;
    }
    // 主要目的地 = 过夜最多的地方（不含起点）
    const origin = days[0].day.from;
    const count = new Map<string, number>();
    days.forEach((p) => {
      if (p.day.accommodation && p.day.to !== origin) count.set(p.day.to, (count.get(p.day.to) ?? 0) + 1);
    });
    const main = [...count.entries()].sort((x, y) => y[1] - x[1])[0]?.[0];
    const at = main
      ? days.map((p) => p.day.to).lastIndexOf(main)
      : Math.max(0, days.length - 2);
    const place = days[at].day.to;
    const ref = days[at].day;
    const extra: Day = {
      id: newId(),
      title: `${place} 自由活动`,
      from: place,
      to: place,
      km: 0,
      driveHours: 0,
      stops: [],
      accommodation: ref.accommodation
        ? { ...clone(ref.accommodation), name: `${place} 住宿（加住一晚）`, booked: false, paid: false, notes: '' }
        : emptyStay(place, nightly),
      stayOptions: clone(ref.stayOptions),
      dining: [],
      notes: '休整日，可睡懒觉、洗衣服，或去周边景点。',
    };
    days.splice(at + 1, 0, { day: extra, sources: [], kind: 'added', reason: `在 ${place} 多住一晚` });
  }

  // 最后一天回家不需要住宿
  const last = days[days.length - 1];
  if (last.day.to === trip.days[n - 1].to && trip.days[n - 1].accommodation === null) last.day.accommodation = null;

  // 拆分产生的新 id、合并后保留的 id 需唯一
  const used = new Set<string>();
  for (const p of days) {
    if (used.has(p.day.id)) p.day.id = newId();
    used.add(p.day.id);
  }

  const long = days.filter((p) => p.day.driveHours > LONG_DRIVE);
  if (long.length) notes.push(`有 ${long.length} 天车程超过 ${LONG_DRIVE} 小时，建议考虑删减途经点`);
  const delta = target - n;
  return {
    engine: 'rules',
    summary:
      (delta < 0
        ? `从 ${n} 天缩短为 ${target} 天：合并了车程较短或同城的相邻日期。`
        : delta > 0
          ? `从 ${n} 天延长为 ${target} 天：优先拆分长途日，其次在主要目的地增加自由活动日。`
          : '天数未变化。') + (notes.length ? ` ${notes.join('；')}。` : ''),
    days,
    newPlaces: [],
  };
}

/* ---------- 对比 ---------- */

export function proposalTrip(trip: Trip, p: Proposal): Trip {
  const t = clone(trip);
  t.days = p.days.map((x) => clone(x.day));
  const known = new Set(t.places.map((x) => x.name.toLowerCase()));
  for (const pl of p.newPlaces) if (!known.has(pl.name.toLowerCase())) t.places.push(clone(pl));
  // 沿用的住宿若入住日期变了，原预订不再有效：标为未订并提醒
  const booked = new Set(
    trip.days.map((d, i) => (d.accommodation?.booked ? `${addDays(trip.startDate, i)}|${d.accommodation.name}` : '')),
  );
  t.days.forEach((d, i) => {
    const a = d.accommodation;
    if (a?.booked && !booked.has(`${addDays(t.startDate, i)}|${a.name}`)) {
      a.booked = false;
      a.paid = false;
      a.notes = ['原预订日期已变，需改订', a.notes].filter(Boolean).join('；');
    }
  });
  // 开销关联：原来某天的开销 → 新方案中包含该天的那一天
  const map = new Map<string, string>();
  p.days.forEach((x) => x.sources.forEach((i) => map.set(trip.days[i].id, x.day.id)));
  const ids = new Set(t.days.map((d) => d.id));
  for (const e of t.expenses) {
    if (e.dayId && !ids.has(e.dayId)) e.dayId = map.get(e.dayId) ?? null;
  }
  return t;
}

export interface Comparison {
  before: ReturnType<typeof summarize>;
  after: ReturnType<typeof summarize>;
  /** 原行程里有、新方案里不再经过的地点 */
  dropped: string[];
  /** 新方案新增的地点 */
  added: string[];
  longDrives: number;
}

export function compare(before: Trip, after: Trip): Comparison {
  const names = (t: Trip) => new Set(t.days.flatMap((d) => [d.from, d.to, ...d.stops]).map((s) => s.trim()).filter(Boolean));
  const b = names(before);
  const a = names(after);
  return {
    before: summarize(before),
    after: summarize(after),
    dropped: [...b].filter((x) => !a.has(x)),
    added: [...a].filter((x) => !b.has(x)),
    longDrives: after.days.filter((d) => d.driveHours > LONG_DRIVE).length,
  };
}





export function proposalFromAi(trip: Trip, plan: AiReplan): Proposal {
  const nightly = avgNightly(trip);
  const usedIds = new Set<string>();
  const days: ProposedDay[] = plan.days.map((d) => {
    const src = d.sources.map((n) => n - 1);
    const orig = src.length === 1 ? trip.days[src[0]] : undefined;
    if (
      d.kind === 'same' && orig && !usedIds.has(orig.id) &&
      orig.from === d.from && orig.to === d.to && !!orig.accommodation === d.overnight
    ) {
      usedIds.add(orig.id);
      return { day: clone(orig), sources: src, kind: 'same' as const, reason: d.reason };
    }
    // 优先沿用「同一过夜地」的原日期：住宿、住宿推荐、id（保留开销关联）
    const stayFrom = src.map((i) => trip.days[i]).find((o) => o.to === d.to && o.accommodation) ??
      trip.days.find((o) => o.to === d.to && o.accommodation && !usedIds.has(o.id));
    const base = src.length ? trip.days[src[src.length - 1]] : undefined;
    let id = (stayFrom ?? base)?.id;
    if (!id || usedIds.has(id)) id = newId();
    usedIds.add(id);
    const day: Day = {
      id,
      title: d.title,
      from: d.from,
      to: d.to,
      stops: uniq(d.stops),
      km: d.km,
      driveHours: d.driveHours,
      accommodation: d.overnight
        ? stayFrom?.accommodation
          ? clone(stayFrom.accommodation)
          : emptyStay(d.to, nightly)
        : null,
      stayOptions: d.overnight && stayFrom ? clone(stayFrom.stayOptions) : [],
      dining: src.flatMap((i) => clone(trip.days[i].dining)),
      notes: d.notes,
    };
    return { day, sources: src, kind: d.kind, reason: d.reason };
  });
  return {
    engine: 'ai',
    summary: plan.summary,
    days,
    newPlaces: plan.places.map((p) => ({ name: p.name, label: p.label || p.name, lat: p.lat, lng: p.lng, desc: p.desc })),
  };
}

/** 原行程里已预订、但在新方案中被取消或改动的住宿 */
export function affectedBookings(before: Trip, after: Trip): string[] {
  // 按入住日期 + 住宿名称判断：日期变了也需要改订
  const kept = new Set(
    after.days.map((d, i) => (d.accommodation ? `${addDays(after.startDate, i)}|${d.accommodation.name}` : '')),
  );
  return before.days
    .map((d, i) => ({ d, i }))
    .filter(({ d }) => d.accommodation?.booked)
    .filter(({ d, i }) => !kept.has(`${addDays(before.startDate, i)}|${d.accommodation!.name}`))
    .map(({ d, i }) => `D${i + 1} ${d.accommodation!.name}`);
}
