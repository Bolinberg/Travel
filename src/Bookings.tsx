import { useMemo, useState } from 'react';
import type { Category, Day, Expense, Rec, Trip } from './types';
import { CATEGORY_LABELS } from './types';
import { addDays, dayCosts, foodStandard, formatDate, money, pickedDiningCost, summarize } from './calc';
import { newId } from './id';
import { short, shortTitle } from './ui';
import { extractUrl, nameFromUrl, platformOf } from './search';
import StayPicker from './StayPicker';
import { classifyPaste, PasteBookingBox, usePasteBooking, usePasteDining, usePasteTicket } from './PasteBooking';
import { looksLikeBookingText } from './bookingParse';
import { parseExpenseText, type ParsedExpense } from './expenseParse';
import { aiParseExpenses } from './ai';
import { KNOWN_TICKETS } from './ticketParse';

type Update = (mutate: (draft: Trip) => void) => void;

/** 需要提前订的开销类别（渡轮、门票等）；其余算零花 */
export const BOOKABLE: Category[] = ['transport', 'activity'];

/** 要提前订的：渡轮、门票等（随手记的一笔不算） */
export const isBookable = (e: Expense) => BOOKABLE.includes(e.category) && !e.quick;

export type Status = 'todo' | 'booked' | 'paid';
export const STATUS_LABEL: Record<Status, string> = { todo: '未订', booked: '已订', paid: '已付' };

export const expenseStatus = (e: Expense): Status => (e.paid ? 'paid' : e.booked ? 'booked' : 'todo');

/** 住宿显示名：选定的候选；名字只是「某地住宿」这类占位时显示「还没选住宿」 */
export function stayLabel(d: Day): string {
  const pick = d.stayOptions.find((r) => r.picked);
  if (pick) return pick.name;
  const name = d.accommodation?.name.trim() ?? '';
  return name && !/住宿/.test(name) ? name : '还没选住宿';
}

/** 连续住同一个地方的几晚合成一组 */
export function stayGroups(trip: Trip) {
  const groups: { place: string; days: number[] }[] = [];
  trip.days.forEach((d, i) => {
    if (!d.accommodation) return;
    const last = groups[groups.length - 1];
    if (last && last.place === d.to && last.days[last.days.length - 1] === i - 1) last.days.push(i);
    else groups.push({ place: d.to, days: [i] });
  });
  return groups;
}


/** 当前住宿的预订链接：选定候选的官网 / 平台页，或备注里写的链接 */
export function stayLink(trip: Trip, dayIndex: number): string | null {
  const d = trip.days[dayIndex];
  const pick = d.stayOptions.find((r) => r.picked);
  if (pick) return pick.url || pick.bookingUrl || null;
  return d.accommodation?.notes.match(/https?:\/\/\S+/)?.[0] ?? null;
}

/** 选定某家住宿：连住的每一晚都改成它 */
export function pickStay(t: Trip, days: number[], r: Rec) {
  const on = !t.days[days[0]].stayOptions.find((x) => x.name === r.name)?.picked;
  for (const i of days) {
    const d = t.days[i];
    d.stayOptions.forEach((x) => (x.picked = on && x.name === r.name));
    if (!on || !d.accommodation) continue;
    d.accommodation.name = r.name;
    if (r.cost) d.accommodation.cost = r.cost;
    const link = r.url || r.bookingUrl;
    if (link && !d.accommodation.notes.includes(link)) {
      d.accommodation.notes = [d.accommodation.notes, `预订：${link}`].filter(Boolean).join('\n');
    }
  }
}

/** 一行文字记一笔：「停车 25」「Glenelg 冰淇淋 $18」→ 名称 + 金额 */
export function parseQuick(text: string): { title: string; amount: number } {
  const m = text.match(/\$?\s*(\d+(?:\.\d+)?)\s*(?:元|刀|aud)?\s*$/i) ?? text.match(/\$\s*(\d+(?:\.\d+)?)/);
  const amount = m ? Number(m[1]) : 0;
  const title = (m ? text.replace(m[0], '') : text).replace(/[\s:：,，]+$/, '').trim();
  return { title, amount };
}

