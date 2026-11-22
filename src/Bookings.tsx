import { useMemo, useState } from 'react';
import type { Category, Day, Expense, Rec, Trip } from './types';
import { CATEGORY_LABELS } from './types';
import { addDays, formatDate, money, summarize } from './calc';
import { links } from './geo';
import { newId } from './id';
import { STAYS_CHECKED } from './stays';
import { NumInput, short, shortTitle } from './ui';

type Update = (mutate: (draft: Trip) => void) => void;

/** 需要提前订的开销类别（渡轮、门票等）；其余算零花 */
export const BOOKABLE: Category[] = ['transport', 'activity'];

export type Status = 'todo' | 'booked' | 'paid';
export const STATUS_LABEL: Record<Status, string> = { todo: '未订', booked: '已订', paid: '已付' };
const next: Record<Status, Status> = { todo: 'booked', booked: 'paid', paid: 'todo' };

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

const platform = (url: string) =>
  /wotif/i.test(url) ? 'Wotif' : /expedia/i.test(url) ? 'Expedia' : /airbnb/i.test(url) ? 'Airbnb' : 'Booking.com';

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

function StatusButton({ status, onClick }: { status: Status; onClick: () => void }) {
  return (
    <button className={`status-btn s-${status}`} onClick={onClick} title="点一下切换：未订 → 已订 → 已付">
      {STATUS_LABEL[status]}
    </button>
  );
}

/** 「预订」页：花费汇总 + 住宿 + 交通门票 + 零花 */
export default function Bookings({ trip, update }: { trip: Trip; update: Update }) {
  const s = useMemo(() => summarize(trip), [trip]);
  const groups = stayGroups(trip);
  const bookable = trip.expenses.filter((e) => BOOKABLE.includes(e.category));
  const others = trip.expenses.filter((e) => !BOOKABLE.includes(e.category));
  const stayDone = groups.filter((g) => g.days.every((i) => trip.days[i].accommodation?.booked)).length;
  const ticketDone = bookable.filter((e) => e.booked || e.paid).length;
  const totalItems = groups.length + bookable.length;
  const doneItems = stayDone + ticketDone;

  const setExpense = (id: string, mutate: (e: Expense) => void) =>
    update((t) => {
      const e = t.expenses.find((x) => x.id === id);
      if (e) mutate(e);
    });

  return (
    <>
      <BudgetCard trip={trip} doneItems={doneItems} totalItems={totalItems} />

      <section className="bk-sec" aria-labelledby="bk-stays">
        <div className="bk-sec-head">
          <h2 id="bk-stays">住宿</h2>
          <span className="muted small">
            {s.nights} 晚 · 已订 {stayDone}/{groups.length} 处
          </span>
        </div>
        <p className="muted small">
          每处都附有核实过的候选（标「推荐」的是首选）。评分来自 Booking.com、Expedia 等平台{STAYS_CHECKED ? `（${STAYS_CHECKED} 核对）` : ''}，价格是 12 月旺季估算，订前请点链接确认实时价格、4 人房型和最少入住晚数。
        </p>
        <ul className="plain bk-list">
          {groups.map((g) => (
            <StayRow key={g.days[0]} trip={trip} group={g} update={update} />
          ))}
        </ul>
        {!groups.length && <p className="muted small">这个方案没有需要住宿的晚上。</p>}
      </section>

      <section className="bk-sec" aria-labelledby="bk-tickets">
        <div className="bk-sec-head">
          <h2 id="bk-tickets">交通与门票</h2>
          <span className="muted small">已订 {ticketDone}/{bookable.length} 项</span>
        </div>
        <ul className="plain bk-list">
          {bookable.map((e) => (
            <ExpenseRow key={e.id} trip={trip} e={e} set={(m) => setExpense(e.id, m)} update={update} withStatus />
          ))}
        </ul>
        <AddExpense trip={trip} update={update} categories={BOOKABLE} placeholder="新增要订的项目，如：熊猫幕后体验" />
      </section>

      <section className="bk-sec" aria-labelledby="bk-other">
        <div className="bk-sec-head">
          <h2 id="bk-other">其他开销</h2>
        </div>
        <ul className="plain bk-list">
          <li className="bk-row auto">
            <div className="bk-main">
              <b>油费（自动估算）</b>
              <div className="muted small">
                {s.totalKm.toLocaleString()} km × {trip.vehicle.litresPer100km} L/100km × ${trip.vehicle.fuelPrice}/L
              </div>
            </div>
            <span className="bk-amt">{money(s.byCategory.fuel)}</span>
          </li>
          <li className="bk-row auto">
            <div className="bk-main">
              <b>每天吃饭（自动估算）</b>
              <div className="muted small">
                ({trip.adults}×${trip.food.adultPerDay} + {trip.children}×${trip.food.childPerDay}) × {s.days} 天，可在设置里改
              </div>
            </div>
            <span className="bk-amt">{money((trip.food.adultPerDay * trip.adults + trip.food.childPerDay * trip.children) * s.days)}</span>
          </li>
          {others.map((e) => (
            <ExpenseRow key={e.id} trip={trip} e={e} set={(m) => setExpense(e.id, m)} update={update} />
          ))}
        </ul>
        <AddExpense
          trip={trip}
          update={update}
          categories={(Object.keys(CATEGORY_LABELS) as Category[]).filter((c) => !BOOKABLE.includes(c) && c !== 'fuel' && c !== 'accommodation')}
          placeholder="新增开销，如：Glenelg 冰淇淋"
        />
      </section>
    </>
  );
}

