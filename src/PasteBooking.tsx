import { useState } from 'react';
import type { Rec, Trip } from './types';
import { addDays, formatDate, money } from './calc';
import { newId } from './id';
import { aiParseBooking, aiParseDining } from './ai';
import { looksLikeDining, parseDiningText, type ParsedDining } from './diningParse';
import { looksLikeBookingText, parseBookingText, type ParsedBooking } from './bookingParse';
import { nameFromUrl, platformOf } from './search';
import { stayGroups } from './Bookings';
import { short } from './ui';

type Update = (mutate: (draft: Trip) => void) => void;

/** 按入住日期找到是哪一晚（连住的几晚一组）；对不上就用 fallback */
export function matchGroup(trip: Trip, checkin: string, fallback?: number): number[] | null {
  const groups = stayGroups(trip);
  const hit = checkin ? groups.find((g) => addDays(trip.startDate, g.days[0]) === checkin) : undefined;
  if (hit) return hit.days;
  // 入住日期落在某组中间（比如只订了连住的第二晚）
  const inside = checkin ? groups.find((g) => g.days.some((i) => addDays(trip.startDate, i) === checkin)) : undefined;
  if (inside) return inside.days;
  if (fallback === undefined) return null;
  return groups.find((g) => g.days.includes(fallback))?.days ?? [fallback];
}

/** 把识别结果写进这一组：加入候选并选定、填每晚价格；是确认订单就标记已订，备注写确认号和地址 */
export function applyParsedStay(t: Trip, group: number[], p: ParsedBooking, recId: string): string {
  const name = p.name || nameFromUrl(p.url) || (p.url ? `${platformOf(p.url)} 上的住宿` : '粘贴的住宿');
  const nights = p.nights || group.length;
  const perNight = p.perNight || (p.total ? Math.round(p.total / nights) : 0);
  for (const i of group) {
    const d = t.days[i];
    const acc = d.accommodation;
    if (!acc) continue;
    let r = d.stayOptions.find((x) => x.id === `${recId}-${i}`) ?? d.stayOptions.find((x) => x.name === name);
    if (!r) {
      r = { id: `${recId}-${i}`, name, where: short(d.to), type: '', price: '', note: '', picked: false } as Rec;
      d.stayOptions.unshift(r);
    }
    r.name = name;
    if (perNight) {
      r.cost = perNight;
      r.price = p.confirmed ? `实付 $${perNight}/晚` : `$${perNight}/晚`;
    }
    r.type = p.url ? `来自 ${platformOf(p.url)}` : r.type || '粘贴的预订';
    if (p.url) {
      if (platformOf(p.url) === '官网') r.url = p.url;
      else r.bookingUrl = p.url;
    }
    d.stayOptions.forEach((x) => (x.picked = x === r));
    acc.name = name;
    if (perNight) acc.cost = perNight;
    if (p.confirmed) {
      acc.booked = true;
      if (p.paid) acc.paid = true;
    }
    const lines = [
      p.confirmation && `确认号：${p.confirmation}`,
      p.address && `地址：${p.address}`,
      p.url && `链接：${p.url}`,
    ].filter(Boolean) as string[];
    const keep = acc.notes
      .split('\n')
      .filter((l) => l.trim() && !/^(确认号|地址|链接|预订)：/.test(l));
    acc.notes = [...lines, ...keep].join('\n');
  }
  return name;
}

function summary(trip: Trip, group: number[], p: ParsedBooking, name: string): string {
  const nights = p.nights || group.length;
  const per = p.perNight || (p.total ? Math.round(p.total / nights) : 0);
  const bits = [
    `「${name}」`,
    `${short(trip.days[group[0]].to)} ${formatDate(addDays(trip.startDate, group[0]))} 入住 ${nights} 晚`,
    p.total ? `总价 ${money(p.total)}（每晚 ${money(per)}）` : per ? `每晚 ${money(per)}` : '没找到价格，先按原来的估算',
    p.confirmation && `确认号 ${p.confirmation}`,
  ].filter(Boolean);
  return `${bits.join(' · ')} → 已选定${p.confirmed ? '，并标记为已订' + (p.paid ? '（已付款）' : '') : ''}`;
}

/**
 * 粘贴整段预订确认 / 房源文字：先按规则立刻填好，再请 Claude 核对一遍（能用时）。
 * fallbackDay：对不上入住日期时放到哪一晚（在某一天的「住哪」里粘贴时就是那一天）
 */
