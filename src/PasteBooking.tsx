import { useState } from 'react';
import type { Rec, Trip } from './types';
import { addDays, formatDate, money } from './calc';
import { newId } from './id';
import { aiParseBooking } from './ai';
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

/** 「预订」页顶部：粘贴任何一份住宿预订确认，自动对上是哪一晚 */
export function PasteBookingBox({ trip, update }: { trip: Trip; update: Update }) {
  const [text, setText] = useState('');
  const { handle, message, warn, busy } = usePasteBooking(trip, update);
  const go = (v: string) => {
    if (handle(v)) setText('');
    else setText(v);
  };
  // 只粘贴了链接：提示去对应那天粘贴（链接里没有日期，认不出是哪一晚）
  return (
    <section className="paste-box" aria-labelledby="paste-head">
      <div id="paste-head" className="find-head">订好了？把确认邮件或订单页面的文字整段粘贴到这里</div>
      <textarea
        aria-label="粘贴预订确认"
        rows={2}
        placeholder="从 Booking / Airbnb / 携程 / 官网 的确认邮件里全选复制，粘贴进来。会自动认出名称、日期、总价和确认号，对上是哪一晚并标记已订。"
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
