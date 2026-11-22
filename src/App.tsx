import { useEffect, useMemo, useRef, useState } from 'react';
import type { Category, Day, Trip } from './types';
import { CATEGORY_LABELS } from './types';
import { addDays, formatDate, fuelCost, mapsUrl, money, summarize } from './calc';
import { createDefaultTrip } from './defaultTrip';
import { downloadJson, isTrip, loadTrip, saveTrip } from './storage';
import { newId } from './id';

type Tab = 'overview' | 'itinerary' | 'costs' | 'checklist' | 'settings';
type Update = (mutate: (draft: Trip) => void) => void;

const TABS: { key: Tab; label: string }[] = [
  { key: 'overview', label: '概览' },
  { key: 'itinerary', label: '行程' },
  { key: 'costs', label: '费用' },
  { key: 'checklist', label: '清单' },
  { key: 'settings', label: '设置' },
];

export default function App() {
  const [trip, setTrip] = useState<Trip>(() => loadTrip() ?? createDefaultTrip());
  const [tab, setTab] = useState<Tab>('overview');

  useEffect(() => saveTrip(trip), [trip]);

  const update: Update = (mutate) =>
    setTrip((prev) => {
      const draft = structuredClone(prev);
      mutate(draft);
      return draft;
    });

  return (
    <div className="app">
      <header className="top">
        <h1>{trip.name}</h1>
        <p className="muted">
          {formatDate(trip.startDate)} – {formatDate(addDays(trip.startDate, Math.max(trip.days.length - 1, 0)))}
          {' · '}
          {trip.adults} 大 {trip.children} 小
        </p>
      </header>
      <nav className="tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            className={tab === t.key ? 'active' : ''}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <main>
        {tab === 'overview' && <Overview trip={trip} goTo={setTab} />}
        {tab === 'itinerary' && <Itinerary trip={trip} update={update} />}
        {tab === 'costs' && <Costs trip={trip} update={update} />}
        {tab === 'checklist' && <Checklist trip={trip} update={update} />}
        {tab === 'settings' && <Settings trip={trip} update={update} replace={setTrip} />}
      </main>
    </div>
  );
}

/* ---------------- 概览 ---------------- */