export function usePasteBooking(trip: Trip, update: Update) {
  const [message, setMessage] = useState('');
  const [warn, setWarn] = useState('');
  const [busy, setBusy] = useState(false);

  const handle = (text: string, fallbackDay?: number): boolean => {
    if (!looksLikeBookingText(text)) return false;
    const year = Number(trip.startDate.slice(0, 4)) || new Date().getFullYear();
    const p = parseBookingText(text, year);
    const group = matchGroup(trip, p.checkin, fallbackDay);
    if (!group) {
      setWarn(
        p.checkin
          ? `这份预订是 ${formatDate(p.checkin)} 入住，行程里这天没有住宿。请到对应那天的「住宿」里粘贴。`
          : '没认出入住日期，请到对应那天的「住宿」里粘贴。',
      );
      setMessage('');
      return true;
    }
    const recId = newId();
    let name = '';
    update((t) => void (name = applyParsedStay(t, group, p, recId)));
    name = name || p.name || nameFromUrl(p.url) || '粘贴的住宿';
    setWarn(
      p.checkin && fallbackDay !== undefined && !group.includes(fallbackDay)
        ? `入住日期是 ${formatDate(p.checkin)}，已放到对应的那一晚（第 ${group[0] + 1} 天）。`
        : p.checkin && !matchGroup(trip, p.checkin)
          ? `注意：这份预订是 ${formatDate(p.checkin)} 入住，和行程里这晚的日期对不上，请核对。`
          : '',
    );
    setMessage(summary(trip, group, p, name));

    // Claude 核对：名称、日期、价格、确认号有出入时以 Claude 的为准
    setBusy(true);
    aiParseBooking(text, year).then((ai) => {
      setBusy(false);
      if (!ai) return;
      const merged: ParsedBooking = {
        ...p,
        ...Object.fromEntries(Object.entries(ai).filter(([, v]) => v !== '' && v !== 0 && v !== undefined)),
        confirmed: p.confirmed || !!ai.confirmed,
        paid: p.paid || !!ai.paid,
        url: p.url,
      };
      if (merged.total && merged.nights) merged.perNight = Math.round(merged.total / merged.nights);
      const changed = (['name', 'checkin', 'nights', 'total', 'confirmation'] as const).filter((k) => merged[k] !== p[k]);
      if (!changed.length) {
        setMessage((m) => `${m}（Claude 已核对）`);
        return;
      }
      const g2 = matchGroup(trip, merged.checkin, fallbackDay) ?? group;
      let n2 = '';
      update((t) => void (n2 = applyParsedStay(t, g2, merged, recId)));
      setMessage(`${summary(trip, g2, merged, n2 || merged.name)}（Claude 核对后更正了${changed.length} 处）`);
    });
    return true;
  };

  return { handle, message, warn, busy };
}

/* ---------------- 餐厅 ---------------- */

/** 这顿饭估多少钱：写了总价按总价，否则按每人价位 × 人数 */
const mealCost = (p: ParsedDining, people: number) => p.total || (p.perPerson ? p.perPerson * (p.party || people) : 0);

/** 把识别出的餐厅加进某一天：想去（计入花费）；是订位确认就标记已订 */
export function applyParsedDining(t: Trip, dayIndex: number, p: ParsedDining, recId: string): string {
  const d = t.days[dayIndex];
  const name = p.name || nameFromUrl(p.url) || (p.url ? `${platformOf(p.url)} 上的餐厅` : '粘贴的餐厅');
  let r = d.dining.find((x) => x.id === recId) ?? d.dining.find((x) => x.name === name);
  if (!r) {
    r = { id: recId, name, where: short(d.to), type: '', price: '', note: '', picked: true } as Rec;
    d.dining.unshift(r);
  }
  const cost = mealCost(p, t.adults + t.children);
  r.name = name;
  r.picked = true;
  r.type = [p.cuisine, p.priceLevel].filter(Boolean).join(' · ') || r.type || '餐厅';
  r.price = p.priceLevel || r.price;
  if (cost) r.cost = cost;
  if (p.rating) r.rating = p.rating;
  if (p.confirmed) r.booked = true;
  r.note = [
    p.confirmed && `订位 ${p.time || ''}${p.party ? ` · ${p.party} 人` : ''}`.trim(),
    p.confirmation && `确认号 ${p.confirmation}`,
    p.address,
  ]
    .filter(Boolean)
    .join(' · ');
  if (p.url) {
    if (platformOf(p.url) === '官网') r.url = p.url;
    else r.bookingUrl = p.url;
  }
  return name;
}

function diningSummary(trip: Trip, dayIndex: number, p: ParsedDining, name: string): string {
  const cost = mealCost(p, trip.adults + trip.children);
  const bits = [
    `「${name}」`,
    `第 ${dayIndex + 1} 天 ${formatDate(addDays(trip.startDate, dayIndex))}${p.time ? ` ${p.time}` : ''}`,
    p.rating && `★ ${p.rating}`,
    cost ? `这顿约 ${money(cost)}${p.total ? '' : `（${p.priceLevel || '按价位'}估）`}` : '没认出价格，可以在列表里填',
    p.confirmation && `确认号 ${p.confirmation}`,
  ].filter(Boolean);
  return `${bits.join(' · ')} → 已加入这天${p.confirmed ? '，并标记已订位' : ''}`;
}