/** 按名称猜类别 */
export function guessCategory(text: string): Category {
  if (/住|酒店|motel|hotel|apartment|airbnb|lodge|cabin/i.test(text)) return 'accommodation';
  if (/停车|parking|渡轮|渡船|ferry|toll|过路|bus|tram|train|火车|电车|租车|洗车/i.test(text)) return 'transport';
  if (/门票|票|ticket|动物园|zoo|博物馆|museum|公园|tour|滑沙|体验|游船|活动|entry|pass/i.test(text)) return 'activity';
  if (/吃|餐|饭|咖啡|cafe|coffee|冰淇淋|零食|早餐|午餐|晚餐|restaurant|超市|food|水果/i.test(text)) return 'food';
  if (/买|纪念品|购物|shop|souvenir|衣服/i.test(text)) return 'shopping';
  return 'other';
}

/** 「已订好」：填实付总价（默认按当前金额） */
function BookedInline({
  amount,
  hint,
  onConfirm,
  onCancel,
  onPasteText,
}: {
  amount: number;
  hint: string;
  onConfirm: (total: number) => void;
  onCancel: () => void;
  /** 粘贴整段确认：识别成功返回 true */
  onPasteText?: (text: string) => boolean;
}) {
  const [v, setV] = useState(0);
  const ok = () => onConfirm(v || amount);
  return (
    <div className="bk-pay-wrap">
      <div className="sp-pay bk-pay">
        <label className="small">
          实付总价（{hint}）
          <input
            type="number"
            inputMode="decimal"
            autoFocus
            placeholder={String(amount)}
            value={v || ''}
            onChange={(e) => setV(Number(e.target.value) || 0)}
            onKeyDown={(e) => e.key === 'Enter' && ok()}
          />
        </label>
        <button className="mini on" onClick={ok}>确认</button>
        <button className="mini" onClick={onCancel}>取消</button>
      </div>
      {onPasteText && (
        <textarea
          className="bk-pay-paste"
          aria-label="粘贴这一项的确认"
          rows={1}
          placeholder="或者把确认邮件整段粘贴到这里，自动填好金额和确认号"
          onPaste={(e) => {
            const text = e.clipboardData.getData('text');
            if (onPasteText(text)) e.preventDefault();
          }}
        />
      )}
    </div>
  );
}

type Item = {
  key: string;
  kind: 'stay' | 'ticket';
  title: string;
  sub: string;
  amount: number;
  link: string | null;
  booked: boolean;
  paid: boolean;
  estimated: boolean;
  /** 住宿：连住的晚数 */
  nights?: number;
  dayIndex: number;
  onBooked: (total: number) => void;
  onUnbook: () => void;
  onPaid: (v: boolean) => void;
  onRemove?: () => void;
  /** 住宿展开换一家 */
  group?: number[];
  /** 住宿还没选 */
  unchosen?: boolean;
};