function Overview({ trip, goTo }: { trip: Trip; goTo: (t: Tab) => void }) {
  const s = useMemo(() => summarize(trip), [trip]);
  const done = trip.checklist.filter((c) => c.done).length;
  const pct = trip.budget > 0 ? Math.min(100, (s.total / trip.budget) * 100) : 0;
  const over = s.budgetLeft < 0;

  return (
    <>
      <section className="stats">
        <Stat label="天数" value={`${s.days} 天 ${s.nights} 晚`} />
        <Stat label="总里程" value={`${s.totalKm.toLocaleString()} km`} />
        <Stat label="驾驶时间" value={`约 ${s.driveHours} 小时`} />
        <Stat label="预计总花费" value={money(s.total)} />
      </section>

      <section className="card">
        <div className="row between">
          <h2>预算</h2>
          <span className={over ? 'bad' : 'good'}>
            {over ? `超出 ${money(-s.budgetLeft)}` : `剩余 ${money(s.budgetLeft)}`}
          </span>
        </div>
        <div className="bar" aria-label="预算使用">
          <div className={over ? 'fill over' : 'fill'} style={{ width: `${pct}%` }} />
        </div>
        <p className="muted">
          预计 {money(s.total)} / 预算 {money(trip.budget)} · 人均 {money(s.perPerson)} · 每天 {money(s.perDay)}
        </p>
        <p className="muted">
          已付 {money(s.paid)} · 待付 {money(s.unpaid)}
        </p>
        <button className="link" onClick={() => goTo('costs')}>查看费用明细 →</button>
      </section>

      <section className="card">
        <h2>待办提醒</h2>
        <ul className="plain">
          {s.unbooked > 0 && (
            <li>
              🏨 还有 <b>{s.unbooked}</b> 晚住宿未预订{' '}
              <button className="link" onClick={() => goTo('itinerary')}>去处理</button>
            </li>
          )}
          <li>
            ✅ 准备清单 {done}/{trip.checklist.length}{' '}
            <button className="link" onClick={() => goTo('checklist')}>查看</button>
          </li>
        </ul>
      </section>

      <section className="card">
        <h2>路线</h2>
        <ol className="route">
          {trip.days.map((d, i) => (
            <li key={d.id}>
              <span className="muted">D{i + 1}</span> {leg(d)}{' '}
              <span className="muted">{d.km} km</span>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <div className="muted small">{label}</div>
      <div className="value">{value}</div>
    </div>
  );
}

const short = (place: string) => place.replace(/\s+(VIC|SA|NSW)$/, '');
const leg = (d: Day) => (d.from === d.to ? `${short(d.from)} 周边` : `${short(d.from)} → ${short(d.to)}`);

/* ---------------- 行程 ---------------- */

function Itinerary({ trip, update }: { trip: Trip; update: Update }) {
  const [editing, setEditing] = useState<string | null>(null);

  const addDay = () => {
    const last = trip.days[trip.days.length - 1];
    const d: Day = {
      id: newId(),
      title: '新的一天',
      from: last?.to ?? '',
      to: last?.to ?? '',
      km: 0,
      driveHours: 0,
      stops: [],
      accommodation: null,
      notes: '',
    };
    update((t) => void t.days.push(d));
    setEditing(d.id);
  };

  return (
    <>
      {trip.days.map((d, i) => (
        <DayCard
          key={d.id}
          day={d}
          index={i}
          trip={trip}
          update={update}
          editing={editing === d.id}
          setEditing={(on) => setEditing(on ? d.id : null)}
        />
      ))}
      <button className="primary block" onClick={addDay}>+ 添加一天</button>
    </>
  );
}

function DayCard({
  day,
  index,
  trip,
  update,
  editing,
  setEditing,
}: {
  day: Day;
  index: number;
  trip: Trip;
  update: Update;
  editing: boolean;
  setEditing: (on: boolean) => void;
}) {
  const set = (mutate: (d: Day) => void) =>
    update((t) => {
      const d = t.days.find((x) => x.id === day.id);
      if (d) mutate(d);
    });
  const move = (dir: -1 | 1) =>
    update((t) => {
      const j = index + dir;
      if (j < 0 || j >= t.days.length) return;
      [t.days[index], t.days[j]] = [t.days[j], t.days[index]];
    });
  const remove = () => {
    if (!confirm(`删除第 ${index + 1} 天？`)) return;
    update((t) => {
      t.days = t.days.filter((x) => x.id !== day.id);
      t.expenses.forEach((e) => {
        if (e.dayId === day.id) e.dayId = null;
      });
    });
  };

  const fuel = fuelCost(day.km, trip.vehicle.litresPer100km, trip.vehicle.fuelPrice);
  const acc = day.accommodation;

  return (
    <section className="card day">
      <div className="row between">
        <div>
          <div className="muted small">
            第 {index + 1} 天 · {formatDate(addDays(trip.startDate, index))}
          </div>
          <h2>{day.title}</h2>
        </div>
        <button onClick={() => setEditing(!editing)}>{editing ? '完成' : '编辑'}</button>
      </div>

      {!editing ? (
        <>
          <p>
            {leg(day)}
            <span className="muted"> · {day.km} km · 约 {day.driveHours} 小时 · 油费 {money(fuel)}</span>
          </p>
          {day.stops.length > 0 && <p className="muted">途经：{day.stops.map(short).join(' · ')}</p>}
          {acc && (
            <p>
              🏨 {acc.name} · {money(acc.cost)}{' '}
              <span className={acc.booked ? 'tag good' : 'tag warn'}>{acc.booked ? '已订' : '未订'}</span>
              {acc.paid && <span className="tag good">已付</span>}
            </p>
          )}
          {day.notes && <p className="notes">{day.notes}</p>}
          <a className="link" href={mapsUrl(day.from, day.to, day.stops)} target="_blank" rel="noreferrer">
            在 Google 地图中导航 ↗
          </a>
        </>
      ) : (
        <div className="form">
          <Field label="标题">
            <input value={day.title} onChange={(e) => set((d) => void (d.title = e.target.value))} />
          </Field>
          <div className="grid2">
            <Field label="出发地">
              <input value={day.from} onChange={(e) => set((d) => void (d.from = e.target.value))} />
            </Field>
            <Field label="目的地">
              <input value={day.to} onChange={(e) => set((d) => void (d.to = e.target.value))} />
            </Field>
            <Field label="里程 (km)">
              <NumInput value={day.km} onChange={(v) => set((d) => void (d.km = v))} />
            </Field>
            <Field label="驾驶时间 (小时)">
              <NumInput value={day.driveHours} step={0.5} onChange={(v) => set((d) => void (d.driveHours = v))} />
            </Field>
          </div>
          <Field label="途经点 / 景点（每行一个）">
            <textarea
              rows={3}
              value={day.stops.join('\n')}
              onChange={(e) => set((d) => void (d.stops = e.target.value.split('\n')))}
            />
          </Field>
          <label className="check">
            <input
              type="checkbox"
              checked={!!acc}
              onChange={(e) =>
                set((d) => {
                  d.accommodation = e.target.checked
                    ? { name: '', cost: 0, booked: false, paid: false, notes: '' }
                    : null;
                })
              }
            />
            当晚住宿
          </label>
          {acc && (
            <div className="grid2">
              <Field label="住宿名称">
                <input
                  value={acc.name}
                  onChange={(e) => set((d) => void (d.accommodation!.name = e.target.value))}
                />
              </Field>
              <Field label="价格 (AUD)">
                <NumInput value={acc.cost} onChange={(v) => set((d) => void (d.accommodation!.cost = v))} />
              </Field>
              <label className="check">
                <input
                  type="checkbox"
                  checked={acc.booked}
                  onChange={(e) => set((d) => void (d.accommodation!.booked = e.target.checked))}
                />
                已预订
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={acc.paid}
                  onChange={(e) => set((d) => void (d.accommodation!.paid = e.target.checked))}
                />
                已付款
              </label>
              <Field label="住宿备注（确认号、入住时间…）" wide>
                <input
                  value={acc.notes}
                  onChange={(e) => set((d) => void (d.accommodation!.notes = e.target.value))}
                />
              </Field>
            </div>
          )}
          <Field label="备注">
            <textarea rows={2} value={day.notes} onChange={(e) => set((d) => void (d.notes = e.target.value))} />
          </Field>
          <div className="row">
            <button onClick={() => move(-1)} disabled={index === 0}>上移</button>
            <button onClick={() => move(1)} disabled={index === trip.days.length - 1}>下移</button>
            <span className="spacer" />
            <button className="danger" onClick={remove}>删除这天</button>
          </div>
        </div>
      )}
      {!editing && acc?.notes && <p className="muted small">住宿备注：{acc.notes}</p>}
    </section>
  );
}

/* ---------------- 费用 ---------------- */

const CATEGORIES = Object.keys(CATEGORY_LABELS) as Category[];

function Costs({ trip, update }: { trip: Trip; update: Update }) {
  const s = useMemo(() => summarize(trip), [trip]);
  const max = Math.max(...Object.values(s.byCategory), 1);
  const [draft, setDraft] = useState({ title: '', amount: 0, category: 'activity' as Category, dayId: '' });

  const add = () => {
    if (!draft.title.trim()) return;
    update((t) =>
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
  };

  const dayLabel = (id: string | null) => {
    const i = trip.days.findIndex((d) => d.id === id);
    return i >= 0 ? `D${i + 1}` : '';
  };

  return (
    <>
      <section className="card">
        <div className="row between">
          <h2>费用汇总</h2>
          <b>{money(s.total)}</b>
        </div>
        <div className="cats">
          {CATEGORIES.map((c) => (
            <div key={c} className="cat">
              <span>{CATEGORY_LABELS[c]}</span>
              <div className="bar thin">
                <div className="fill" style={{ width: `${(s.byCategory[c] / max) * 100}%` }} />
              </div>
              <span className="num">{money(s.byCategory[c])}</span>
            </div>
          ))}
        </div>
        <p className="muted small">
          油费 = {s.totalKm} km × {trip.vehicle.litresPer100km} L/100km × ${trip.vehicle.fuelPrice}/L；
          餐饮含每日标准（{trip.adults}×${trip.food.adultPerDay} + {trip.children}×${trip.food.childPerDay}）× {s.days} 天。
          可在「设置」中修改。
        </p>
      </section>

      <section className="card">
        <h2>其他开销</h2>
        <ul className="plain expenses">
          {trip.expenses.map((e) => (
            <li key={e.id} className="row">
              <input
                type="checkbox"
                title="已付"
                checked={e.paid}
                onChange={(ev) => update((t) => void (t.expenses.find((x) => x.id === e.id)!.paid = ev.target.checked))}
              />
              <div className="grow">
                <div className={e.paid ? 'paid' : ''}>{e.title}</div>
                <div className="muted small">
                  {CATEGORY_LABELS[e.category]} {dayLabel(e.dayId)} {e.paid ? '· 已付' : ''}
                </div>
              </div>
              <NumInput
                className="amount"
                value={e.amount}
                onChange={(v) => update((t) => void (t.expenses.find((x) => x.id === e.id)!.amount = v))}
              />
              <button
                className="icon"
                aria-label="删除"
                onClick={() => update((t) => void (t.expenses = t.expenses.filter((x) => x.id !== e.id)))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
        <div className="form add">
          <input
            placeholder="新开销，如：Glenelg 午餐"
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && add()}
          />
          <div className="grid3">
            <NumInput value={draft.amount} onChange={(v) => setDraft({ ...draft, amount: v })} />
            <select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value as Category })}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
              ))}
            </select>
            <select value={draft.dayId} onChange={(e) => setDraft({ ...draft, dayId: e.target.value })}>
              <option value="">不限日期</option>
              {trip.days.map((d, i) => (
                <option key={d.id} value={d.id}>D{i + 1} {d.title}</option>
              ))}
            </select>
          </div>
          <button className="primary" onClick={add}>添加</button>
        </div>
      </section>
    </>
  );
}

/* ---------------- 清单 ---------------- */

function Checklist({ trip, update }: { trip: Trip; update: Update }) {
  const groups = [...new Set(trip.checklist.map((c) => c.group))];
  const [text, setText] = useState('');
  const [group, setGroup] = useState(groups[0] ?? '出发前');

  const add = () => {
    if (!text.trim()) return;
    update((t) => void t.checklist.push({ id: newId(), text: text.trim(), group: group.trim() || '其他', done: false }));
    setText('');
  };

  return (
    <>
      {groups.map((g) => {
        const items = trip.checklist.filter((c) => c.group === g);
        return (
          <section key={g} className="card">
            <div className="row between">
              <h2>{g}</h2>
              <span className="muted">{items.filter((c) => c.done).length}/{items.length}</span>
            </div>
            <ul className="plain">
              {items.map((c) => (
                <li key={c.id} className="row">
                  <label className="check grow">
                    <input
                      type="checkbox"
                      checked={c.done}
                      onChange={(e) =>
                        update((t) => void (t.checklist.find((x) => x.id === c.id)!.done = e.target.checked))
                      }
                    />
                    <span className={c.done ? 'paid' : ''}>{c.text}</span>
                  </label>
                  <button
                    className="icon"
                    aria-label="删除"
                    onClick={() => update((t) => void (t.checklist = t.checklist.filter((x) => x.id !== c.id)))}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      <section className="card form add">
        <input
          placeholder="新增事项"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <input list="groups" placeholder="分组" value={group} onChange={(e) => setGroup(e.target.value)} />
        <datalist id="groups">
          {groups.map((g) => <option key={g} value={g} />)}
        </datalist>
        <button className="primary" onClick={add}>添加</button>
      </section>
    </>
  );
}

/* ---------------- 设置 ---------------- */

function Settings({ trip, update, replace }: { trip: Trip; update: Update; replace: (t: Trip) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);

  const importFile = async (f: File) => {
    try {
      const t = JSON.parse(await f.text());
      if (!isTrip(t)) throw new Error('格式不对');
      replace(t);
      alert('导入成功');
    } catch {
      alert('导入失败：请选择从本 App 导出的 JSON 文件');
    }
  };

  return (
    <>
      <section className="card form">
        <h2>基本信息</h2>
        <Field label="行程名称">
          <input value={trip.name} onChange={(e) => update((t) => void (t.name = e.target.value))} />
        </Field>
        <div className="grid2">
          <Field label="出发日期">
            <input
              type="date"
              value={trip.startDate}
              onChange={(e) => e.target.value && update((t) => void (t.startDate = e.target.value))}
            />
          </Field>
          <Field label="总预算 (AUD)">
            <NumInput value={trip.budget} onChange={(v) => update((t) => void (t.budget = v))} />
          </Field>
          <Field label="大人">
            <NumInput value={trip.adults} onChange={(v) => update((t) => void (t.adults = v))} />
          </Field>
          <Field label="小孩">
            <NumInput value={trip.children} onChange={(v) => update((t) => void (t.children = v))} />
          </Field>
        </div>
      </section>

      <section className="card form">
        <h2>车辆与油费</h2>
        <div className="grid2">
          <Field label="车辆">
            <input value={trip.vehicle.name} onChange={(e) => update((t) => void (t.vehicle.name = e.target.value))} />
          </Field>
          <Field label="油耗 (L/100km)">
            <NumInput
              value={trip.vehicle.litresPer100km}
              step={0.1}
              onChange={(v) => update((t) => void (t.vehicle.litresPer100km = v))}
            />
          </Field>
          <Field label="油价 (AUD/L)">
            <NumInput
              value={trip.vehicle.fuelPrice}
              step={0.01}
              onChange={(v) => update((t) => void (t.vehicle.fuelPrice = v))}
            />
          </Field>
        </div>
      </section>

      <section className="card form">
        <h2>餐饮标准（每人每天）</h2>
        <div className="grid2">
          <Field label="大人 (AUD)">
            <NumInput value={trip.food.adultPerDay} onChange={(v) => update((t) => void (t.food.adultPerDay = v))} />
          </Field>
          <Field label="小孩 (AUD)">
            <NumInput value={trip.food.childPerDay} onChange={(v) => update((t) => void (t.food.childPerDay = v))} />
          </Field>
        </div>
      </section>

      <section className="card">
        <h2>数据</h2>
        <p className="muted small">
          数据只保存在本设备浏览器中。要和家人共享，请「导出」后把文件发给对方，对方「导入」即可。
        </p>
        <div className="row wrap">
          <button className="primary" onClick={() => downloadJson(trip)}>导出 JSON</button>
          <button onClick={() => fileRef.current?.click()}>导入 JSON</button>
          <button onClick={() => window.print()}>打印 / 存为 PDF</button>
          <button
            className="danger"
            onClick={() => confirm('恢复默认行程？当前修改将丢失。') && replace(createDefaultTrip())}
          >
            恢复默认
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) importFile(f);
            e.target.value = '';
          }}
        />
      </section>
    </>
  );
}

/* ---------------- 通用 ---------------- */

function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <label className={wide ? 'field wide' : 'field'}>
      <span className="muted small">{label}</span>
      {children}
    </label>
  );
}

function NumInput({
  value,
  onChange,
  step = 1,
  className,
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  className?: string;
}) {
  return (
    <input
      className={className}
      type="number"
      inputMode="decimal"
      min={0}
      step={step}
      value={Number.isFinite(value) ? value : 0}
      onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
    />
  );
}