function BudgetCard({ trip, doneItems, totalItems }: { trip: Trip; doneItems: number; totalItems: number }) {
  const s = useMemo(() => summarize(trip), [trip]);
  const over = s.budgetLeft < 0;
  const scale = Math.max(s.total, trip.budget, 1);
  const cats = (Object.keys(CATEGORY_LABELS) as Category[]).filter((c) => s.byCategory[c] > 0);
  return (
    <section className="card budget-card">
      <div className="budget-line">
        <span className="muted small">预计总花费</span>
        <span className="budget-total">{money(s.total)}</span>
      </div>
      <div className="meter" role="img" aria-label={`预计花费 ${money(s.total)}，预算 ${money(trip.budget)}`}>
        {cats.map((c) => (
          <span key={c} className={`seg c-${c}`} style={{ width: `${(s.byCategory[c] / scale) * 100}%` }} title={CATEGORY_LABELS[c]} />
        ))}
        {trip.budget > 0 && <span className="meter-limit" style={{ left: `${(trip.budget / scale) * 100}%` }} />}
      </div>
      <ul className="plain legend">
        {cats.map((c) => (
          <li key={c}>
            <i className={`sw c-${c}`} /> {CATEGORY_LABELS[c]} <b>{money(s.byCategory[c])}</b>
          </li>
        ))}
      </ul>
      <div className="budget-sub">
        <span className={over ? 'bad' : ''}>
          预算 {money(trip.budget)}，{over ? `超出 ${money(-s.budgetLeft)}` : `还剩 ${money(s.budgetLeft)}`}
        </span>
        <span>已付 {money(s.paid)}</span>
        <span>
          已订 {doneItems}/{totalItems} 项
        </span>
      </div>
    </section>
  );
}