/** 「花多少」：只需要「去订 → 已订好（填实付）」，其余自动算 */
export default function Bookings({ trip, update }: { trip: Trip; update: Update }) {
  const s = useMemo(() => summarize(trip), [trip]);
  const [paying, setPaying] = useState<string | null>(null);
  // 在某一行里粘贴确认后，在那一行下面显示识别结果
  const ticketPaste = usePasteTicket(trip, update);
  const stayPaste = usePasteBooking(trip, update);
  const [pasted, setPasted] = useState<string | null>(null);
  const [openStay, setOpenStay] = useState<number | null>(null);
  const [quick, setQuick] = useState('');
  const [quickDay, setQuickDay] = useState('');
  const [note, setNote] = useState('');

  const items: Item[] = [];
  for (const g of stayGroups(trip)) {
    const first = trip.days[g.days[0]];
    const accs = g.days.map((i) => trip.days[i].accommodation!);
    const picked = first.stayOptions.find((r) => r.picked);
    items.push({
      key: `stay-${g.days[0]}`,
      kind: 'stay',
      title: `${short(g.place)} · ${stayLabel(first)}`,
      sub: `${formatDate(addDays(trip.startDate, g.days[0]))} 入住 · ${g.days.length} 晚`,
      amount: accs.reduce((n, a) => n + (a.cost || 0), 0),
      link: stayLink(trip, g.days[0]),
      booked: accs.every((a) => a.booked),
      paid: accs.every((a) => a.paid),
      estimated: !accs.every((a) => a.booked) && !picked?.price?.startsWith('实付'),
      nights: g.days.length,
      dayIndex: g.days[0],
      group: g.days,
      unchosen: stayLabel(first) === '还没选住宿',
      onBooked: (total) =>
        update((t) => {
          const per = Math.round(total / g.days.length);
          for (const i of g.days) {
            const a = t.days[i].accommodation;
            if (!a) continue;
            a.booked = true;
            a.cost = per;
            const r = t.days[i].stayOptions.find((x) => x.picked);
            if (r) {
              r.cost = per;
              r.price = `实付 $${per}/晚`;
            }
          }
        }),
      onUnbook: () => update((t) => g.days.forEach((i) => t.days[i].accommodation && Object.assign(t.days[i].accommodation!, { booked: false, paid: false }))),
      onPaid: (v) => update((t) => g.days.forEach((i) => t.days[i].accommodation && (t.days[i].accommodation!.paid = v))),
    });
  }
  for (const e of trip.expenses.filter(isBookable)) {
    const i = trip.days.findIndex((d) => d.id === e.dayId);
    const detail = e.title.match(/[（(](.*)[）)]\s*$/)?.[1];
    const set = (m: (x: Expense) => void) =>
      update((t) => {
        const x = t.expenses.find((y) => y.id === e.id);
        if (x) m(x);
      });
    items.push({
      key: e.id,
      kind: 'ticket',
      title: shortTitle(e.title),
      sub: [i >= 0 ? `第 ${i + 1} 天 · ${formatDate(addDays(trip.startDate, i))}` : CATEGORY_LABELS[e.category], e.note || detail].filter(Boolean).join(' · '),
      amount: e.amount || 0,
      link: e.url ?? null,
      booked: !!(e.booked || e.paid),
      paid: e.paid,
      estimated: !(e.booked || e.paid),
      dayIndex: i < 0 ? 99 : i,
      onBooked: (total) => set((x) => ((x.booked = true), (x.amount = total))),
      onUnbook: () => set((x) => ((x.booked = false), (x.paid = false))),
      onPaid: (v) => set((x) => ((x.paid = v), v && (x.booked = true))),
      onRemove: () => update((t) => void (t.expenses = t.expenses.filter((y) => y.id !== e.id))),
    });
  }
  items.sort((a, b) => a.dayIndex - b.dayIndex);
  const todo = items.filter((x) => !x.booked);
  const done = items.filter((x) => x.booked);
  const confirmed = done.reduce((n, x) => n + x.amount, 0);
  const others = trip.expenses.filter((e) => !isBookable(e));
  const meals = trip.days.flatMap((d, i) => d.dining.filter((r) => r.picked).map((r) => ({ r, i })));
  const perDay = dayCosts(trip);
  const over = s.budgetLeft < 0;
  const scale = Math.max(s.total, trip.budget, 1);

  const addQuick = () => {
    const { url, title: rest } = extractUrl(quick);
    const { title, amount } = parseQuick(url ? rest : quick);
    const name = title || (url ? nameFromUrl(url) || `${platformOf(url)} 预订` : '');
    if (!name) return;
    const category = url && !/吃|餐/.test(name) ? (guessCategory(name) === 'other' ? 'activity' : guessCategory(name)) : guessCategory(name);
    update(
      (t) =>
        void t.expenses.push({
          id: newId(),
          title: name,
          amount,
          category: category === 'accommodation' || category === 'fuel' ? 'other' : category,
          dayId: quickDay || null,
          paid: false,
          ...(url ? { url } : { quick: true }),
        }),
    );
    setNote(`已记下「${name}」${amount ? ` ${money(amount)}` : ''} · ${CATEGORY_LABELS[category === 'accommodation' || category === 'fuel' ? 'other' : category]}${url ? '，放在「要订的」里' : ''}`);
    setQuick('');
  };

  // 粘贴整段：收据 / 消费通知 / 对账单几行 → 自动拆成一笔或几笔；预订确认交给对应的识别
  const mealPaste = usePasteDining(trip, update);
  const [routed, setRouted] = useState<'' | 'stay' | 'ticket' | 'meal'>('');
  const [quickBusy, setQuickBusy] = useState(false);
  const addPasted = (text: string): boolean => {
    if (!looksLikeBookingText(text) && !text.includes('\n')) return false;
    if (/check[- ]?in|confirmation (?:number|code)|booking reference|reservation (?:is )?confirmed|e-?tickets?|order #|your tickets?|party of/i.test(text)) {
      const kind = classifyPaste(text);
      const h = kind === 'meal' ? mealPaste : kind === 'ticket' ? ticketPaste : stayPaste;
      if (h.handle(text)) {
        setRouted(kind);
        setNote('');
        setQuick('');
        return true;
      }
    }
    setRouted('');
    const year = Number(trip.startDate.slice(0, 4)) || new Date().getFullYear();
    const write = (list: ParsedExpense[], ids: string[]) => {
      const dayIdOf = (date: string) => {
        const i = date ? trip.days.findIndex((_, k) => addDays(trip.startDate, k) === date) : -1;
        return i >= 0 ? trip.days[i].id : quickDay || null;
      };
      // 已经记过的（同一天同金额，比如已订好的渡轮、住宿）不重复记
      const dup = (e: ParsedExpense) => {
        const dayId = dayIdOf(e.date);
        const same = (a: number) => Math.abs(a - e.amount) < 0.01;
        if (trip.expenses.some((x) => same(x.amount || 0) && (x.dayId === dayId || !e.date))) return true;
        return stayGroups(trip).some(
          (g) => addDays(trip.startDate, g.days[0]) === e.date && same(g.days.reduce((n, i) => n + (trip.days[i].accommodation?.cost || 0), 0)),
        );
      };
      // 对账单里的渡轮、门票、住宿：对上「要订的」里已有那一项，改成实付并标记已付，不另记一笔
      const linked: string[] = [];
      const linkOf = (e: ParsedExpense): { kind: 'ticket'; id: string; title: string } | { kind: 'stay'; days: number[]; title: string } | null => {
        // 礼品店、咖啡馆这类（购物 / 餐饮）不是门票，不往门票上对
        const k = e.category === 'transport' || e.category === 'activity' || e.category === 'other' ? KNOWN_TICKETS.find((x) => x.re.test(e.title)) : undefined;
        const hit = k && trip.expenses.find((x) => !x.quick && k.match.test(x.title));
        if (hit) return { kind: 'ticket', id: hit.id, title: shortTitle(hit.title) };
        const words = e.title.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
        const g = stayGroups(trip).find((gr) => {
          const n = stayLabel(trip.days[gr.days[0]]).toLowerCase();
          return words.length > 0 && words.filter((w) => n.includes(w)).length >= Math.min(2, words.length);
        });
        return g ? { kind: 'stay', days: g.days, title: stayLabel(trip.days[g.days[0]]) } : null;
      };
      const links = list.map(linkOf);
      const keep = list.filter((e, k) => !links[k] && !dup(e));
      update((t) => {
        list.forEach((e, k) => {
          const l = links[k];
          if (!l) return;
          linked.push(l.title);
          if (l.kind === 'ticket') {
            const x = t.expenses.find((y) => y.id === l.id);
            if (x) Object.assign(x, { amount: e.amount, booked: true, paid: true });
          } else {
            const per = Math.round(e.amount / l.days.length);
            for (const i of l.days) {
              const a = t.days[i].accommodation;
              if (a) Object.assign(a, { cost: per, booked: true, paid: true });
            }
          }
        });
        t.expenses = t.expenses.filter((x) => !ids.includes(x.id));
        keep.forEach((e, k) =>
          t.expenses.push({
            id: ids[k],
            title: e.title,
            amount: e.amount,
            category: e.category === 'accommodation' ? 'other' : e.category,
            dayId: dayIdOf(e.date),
            paid: true,
            quick: true,
          }),
        );
      });
      const linkedTitles = links.filter(Boolean).map((l) => l!.title);
      const skipped = list.length - keep.length - linkedTitles.length;
      const linkedText = linkedTitles.length ? `；${linkedTitles.map((x) => `「${x}」`).join('、')}已改成实付并标记已付` : '';
      return `已记下 ${keep.length} 笔${keep.length ? '：' : ''}${keep
        .map((e) => `${e.title} ${money(e.amount)}（${CATEGORY_LABELS[e.category === 'accommodation' ? 'other' : e.category]}${e.date ? ` · ${formatDate(e.date)}` : ''}）`)
        .join('；')}${skipped ? `。另有 ${skipped} 笔之前已经记过，没有重复记` : ''}${linkedText}`;
    };
    const list = parseExpenseText(text, year);
    if (!list.length) {
      setNote('没认出金额。可以写成「停车 25」，或粘贴带金额的收据 / 消费通知。');
      return true;
    }
    const ids = Array.from({ length: Math.max(list.length, 20) }, () => newId());
    setNote(write(list, ids));
    setQuick('');
    // 请 Claude 核对：笔数或金额不一样时以 Claude 的为准
    setQuickBusy(true);
    aiParseExpenses(text, year).then((ai) => {
      setQuickBusy(false);
      if (!ai?.length) return;
      const sum = (l: ParsedExpense[]) => l.reduce((n, e) => n + e.amount, 0);
      if (ai.length === list.length && Math.abs(sum(ai) - sum(list)) < 0.01) {
        setNote((n) => `${n}（Claude 已核对）`);
        return;
      }
      setNote(`${write(ai, ids)}（Claude 核对后更正了）`);
    });
    return true;
  };
  const routedHook = routed === 'meal' ? mealPaste : routed === 'ticket' ? ticketPaste : routed === 'stay' ? stayPaste : null;

  const row = (x: Item) => (
    <li key={x.key} className={`bk-row ${x.booked ? 's-booked' : 's-todo'}`}>
      <div className="bk-main">
        <b className="bk-title">{x.title}</b>
        <div className="muted small">{x.sub}</div>
        {paying === x.key ? (
          <BookedInline
            amount={x.amount}
            hint={x.nights ? `${x.nights} 晚，AUD` : 'AUD'}
            onConfirm={(v) => {
              x.onBooked(v);
              setPaying(null);
            }}
            onCancel={() => setPaying(null)}
            onPasteText={(text) => {
              const ok = x.kind === 'ticket' ? ticketPaste.handle(text, x.key) : stayPaste.handle(text, x.dayIndex);
              if (ok) {
                setPaying(null);
                setPasted(x.key);
              }
              return ok;
            }}
          />
        ) : (
          <div className="row wrap gap bk-actions">
            {!x.booked && x.link && (
              <a className="mini on btn-link" href={x.link} target="_blank" rel="noreferrer">去订 ↗</a>
            )}
            {x.unchosen ? (
              <button className="mini on" onClick={() => setOpenStay(openStay === x.dayIndex ? null : x.dayIndex)}>
                {openStay === x.dayIndex ? '收起' : '选住宿'}
              </button>
            ) : !x.booked ? (
              <button className="mini" onClick={() => setPaying(x.key)}>已订好</button>
            ) : (
              <label className="check small">
                <input type="checkbox" checked={x.paid} onChange={(e) => x.onPaid(e.target.checked)} />
                已付款
              </label>
            )}
            {x.kind === 'stay' && !x.unchosen && (
              <button className="link small" onClick={() => setOpenStay(openStay === x.dayIndex ? null : x.dayIndex)}>
                {openStay === x.dayIndex ? '收起' : x.booked ? '看详情' : '换一家 / 粘贴链接'}
              </button>
            )}
            {x.booked && (
              <button className="link small" onClick={x.onUnbook}>改为未订</button>
            )}
            {x.onRemove && !x.booked && (
              <button className="icon" aria-label={`删除 ${x.title}`} onClick={x.onRemove}>×</button>
            )}
          </div>
        )}
        {pasted === x.key && (() => {
          const h = x.kind === 'ticket' ? ticketPaste : stayPaste;
          return (
            <>
              {h.message && <p className="small sp-added">{h.message}</p>}
              {h.warn && <p className="small warn-text">{h.warn}</p>}
              {h.busy && <p className="small muted">Claude 正在核对…</p>}
            </>
          );
        })()}
      </div>
      <div className="bk-side">
        <span className="bk-amt">{money(x.amount)}</span>
        <span className={`tag ${x.booked ? 'good' : 'warn'}`}>{x.booked ? (x.paid ? '已付' : '已订') : '估算'}</span>
      </div>
      {x.kind === 'stay' && openStay === x.dayIndex && (
        <div className="bk-picker">
          <StayPicker trip={trip} dayIndex={x.dayIndex} update={update} compact />
        </div>
      )}
    </li>
  );

  return (
    <>
      <section className="card budget-card">
        <div className="budget-line">
          <span className="muted small">预计总花费</span>
          <span className="budget-total">{money(s.total)}</span>
        </div>
        <div className="meter two" role="img" aria-label={`已确定 ${money(confirmed)}，估算 ${money(s.total - confirmed)}，预算 ${money(trip.budget)}`}>
          <span className="seg sure" style={{ width: `${(confirmed / scale) * 100}%` }} />
          <span className="seg est" style={{ width: `${((s.total - confirmed) / scale) * 100}%` }} />
          {trip.budget > 0 && <span className="meter-limit" style={{ left: `${(trip.budget / scale) * 100}%` }} />}
        </div>
        <div className="budget-sub">
          <span>
            <i className="sw sure" /> 已订好 <b>{money(confirmed)}</b>
          </span>
          <span>
            <i className="sw est" /> 估算 <b>{money(s.total - confirmed)}</b>
          </span>
          <span className={over ? 'bad' : ''}>
            预算 {money(trip.budget)}，{over ? `超出 ${money(-s.budgetLeft)}` : `还剩 ${money(s.budgetLeft)}`}
          </span>
        </div>
        <p className="muted small">
          都是自动算的：住宿按选定的价格、油费按里程、餐饮按每日标准和已选餐厅。订好一项点「已订好」填实付，估算就变成实数。
        </p>
      </section>

      <section className="bk-sec" aria-labelledby="bk-todo">
        <div className="bk-sec-head">
          <h2 id="bk-todo">要订的</h2>
          <span className="muted small">
            还有 {todo.length} 项 · 已订 {done.length}/{items.length}
          </span>
        </div>
        <PasteBookingBox trip={trip} update={update} />
        {todo.length ? <ul className="plain bk-list">{todo.map(row)}</ul> : <p className="small good">都订好了。</p>}
      </section>

      {done.length > 0 && (
        <section className="bk-sec" aria-labelledby="bk-done">
          <div className="bk-sec-head">
            <h2 id="bk-done">已订好</h2>
            <span className="muted small">{money(confirmed)}</span>
          </div>
          <ul className="plain bk-list">{done.map(row)}</ul>
        </section>
      )}

      <section className="bk-sec" aria-labelledby="bk-auto">
        <div className="bk-sec-head">
          <h2 id="bk-auto">自动估算</h2>
          <span className="muted small">{money(s.byCategory.fuel + s.byCategory.food)}</span>
        </div>
        <ul className="plain bk-list">
          <li className="bk-row auto">
            <div className="bk-main">
              <b>油费</b>
              <div className="muted small">
                {s.totalKm.toLocaleString()} km × {trip.vehicle.litresPer100km} L/100km × ${trip.vehicle.fuelPrice}/L；记下的加油收据合计更高时按实际算
              </div>
            </div>
            <span className="bk-amt">{money(s.byCategory.fuel)}</span>
          </li>
          <li className="bk-row auto">
            <div className="bk-main">
              <b>餐饮</b>
              <div className="muted small">
                每天 {money(foodStandard(trip))}；那天已选餐厅加上记下的餐饮开销更多时按实际算{meals.length ? `（已选 ${meals.length} 家餐厅）` : ''}
              </div>
              {meals.length > 0 && (
                <ul className="plain bk-meals small">
                  {meals.map(({ r, i }) => (
                    <li key={r.id}>
                      第 {i + 1} 天 · {r.name}
                      {r.cost ? ` · ${money(r.cost)}` : ' · 价格未填'}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <span className="bk-amt">{money(s.byCategory.food)}</span>
          </li>
        </ul>
      </section>

      <section className="bk-sec" aria-labelledby="bk-quick">
        <div className="bk-sec-head">
          <h2 id="bk-quick">记一笔</h2>
          <span className="muted small">{others.length ? `已记 ${others.length} 笔` : ''}</span>
        </div>
        <div className="quick">
          <textarea
            aria-label="记一笔"
            rows={2}
            placeholder="写一句「停车 25」，或粘贴收据、银行消费通知、对账单几行（自动拆成几笔、认出金额日期和类别）"
            value={quick}
            onPaste={(e) => {
              if (addPasted(e.clipboardData.getData('text'))) e.preventDefault();
            }}
            onChange={(e) => setQuick(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                if (!addPasted(quick)) addQuick();
              }
            }}
          />
          <select aria-label="哪一天" value={quickDay} onChange={(e) => setQuickDay(e.target.value)}>
            <option value="">不分日期</option>
            {trip.days.map((d, i) => (
              <option key={d.id} value={d.id}>第 {i + 1} 天</option>
            ))}
          </select>
          <button className="primary" disabled={!quick.trim()} onClick={() => addPasted(quick) || addQuick()}>记下</button>
        </div>
        {note && <p className="small sp-added">{note}</p>}
        {quickBusy && <p className="small muted">Claude 正在核对…</p>}
        {routedHook?.message && <p className="small sp-added">这是一份预订确认，已按{routed === 'stay' ? '住宿' : routed === 'meal' ? '餐厅' : '门票 / 渡轮'}处理：{routedHook.message}</p>}
        {routedHook?.warn && <p className="small warn-text">{routedHook.warn}</p>}
        {others.length > 0 && (
          <ul className="plain bk-list">
            {others.map((e) => {
              const i = trip.days.findIndex((d) => d.id === e.dayId);
              return (
                <li key={e.id} className="bk-row auto">
                  <div className="bk-main">
                    <b className="bk-title">{shortTitle(e.title)}</b>
                    <div className="muted small">
                      {CATEGORY_LABELS[e.category]}
                      {i >= 0 ? ` · 第 ${i + 1} 天` : ''}
                      {e.category === 'fuel' ? ' · 算在油费里（和估算取大）' : e.category === 'food' && i >= 0 ? ' · 算在当天餐饮里（和每日标准取大）' : ''}
                    </div>
                  </div>
                  <div className="bk-side">
                    <span className="bk-amt">{money(e.amount)}</span>
                    <button
                      className="icon"
                      aria-label={`删除 ${shortTitle(e.title)}`}
                      onClick={() => update((t) => void (t.expenses = t.expenses.filter((x) => x.id !== e.id)))}
                    >
                      ×
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <details className="card history bk-days-wrap">
        <summary>按天看花费</summary>
        <div className="table-scroll bk-days">
          <table>
            <thead>
              <tr>
                <th>天</th>
                <th>住宿</th>
                <th>餐饮</th>
                <th>油费</th>
                <th>门票等</th>
                <th>合计</th>
              </tr>
            </thead>
            <tbody>
              {perDay.map((c, i) => (
                <tr key={trip.days[i].id}>
                  <th>
                    第 {i + 1} 天 <span className="muted small">{short(trip.days[i].to)}</span>
                  </th>
                  <td>{c.stay ? money(c.stay) : '—'}</td>
                  <td className={pickedDiningCost(trip.days[i]) > foodStandard(trip) ? 'hl' : ''}>{money(c.food)}</td>
                  <td>{c.fuel ? money(c.fuel) : '—'}</td>
                  <td>{c.extras ? money(c.extras) : '—'}</td>
                  <td>
                    <b>{money(c.total)}</b>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}
