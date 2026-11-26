/*
 * 合并两份行程：以 base 为准，把 extra 里 base 没有的东西补进来。
 * 用在家人共享上：手机上加过的清单、记账、住宿、餐厅，合并进共享那份，绝不丢。
 * 只做“加”和“补”，不删除 base 里的任何东西。
 */
import type { ChecklistItem, Day, Expense, Rec, Trip, TripVersion } from './types';

const norm = (s: string | undefined) => (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

function mergeRecs(base: Rec[], extra: Rec[]): Rec[] {
  const out = base.map((r) => ({ ...r }));
  for (const e of extra) {
    const m = out.find((r) => r.id === e.id) ?? out.find((r) => norm(r.name) === norm(e.name));
    if (!m) {
      out.push({ ...e });
      continue;
    }
    if (e.picked) m.picked = true;
    if (e.booked) m.booked = true;
    if (!m.url && e.url) m.url = e.url;
    if (!m.bookingUrl && e.bookingUrl) m.bookingUrl = e.bookingUrl;
    if (!m.cost && e.cost) m.cost = e.cost;
    if (!m.rating && e.rating) m.rating = e.rating;
    if (!m.geo && e.geo) m.geo = e.geo;
    if (e.note && !norm(m.note).includes(norm(e.note))) m.note = m.note ? `${m.note}\n${e.note}` : e.note;
  }
  return out;
}

function addText(a: string, b: string): string {
  if (!b.trim() || norm(a).includes(norm(b))) return a;
  if (!a.trim() || norm(b).includes(norm(a))) return b;
  return `${a}\n${b}`;
}

const sameRoute = (a: Day, b: Day) => a.id === b.id || (norm(a.from) === norm(b.from) && norm(a.to) === norm(b.to));

function mergeDay(b: Day, e: Day): Day {
  const out: Day = { ...b };
  const ba = b.accommodation;
  const ea = e.accommodation;
  if (ea && ea.name.trim()) {
    if (!ba || !ba.name.trim() || (!ba.booked && ea.booked) || (!ba.paid && ea.paid && norm(ba.name) === norm(ea.name))) out.accommodation = { ...ea };
    else if (norm(ba.name) === norm(ea.name)) out.accommodation = { ...ba, cost: ba.cost || ea.cost, notes: addText(ba.notes, ea.notes) };
  }
  out.stayOptions = mergeRecs(b.stayOptions ?? [], e.stayOptions ?? []);
  out.dining = mergeRecs(b.dining ?? [], e.dining ?? []);
  out.notes = addText(b.notes ?? '', e.notes ?? '');
  out.stops = [...b.stops];
  for (const s of e.stops) if (!out.stops.some((x) => norm(x) === norm(s))) out.stops.push(s);
  return out;
}

/** 把 extra 合并进 base（返回新对象，不改原来的） */
export function mergeTrip(base: Trip, extra: Trip): Trip {
  const out: Trip = { ...base };
  // 天：同一个 id，或者同一天、同样的起点终点，才算同一天
  const dayMap = new Map<string, string>(); // extra 的 day id → base 的 day id
  out.days = base.days.map((d, i) => {
    const e = extra.days.find((x) => x.id === d.id) ?? (extra.days[i] && sameRoute(extra.days[i], d) ? extra.days[i] : undefined);
    if (!e) return d;
    dayMap.set(e.id, d.id);
    return mergeDay(d, e);
  });
  for (const d of base.days) dayMap.set(d.id, d.id);
  // 没对上的天（比如另一台设备选的是别的路线方案）：先按同一个目的地对，再按同一天（日期）记到备注里，不丢
  const town = (x: string) => norm(x).split(/[,，]/)[0].replace(/\s+(sa|vic|nsw)$/, '');
  extra.days.forEach((e, i) => {
    if (dayMap.has(e.id)) return;
    const j = out.days.findIndex((d) => town(d.to) === town(e.to));
    if (j >= 0) {
      dayMap.set(e.id, out.days[j].id);
      out.days[j] = mergeDay(out.days[j], { ...e, stops: [] });
      return;
    }
    const k = Math.min(i, out.days.length - 1);
    if (k < 0) return;
    const bits: string[] = [];
    if (e.accommodation?.name) bits.push(`住 ${e.accommodation.name}${e.accommodation.cost ? ` $${e.accommodation.cost}` : ''}${e.accommodation.booked ? '（已订）' : ''}`);
    for (const r of [...e.stayOptions, ...e.dining]) if (r.picked || r.booked) bits.push(`${r.name}${r.booked ? '（已订）' : ''}${r.url ? ` ${r.url}` : ''}`);
    if (e.notes.trim()) bits.push(e.notes.trim());
    if (bits.length) {
      const line = `【另一台设备上这天（${e.from} → ${e.to}）】${bits.join('；')}`;
      out.days[k] = { ...out.days[k], notes: addText(out.days[k].notes ?? '', line) };
    }
    dayMap.set(e.id, out.days[k].id);
  });

  out.expenses = base.expenses.map((x) => ({ ...x }));
  for (const e of extra.expenses) {
    const m =
      out.expenses.find((x) => x.id === e.id) ??
      out.expenses.find((x) => norm(x.title) === norm(e.title) && Math.abs(x.amount - e.amount) < 0.01);
    if (m) {
      if (e.paid) m.paid = true;
      if (e.booked) m.booked = true;
      if (!m.url && e.url) m.url = e.url;
      if (e.note) m.note = addText(m.note ?? '', e.note);
      continue;
    }
    const add: Expense = { ...e, dayId: e.dayId ? dayMap.get(e.dayId) ?? null : null };
    out.expenses.push(add);
  }

  out.checklist = base.checklist.map((c) => ({ ...c }));
  for (const c of extra.checklist) {
    const m = out.checklist.find((x) => x.id === c.id) ?? out.checklist.find((x) => norm(x.text) === norm(c.text));
    if (m) {
      if (c.done) m.done = true;
      continue;
    }
    out.checklist.push({ ...c } as ChecklistItem);
  }

  out.places = [...(base.places ?? [])];
  for (const p of extra.places ?? []) if (!out.places.some((x) => x.name === p.name)) out.places.push(p);

  const vers: TripVersion[] = [...(base.versions ?? [])];
  for (const v of extra.versions ?? []) {
    if (!vers.some((x) => x.id === v.id || (x.kind === v.kind && x.label === v.label))) vers.push(v);
  }
  if (base.versions || extra.versions) out.versions = vers.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return out;
}

/** 两份行程算不算“同一个行程”（不同设备上 id 不一样，就看名字） */
export const sameTrip = (a: Trip, b: Trip) => a.id === b.id || norm(a.name) === norm(b.name);

/** 只留下 now 相对 prev 新加 / 改过的东西（用来合并别人刚改的，又不把本机刚删的加回来） */
export function changesSince(now: Trip, prev: Trip | null): Trip {
  if (!prev) return now;
  const ids = (xs: { id: string }[] | undefined) => new Set((xs ?? []).map((x) => x.id));
  const pc = ids(prev.checklist);
  const pe = ids(prev.expenses);
  const prevJ = new Map(prev.days.map((d) => [d.id, d]));
  return {
    ...now,
    checklist: now.checklist.filter((c) => !pc.has(c.id) || JSON.stringify(c) !== JSON.stringify(prev.checklist.find((x) => x.id === c.id))),
    expenses: now.expenses.filter((e) => !pe.has(e.id) || JSON.stringify(e) !== JSON.stringify(prev.expenses.find((x) => x.id === e.id))),
    days: now.days.map((d) => {
      const p = prevJ.get(d.id);
      if (!p) return d;
      const ps = ids(p.stayOptions);
      const pd = ids(p.dining);
      return {
        ...d,
        accommodation: JSON.stringify(d.accommodation) === JSON.stringify(p.accommodation) ? null : d.accommodation,
        stayOptions: d.stayOptions.filter((r) => !ps.has(r.id) || JSON.stringify(r) !== JSON.stringify(p.stayOptions.find((x) => x.id === r.id))),
        dining: d.dining.filter((r) => !pd.has(r.id) || JSON.stringify(r) !== JSON.stringify(p.dining.find((x) => x.id === r.id))),
        notes: d.notes === p.notes ? '' : d.notes,
        stops: d.stops.filter((s) => !p.stops.includes(s)),
      };
    }),
    versions: (now.versions ?? []).filter((v) => !(prev.versions ?? []).some((x) => x.id === v.id)),
  };
}