function StayRow({ trip, group, update }: { trip: Trip; group: { place: string; days: number[] }; update: Update }) {
  const first = trip.days[group.days[0]];
  const nights = group.days.length;
  const checkin = addDays(trip.startDate, group.days[0]);
  const checkout = addDays(trip.startDate, group.days[nights - 1] + 1);
  const picked = first.stayOptions.find((r) => r.picked);
  const top = first.stayOptions.find((r) => r.top);
  const all = group.days.map((i) => trip.days[i].accommodation!);
  const status: Status = all.every((a) => a.paid) ? 'paid' : all.every((a) => a.booked) ? 'booked' : 'todo';
  const [open, setOpen] = useState(false);
  const link = stayLink(trip, group.days[0]);
  const cost = all.reduce((n, a) => n + (a.cost || 0), 0);

  const setStatus = (st: Status) =>
    update((t) => {
      for (const i of group.days) {
        const a = t.days[i].accommodation;
        if (!a) continue;
        a.booked = st !== 'todo';
        a.paid = st === 'paid';
      }
    });
  const pick = (r: Rec) => update((t) => pickStay(t, group.days, r));

  return (
    <li className={`bk-row stay s-${status}`}>
      <div className="bk-main">
        <div className="muted small">
          {formatDate(checkin)} 入住 · {nights} 晚 · 第 {group.days[0] + 1}
          {nights > 1 ? `–${group.days[nights - 1] + 1}` : ''} 天
        </div>
        <b className="bk-title">
          {short(group.place)} · {stayLabel(first)}
        </b>
        {!picked && top && status === 'todo' && (
          <div className="bk-suggest small">
            推荐 <b>{top.name}</b>
            {top.rating ? ` · ★ ${top.rating}` : ''}{' '}
            <button className="link strong" onClick={() => pick(top)}>选这家</button>
          </div>
        )}
        <div className="row wrap gap small bk-actions">
          {link && (
            <a className="link strong" href={link} target="_blank" rel="noreferrer">去订 ↗</a>
          )}
          {first.stayOptions.length > 0 && (
            <button className="link" onClick={() => setOpen(!open)} aria-expanded={open}>
              {open ? '收起候选' : `看候选（${first.stayOptions.length}）`}
            </button>
          )}
          <a className="link" href={links.booking(first.to, checkin, checkout, trip.adults)} target="_blank" rel="noreferrer">
            Booking 搜同日期
          </a>
        </div>
      </div>
      <div className="bk-side">
        <span className="bk-amt">{money(cost)}</span>
        <StatusButton status={status} onClick={() => setStatus(next[status])} />
      </div>
      {open && (
        <ul className="plain stay-options">
          {first.stayOptions.map((r) => (
            <li key={r.id} className={r.picked ? 'stay-opt picked' : 'stay-opt'}>
              <div className="stay-opt-top">
                <b className="stay-opt-name">{r.name}</b>
                {r.top && <span className="tag top">推荐</span>}
              </div>
              <div className="muted small">{r.type}</div>
              <div className="stay-opt-meta small">
                {r.rating && <span className="rating">★ {r.rating}</span>}
                <span>{r.price}</span>
              </div>
              {r.note && <p className="small">{r.note}</p>}
              <div className="row wrap gap small">
                {r.url && <a className="link strong" href={r.url} target="_blank" rel="noreferrer">官网 ↗</a>}
                {r.bookingUrl && (
                  <a className="link strong" href={r.bookingUrl} target="_blank" rel="noreferrer">{platform(r.bookingUrl)} ↗</a>
                )}
                <a className="link" href={links.googleMaps(`${r.name} ${r.where}`)} target="_blank" rel="noreferrer">地图</a>
                <span className="spacer" />
                <button className={r.picked ? 'mini on' : 'mini'} onClick={() => pick(r)}>
                  {r.picked ? '已选 ✓' : '选这家'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function ExpenseRow({
  trip,
  e,
  set,
  update,
  withStatus = false,
}: {
  trip: Trip;
  e: Expense;
  set: (mutate: (e: Expense) => void) => void;
  update: Update;
  withStatus?: boolean;
}) {
  const i = trip.days.findIndex((d) => d.id === e.dayId);
  const status = expenseStatus(e);
  const detail = e.title.match(/[（(](.*)[）)]\s*$/)?.[1];
  return (
    <li className={`bk-row s-${withStatus ? status : e.paid ? 'paid' : 'todo'}`}>
      <div className="bk-main">
        <b className="bk-title">{shortTitle(e.title)}</b>
        <div className="muted small">
          {i >= 0 ? `第 ${i + 1} 天 · ${formatDate(addDays(trip.startDate, i))}` : CATEGORY_LABELS[e.category]}
          {detail ? ` · ${detail}` : ''}
        </div>
      </div>
      <div className="bk-side">
        <span className="bk-amt-edit">
          $<NumInput value={e.amount} label={`${shortTitle(e.title)} 金额`} onChange={(v) => set((x) => void (x.amount = v))} />
        </span>
        {withStatus ? (
          <StatusButton
            status={status}
            onClick={() =>
              set((x) => {
                const n = next[expenseStatus(x)];
                x.booked = n !== 'todo';
                x.paid = n === 'paid';
              })
            }
          />
        ) : (
          <button className={`status-btn s-${e.paid ? 'paid' : 'todo'}`} onClick={() => set((x) => void (x.paid = !x.paid))}>
            {e.paid ? '已付' : '未付'}
          </button>
        )}
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
}

function AddExpense({
  trip,
  update,
  categories,
  placeholder,
}: {
  trip: Trip;
  update: Update;
  categories: Category[];
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ title: '', amount: 0, category: categories[0], dayId: '' });
  const add = () => {
    if (!draft.title.trim()) return;
    update(
      (t) =>
        void t.expenses.push({
          id: newId(),
          title: draft.title.trim(),
          amount: draft.amount,
          category: draft.category,
          dayId: draft.dayId || null,
          paid: false,
        }),
    );
    setDraft({ ...draft, title: '', amount: 0 });
    setOpen(false);
  };
  if (!open) {
    return (
      <button className="add-line" onClick={() => setOpen(true)}>
        + 添加
      </button>
    );
  }
  return (
    <div className="form add card">
      <input autoFocus placeholder={placeholder} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && add()} />
      <div className="grid3">
        <NumInput value={draft.amount} label="金额" onChange={(v) => setDraft({ ...draft, amount: v })} />
        <select aria-label="类别" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value as Category })}>
          {categories.map((c) => (
            <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
          ))}
        </select>
        <select aria-label="日期" value={draft.dayId} onChange={(e) => setDraft({ ...draft, dayId: e.target.value })}>
          <option value="">不限日期</option>
          {trip.days.map((d, i) => (
            <option key={d.id} value={d.id}>第 {i + 1} 天</option>
          ))}
        </select>
      </div>
      <div className="row">
        <button className="primary" onClick={add}>添加</button>
        <button onClick={() => setOpen(false)}>取消</button>
      </div>
    </div>
  );
}