/** 粘贴餐厅页面或订位确认：先按规则填好，再请 Claude 核对 */
export function usePasteDining(trip: Trip, update: Update) {
  const [message, setMessage] = useState('');
  const [warn, setWarn] = useState('');
  const [busy, setBusy] = useState(false);

  const dayOf = (date: string, fallback?: number) => {
    const i = date ? trip.days.findIndex((_, k) => addDays(trip.startDate, k) === date) : -1;
    return i >= 0 ? i : fallback;
  };

  const handle = (text: string, fallbackDay?: number): boolean => {
    if (!looksLikeBookingText(text)) return false;
    const year = Number(trip.startDate.slice(0, 4)) || new Date().getFullYear();
    const p = parseDiningText(text, year);
    const day = dayOf(p.date, fallbackDay);
    if (day === undefined) {
      setWarn(
        p.date
          ? `这份订位是 ${formatDate(p.date)}，不在行程日期里。请到对应那天的「吃饭」里粘贴。`
          : '没认出是哪一天（餐厅页面没有日期），请到那天的「吃饭」里粘贴。',
      );
      setMessage('');
      return true;
    }
    const recId = newId();
    let name = '';
    update((t) => void (name = applyParsedDining(t, day, p, recId)));
    name = name || p.name || nameFromUrl(p.url) || '粘贴的餐厅';
    setWarn(p.date && fallbackDay !== undefined && day !== fallbackDay ? `订位日期是 ${formatDate(p.date)}，已放到第 ${day + 1} 天。` : '');
    setMessage(diningSummary(trip, day, p, name));

    setBusy(true);
    aiParseDining(text, year).then((ai) => {
      setBusy(false);
      if (!ai) return;
      const merged: ParsedDining = {
        ...p,
        ...Object.fromEntries(Object.entries(ai).filter(([, v]) => v !== '' && v !== 0 && v !== undefined)),
        confirmed: p.confirmed || !!ai.confirmed,
        url: p.url,
      };
      const changed = (['name', 'date', 'party', 'perPerson', 'total', 'confirmation', 'rating'] as const).filter((k) => merged[k] !== p[k]);
      if (!changed.length) {
        setMessage((m) => `${m}（Claude 已核对）`);
        return;
      }
      const d2 = dayOf(merged.date, day) ?? day;
      if (d2 !== day) update((t) => void (t.days[day].dining = t.days[day].dining.filter((x) => x.id !== recId)));
      let n2 = '';
      update((t) => void (n2 = applyParsedDining(t, d2, merged, recId)));
      setMessage(`${diningSummary(trip, d2, merged, n2 || merged.name)}（Claude 核对后更正了 ${changed.length} 处）`);
    });
    return true;
  };

  return { handle, message, warn, busy };
}

/** 「预订」页顶部：粘贴任何一份住宿预订确认或餐厅订位，自动对上是哪一天 */
export function PasteBookingBox({ trip, update }: { trip: Trip; update: Update }) {
  const [text, setText] = useState('');
  const stay = usePasteBooking(trip, update);
  const meal = usePasteDining(trip, update);
  const [last, setLast] = useState<'stay' | 'meal'>('stay');
  const { message, warn, busy } = last === 'stay' ? stay : meal;
  const go = (v: string) => {
    const kind = looksLikeDining(v) ? 'meal' : 'stay';
    setLast(kind);
    if ((kind === 'meal' ? meal : stay).handle(v)) setText('');
    else setText(v);
  };
  return (
    <section className="paste-box" aria-labelledby="paste-head">
      <div id="paste-head" className="find-head">订好了？把确认邮件或订单页面的文字整段粘贴到这里（住宿、餐厅都行）</div>
      <textarea
        aria-label="粘贴预订确认"
        rows={2}
        placeholder="从 Booking / Airbnb / 携程 / OpenTable / 官网 的确认邮件里全选复制，粘贴进来。会自动认出名称、日期、价格和确认号，对上是哪一天并标记已订。"
        value={text}
        onPaste={(e) => {
          e.preventDefault();
          go(e.clipboardData.getData('text'));
        }}
        onChange={(e) => setText(e.target.value)}
      />
      {text.trim() && (
        <button className="primary" onClick={() => go(text)}>识别并加入</button>
      )}
      {busy && <p className="small muted">Claude 正在核对…</p>}
      {message && <p className="small sp-added">{message}</p>}
      {warn && <p className="small warn-text">{warn}</p>}
    </section>
  );
}
