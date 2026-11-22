import { useEffect, useMemo, useRef, useState } from 'react';
import type { Category, Day, Place, Rec, Trip } from './types';
import { CATEGORY_LABELS } from './types';
import { addDays, formatDate, fuelCost, mapsUrl, money, summarize } from './calc';
import { createBlankTrip, createDefaultTrip, duplicateTrip, TEMPLATES } from './defaultTrip';
import { downloadJson, loadStore, migrateTrip, saveStore, type Store } from './storage';
import { newId } from './id';
import { AI_MODELS, applyResult, generateDayRecs, loadAiSettings, saveAiSettings, type AiSettings } from './ai';
import TripMap, { dayColor, dayPlaces } from './TripMap';
import { fetchRoute, findPlace, geocode, geocodeAll, links, missingPlaces, useWiki } from './geo';

type Tab = 'overview' | 'map' | 'itinerary' | 'costs' | 'checklist' | 'settings';
type Update = (mutate: (draft: Trip) => void) => void;

const TABS: { key: Tab; label: string }[] = [
  { key: 'overview', label: '概览' },
  { key: 'map', label: '地图' },
  { key: 'itinerary', label: '行程' },
  { key: 'costs', label: '费用' },
  { key: 'checklist', label: '清单' },
  { key: 'settings', label: '设置' },
];

function initialStore(): Store {
  const s = loadStore();
  if (s) return s;
  const t = createDefaultTrip();
  return { activeId: t.id, trips: [t] };
}

export default function App() {
  const [store, setStore] = useState<Store>(initialStore);
  const trip = store.trips.find((t) => t.id === store.activeId) ?? store.trips[0];
  const [tab, setTab] = useState<Tab>('overview');
  const [showTrips, setShowTrips] = useState(false);
  const [focus, setFocus] = useState<number | null>(null);
  const showOnMap = (i: number | null) => {
    setFocus(i);
    setTab('map');
    window.scrollTo(0, 0);
  };

  useEffect(() => saveStore(store), [store]);

  // 绑定当前行程 id：异步操作（如查坐标）完成时即使已切换行程，也写回原行程
  const tripId = trip.id;
  const update: Update = (mutate) =>
    setStore((s) => ({
      ...s,
      trips: s.trips.map((t) => {
        if (t.id !== tripId) return t;
        const draft = structuredClone(t);
        mutate(draft);
        return draft;
      }),
    }));

  const addTrip = (t: Trip) => {
    setStore((s) => ({ activeId: t.id, trips: [...s.trips, t] }));
    setShowTrips(false);
    setTab('overview');
    setFocus(null);
  };
  const switchTrip = (id: string) => {
    setStore((s) => ({ ...s, activeId: id }));
    setShowTrips(false);
    setTab('overview');
    setFocus(null);
  };
  const deleteTrip = (id: string) =>
    setStore((s) => {
      const trips = s.trips.filter((t) => t.id !== id);
      if (!trips.length) {
        const t = createDefaultTrip();
        return { activeId: t.id, trips: [t] };
      }
      return { activeId: s.activeId === id ? trips[0].id : s.activeId, trips };
    });

  return (
    <div className="app">
      <header className="top">
        <div className="row between">
          <h1>{trip.name}</h1>
          <button className="mini" onClick={() => setShowTrips(!showTrips)}>
            {showTrips ? '关闭' : `我的行程 (${store.trips.length})`}
          </button>
        </div>
        <p className="muted">
          {formatDate(trip.startDate)} – {formatDate(addDays(trip.startDate, Math.max(trip.days.length - 1, 0)))}
          {' · '}
          {trip.adults} 大 {trip.children} 小
        </p>
      </header>
      {showTrips && (
        <TripsPanel
          store={store}
          current={trip}
          onSwitch={switchTrip}
          onAdd={addTrip}
          onDelete={deleteTrip}
        />
      )}
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
        {tab === 'overview' && <Overview trip={trip} goTo={setTab} showOnMap={showOnMap} update={update} />}
        {tab === 'map' && <MapView trip={trip} focus={focus} setFocus={setFocus} goTo={setTab} update={update} />}
        {tab === 'itinerary' && <Itinerary trip={trip} update={update} showOnMap={showOnMap} />}
        {tab === 'costs' && <Costs trip={trip} update={update} />}
        {tab === 'checklist' && <Checklist trip={trip} update={update} />}
        {tab === 'settings' && <Settings trip={trip} update={update} onImport={addTrip} />}
      </main>
    </div>
  );
}

/* ---------------- 概览 ---------------- */

function Overview({
  trip,
  goTo,
  showOnMap,
  update,
}: {
  trip: Trip;
  goTo: (t: Tab) => void;
  showOnMap: (i: number | null) => void;
  update: Update;
}) {
  const s = useMemo(() => summarize(trip), [trip]);
  const done = trip.checklist.filter((c) => c.done).length;
  const pct = trip.budget > 0 ? Math.min(100, (s.total / trip.budget) * 100) : 0;
  const over = s.budgetLeft < 0;

  return (
    <>
      <MissingBanner trip={trip} update={update} />
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
        <div className="row between">
          <h2>路线</h2>
          <button className="link" onClick={() => showOnMap(null)}>大地图 →</button>
        </div>
        <TripMap trip={trip} focus={null} height={260} />
        <ol className="route">
          {trip.days.map((d, i) => (
            <li key={d.id}>
              <button className="link plainlink" onClick={() => showOnMap(i)}>
                <span className="dot" style={{ background: dayColor(i) }} />
                <span className="muted">D{i + 1}</span> {leg(d)}
              </button>{' '}
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

const short = (place: string) =>
  place.replace(/,?\s+(VIC|NSW|QLD|SA|WA|TAS|NT|ACT)$/i, '').replace(/,\s*(Australia|New Zealand)$/i, '');
const leg = (d: Day) => (d.from === d.to ? `${short(d.from)} 周边` : `${short(d.from)} → ${short(d.to)}`);

/* ---------------- 行程 ---------------- */

function Itinerary({
  trip,
  update,
  showOnMap,
}: {
  trip: Trip;
  update: Update;
  showOnMap: (i: number | null) => void;
}) {
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
      stayOptions: [],
      dining: [],
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
          showOnMap={() => showOnMap(i)}
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
  showOnMap,
}: {
  day: Day;
  index: number;
  trip: Trip;
  update: Update;
  editing: boolean;
  setEditing: (on: boolean) => void;
  showOnMap: () => void;
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
          <div className="row wrap gap">
            <button className="link" onClick={showOnMap}>在地图上看</button>
            <a className="link" href={mapsUrl(day.from, day.to, day.stops)} target="_blank" rel="noreferrer">
              Google 地图导航 ↗
            </a>
          </div>
          <details className="fold">
            <summary>
              景点 {dayPlaces(trip, day).filter((p) => p.desc && p.name !== day.from).length} · 住宿推荐{' '}
              {day.stayOptions.length} · 餐饮推荐 {day.dining.length}
            </summary>
            <DayGuide trip={trip} day={day} index={index} update={update} />
          </details>
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
          <PlaceTools trip={trip} day={day} update={update} set={set} />
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

/* ---------------- 我的行程 ---------------- */

function TripsPanel({
  store,
  current,
  onSwitch,
  onAdd,
  onDelete,
}: {
  store: Store;
  current: Trip;
  onSwitch: (id: string) => void;
  onAdd: (t: Trip) => void;
  onDelete: (id: string) => void;
}) {
  const [creating, setCreating] = useState(false);
  return (
    <section className="card trips">
      <h2>我的行程</h2>
      <ul className="plain">
        {store.trips.map((t) => {
          const end = addDays(t.startDate, Math.max(t.days.length - 1, 0));
          const active = t.id === current.id;
          return (
            <li key={t.id} className={active ? 'row picked' : 'row'}>
              <button className="link grow left" onClick={() => onSwitch(t.id)}>
                <b>{t.name}</b>
                <div className="muted small">
                  {formatDate(t.startDate)} – {formatDate(end)} · {t.days.length} 天 · 预计 {money(summarize(t).total)}
                </div>
              </button>
              {active && <span className="tag good">当前</span>}
              <button
                className="icon"
                aria-label="删除行程"
                onClick={() => confirm(`删除行程「${t.name}」？此操作无法撤销（可先在设置里导出备份）。`) && onDelete(t.id)}
              >
                ×
              </button>
            </li>
          );
        })}
      </ul>
      {creating ? (
        <NewTripForm current={current} onCreate={onAdd} onCancel={() => setCreating(false)} />
      ) : (
        <button className="primary block" onClick={() => setCreating(true)}>+ 新建行程</button>
      )}
    </section>
  );
}

function NewTripForm({
  current,
  onCreate,
  onCancel,
}: {
  current: Trip;
  onCreate: (t: Trip) => void;
  onCancel: () => void;
}) {
  const [mode, setMode] = useState<string>('blank');
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({
    name: '',
    origin: 'Melbourne VIC',
    destination: '',
    startDate: addDays(new Date().toISOString().slice(0, 10), 30),
    days: 5,
    adults: current.adults,
    children: current.children,
    budget: 3000,
  });

  const create = async () => {
    if (mode === 'copy') {
      return onCreate(duplicateTrip(current, f.name.trim() || `${current.name}（副本）`, f.startDate));
    }
    const tpl = TEMPLATES.find((x) => x.key === mode);
    if (tpl) {
      const t = tpl.create();
      if (f.name.trim()) t.name = f.name.trim();
      t.startDate = f.startDate;
      return onCreate(t);
    }
    if (!f.origin.trim() && !f.destination.trim()) return alert('请至少填写出发地或目的地');
    setBusy(true);
    const t = createBlankTrip(f);
    // 先为出发地/目的地查好坐标，地图打开即可显示
    await geocodeAll(missingPlaces(t), (name, hit) => {
      if (hit) t.places.push({ name, label: short(name), ...hit });
    });
    // 按真实路线填入每天里程和驾驶时间（离线时保持 0，之后可在编辑里重算）
    for (const d of t.days) {
      const r = await fetchRoute(dayPlaces(t, d));
      if (r) Object.assign(d, { km: r.km, driveHours: r.hours });
    }
    setBusy(false);
    onCreate(t);
  };

  const blank = mode === 'blank';
  return (
    <div className="form add">
      <Field label="从哪里开始">
        <select value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="blank">空白行程（填出发地、目的地、天数）</option>
          <option value="copy">复制当前行程「{current.name}」的路线和预算</option>
          {TEMPLATES.map((t) => (
            <option key={t.key} value={t.key}>{t.label}</option>
          ))}
        </select>
      </Field>
      <Field label="行程名称">
        <input
          placeholder={blank ? '如：悉尼 → 布里斯班 海岸自驾' : '留空则使用默认名称'}
          value={f.name}
          onChange={(e) => setF({ ...f, name: e.target.value })}
        />
      </Field>
      {blank && (
        <div className="grid2">
          <Field label="出发地（英文更准）">
            <input placeholder="Melbourne VIC" value={f.origin} onChange={(e) => setF({ ...f, origin: e.target.value })} />
          </Field>
          <Field label="目的地">
            <input
              placeholder="Sydney NSW"
              value={f.destination}
              onChange={(e) => setF({ ...f, destination: e.target.value })}
            />
          </Field>
          <Field label="天数">
            <NumInput value={f.days} onChange={(v) => setF({ ...f, days: v })} />
          </Field>
          <Field label="预算 (AUD)">
            <NumInput value={f.budget} onChange={(v) => setF({ ...f, budget: v })} />
          </Field>
          <Field label="大人">
            <NumInput value={f.adults} onChange={(v) => setF({ ...f, adults: v })} />
          </Field>
          <Field label="小孩">
            <NumInput value={f.children} onChange={(v) => setF({ ...f, children: v })} />
          </Field>
        </div>
      )}
      <Field label="出发日期">
        <input type="date" value={f.startDate} onChange={(e) => e.target.value && setF({ ...f, startDate: e.target.value })} />
      </Field>
      {blank && (
        <p className="muted small">
          会生成「出发 → 目的地停留 → 返程」的骨架。之后在「行程」里逐天改目的地、加途经景点，点「全部定位」即可上地图，并可按真实路线自动计算里程。
        </p>
      )}
      <div className="row">
        <button className="primary" disabled={busy} onClick={create}>{busy ? '正在定位和计算路线…' : '创建'}</button>
        <button onClick={onCancel}>取消</button>
      </div>
    </div>
  );
}

/* ---------------- 地图 ---------------- */

function MapView({
  trip,
  focus,
  setFocus,
  goTo,
  update,
}: {
  trip: Trip;
  focus: number | null;
  setFocus: (i: number | null) => void;
  goTo: (t: Tab) => void;
  update: Update;
}) {
  const day = focus !== null ? trip.days[focus] : null;
  return (
    <>
      <MissingBanner trip={trip} update={update} />
      <div className="chips">
        <button className={focus === null ? 'chip active' : 'chip'} onClick={() => setFocus(null)}>全程</button>
        {trip.days.map((d, i) => (
          <button
            key={d.id}
            className={focus === i ? 'chip active' : 'chip'}
            style={focus === i ? { background: dayColor(i), borderColor: dayColor(i) } : { borderColor: dayColor(i) }}
            onClick={() => setFocus(i)}
          >
            D{i + 1}
          </button>
        ))}
      </div>
      <section className="card flush">
        <TripMap trip={trip} focus={focus} height={440} />
      </section>
      {day ? (
        <section className="card">
          <div className="muted small">
            第 {focus! + 1} 天 · {formatDate(addDays(trip.startDate, focus!))} · {day.km} km · 约 {day.driveHours} 小时
          </div>
          <h2>{day.title}</h2>
          <DayGuide trip={trip} day={day} index={focus!} update={update} />
          <button className="link" onClick={() => goTo('itinerary')}>去行程页编辑 →</button>
        </section>
      ) : (
        <section className="card">
          <h2>图例</h2>
          <p className="muted small">
            彩色线 = 每天的驾车路线（虚线表示真实道路还在加载或离线）；带数字的圆点 = 当晚过夜地；小圆点 = 途经景点。点任意标记查看风景照片和介绍。
          </p>
        </section>
      )}
    </>
  );
}

/** 有地点缺坐标时提示一键定位 */
function MissingBanner({ trip, update }: { trip: Trip; update: Update }) {
  const missing = missingPlaces(trip);
  const [busy, setBusy] = useState(false);
  if (!missing.length) return null;
  const run = async () => {
    setBusy(true);
    await geocodeAll(missing, (name, hit) => {
      if (hit) update((t) => void t.places.push({ name, label: short(name), ...hit }));
    });
    setBusy(false);
  };
  return (
    <section className="card banner small">
      <span>
        {missing.length} 个地点还没有坐标，地图上暂不显示：{missing.slice(0, 4).map(short).join('、')}
        {missing.length > 4 ? '…' : ''}
      </span>
      <button className="mini on" disabled={busy} onClick={run}>{busy ? '定位中…' : '全部定位'}</button>
    </section>
  );
}

/** 某天的景点、住宿、餐饮信息（行程页与地图页共用） */
function DayGuide({ trip, day, index, update }: { trip: Trip; day: Day; index: number; update?: Update }) {
  const sights = dayPlaces(trip, day).filter((p) => p.desc && p.name !== day.from);
  const town = short(day.to);
  const checkin = addDays(trip.startDate, index);
  const setRecs = (key: 'stayOptions' | 'dining', mutate: (list: Rec[], d: Day) => void) =>
    update?.((t) => {
      const d = t.days.find((x) => x.id === day.id);
      if (d) mutate(d[key], d);
    });

  return (
    <div className="guide">
      {update && <AiButton trip={trip} index={index} update={update} />}
      {sights.length > 0 && (
        <>
          <h3>📍 景点与风景</h3>
          <div className="sights">
            {sights.map((p) => (
              <PlaceCard key={p.name} place={p} />
            ))}
          </div>
        </>
      )}

      {day.accommodation && (
        <RecSection
          title="🏨 住宿推荐"
          recs={day.stayOptions}
          pickLabel={['选这家', '已选']}
          more={[
            { label: 'Booking 搜索', href: links.booking(day.to, checkin, addDays(checkin, 1), trip.adults) },
            { label: 'Tripadvisor 酒店', href: links.tripadvisor(`hotels ${town}`) },
          ]}
          onPick={
            update &&
            ((r) =>
              setRecs('stayOptions', (list, d) => {
                const picked = !r.picked;
                list.forEach((x) => (x.picked = picked && x.id === r.id));
                if (picked && d.accommodation) {
                  d.accommodation.name = r.name;
                  if (r.cost) d.accommodation.cost = r.cost;
                }
              }))
          }
          onRemove={update && ((r) => setRecs('stayOptions', (_, d) => void (d.stayOptions = d.stayOptions.filter((x) => x.id !== r.id))))}
          onAdd={update && ((r) => setRecs('stayOptions', (list) => void list.push(r)))}
          defaultWhere={town}
        />
      )}

      <RecSection
        title="🍽 餐饮推荐"
        recs={day.dining}
        pickLabel={['想去', '想去 ✓']}
        more={[
          { label: 'Tripadvisor 餐厅', href: links.tripadvisor(`restaurants ${town}`) },
          { label: 'Google 附近餐厅', href: links.googleMaps(`restaurants ${day.to}`) },
        ]}
        onPick={update && ((r) => setRecs('dining', (list) => {
          const x = list.find((y) => y.id === r.id);
          if (x) x.picked = !x.picked;
        }))}
        onRemove={update && ((r) => setRecs('dining', (_, d) => void (d.dining = d.dining.filter((x) => x.id !== r.id))))}
        onAdd={update && ((r) => setRecs('dining', (list) => void list.push(r)))}
        defaultWhere={town}
      />
    </div>
  );
}

/** 为某一天调用 AI 生成推荐 */
function AiButton({ trip, index, update }: { trip: Trip; index: number; update: Update }) {
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const day = trip.days[index];

  const run = async () => {
    const settings = loadAiSettings();
    if (!settings.apiKey) {
      setStatus('请先在「设置 → AI 推荐」里填写 Anthropic API Key。');
      return;
    }
    setBusy(true);
    try {
      const r = await generateDayRecs(settings, trip, index, setStatus);
      const counts = { sights: 0, stays: 0, dining: 0 };
      update((t) => {
        Object.assign(counts, applyResult(t, day.id, r.result));
      });
      setStatus(
        `已添加 景点 ${counts.sights} · 住宿 ${counts.stays} · 餐饮 ${counts.dining}` +
          `（搜索 ${r.searches} 次，约 US$${r.costUsd.toFixed(2)}）。推荐来自网络搜索，预订前请再核实。`,
      );
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ai">
      <button className="mini ai-btn" disabled={busy} onClick={run}>
        {busy ? '✨ 生成中…' : '✨ AI 生成推荐'}
      </button>
      {status && <span className="muted small">{status}</span>}
    </div>
  );
}

function PlaceCard({ place }: { place: Place }) {
  const wiki = useWiki(place.wiki);
  return (
    <article className="sight">
      <div className="photo">
        {wiki?.thumb ? <img src={wiki.thumb} alt={place.label} loading="lazy" /> : <span>📷</span>}
      </div>
      <div className="body">
        <b>{place.label}</b>
        <p className="small">{place.desc}</p>
        <div className="row wrap gap small">
          <a className="link" href={links.tripadvisor(short(place.name))} target="_blank" rel="noreferrer">Tripadvisor</a>
          <a className="link" href={links.googleMaps(place.name)} target="_blank" rel="noreferrer">地图</a>
          {wiki?.url && <a className="link" href={wiki.url} target="_blank" rel="noreferrer">维基百科</a>}
        </div>
      </div>
    </article>
  );
}

function RecSection({
  title,
  recs,
  pickLabel,
  more,
  onPick,
  onRemove,
  onAdd,
  defaultWhere,
}: {
  title: string;
  recs: Rec[];
  pickLabel: [string, string];
  more: { label: string; href: string }[];
  onPick?: (r: Rec) => void;
  onRemove?: (r: Rec) => void;
  onAdd?: (r: Rec) => void;
  defaultWhere: string;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: '', type: '', price: '', note: '' });
  const save = () => {
    if (!draft.name.trim() || !onAdd) return;
    const cost = Number(draft.price.replace(/[^\d.]/g, '')) || undefined;
    onAdd({ id: newId(), where: defaultWhere, picked: false, cost, ...draft, name: draft.name.trim() });
    setDraft({ name: '', type: '', price: '', note: '' });
    setAdding(false);
  };

  return (
    <>
      <h3>{title}</h3>
      {recs.length === 0 && <p className="muted small">暂无推荐，可用下方链接搜索后自己添加。</p>}
      <ul className="plain recs">
        {recs.map((r) => (
          <li key={r.id} className={r.picked ? 'picked' : ''}>
            <div className="row between">
              <b>{r.name}</b>
              <span className="muted small nowrap">{r.price}</span>
            </div>
            <div className="muted small">
              {r.type}
              {r.where && r.where !== defaultWhere ? ` · ${r.where}` : ''}
            </div>
            {r.note && <p className="small">{r.note}</p>}
            <div className="row wrap gap small">
              <a className="link" href={links.tripadvisor(`${r.name} ${r.where}`)} target="_blank" rel="noreferrer">Tripadvisor</a>
              <a className="link" href={links.googleMaps(`${r.name} ${r.where}`)} target="_blank" rel="noreferrer">地图</a>
              <span className="spacer" />
              {onPick && (
                <button className={r.picked ? 'mini on' : 'mini'} onClick={() => onPick(r)}>
                  {r.picked ? pickLabel[1] : pickLabel[0]}
                </button>
              )}
              {onRemove && (
                <button className="icon" aria-label="删除" onClick={() => onRemove(r)}>×</button>
              )}
            </div>
          </li>
        ))}
      </ul>
      <div className="row wrap gap small more">
        {more.map((m) => (
          <a key={m.label} className="link" href={m.href} target="_blank" rel="noreferrer">{m.label} ↗</a>
        ))}
        {onAdd && !adding && <button className="link" onClick={() => setAdding(true)}>+ 自己添加</button>}
      </div>
      {adding && (
        <div className="form add">
          <input placeholder="名称" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <div className="grid2">
            <input placeholder="类型（如 汽车旅馆 / 海鲜）" value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value })} />
            <input placeholder="价格（如 $220 或 $$）" value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} />
          </div>
          <input placeholder="备注" value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
          <div className="row">
            <button className="primary" onClick={save}>保存</button>
            <button onClick={() => setAdding(false)}>取消</button>
          </div>
        </div>
      )}
    </>
  );
}

/** 编辑模式下：为新地点查坐标、按真实路线计算里程 */
function PlaceTools({
  trip,
  day,
  update,
  set,
}: {
  trip: Trip;
  day: Day;
  update: Update;
  set: (mutate: (d: Day) => void) => void;
}) {
  const [busy, setBusy] = useState('');
  const names = [day.from, ...day.stops, day.to].map((n) => n.trim()).filter(Boolean);
  const unknown = [...new Set(names.filter((n) => !findPlace(trip, n)))];

  const locate = async (name: string) => {
    setBusy(name);
    const hit = await geocode(name);
    setBusy('');
    if (!hit) return alert(`没找到「${name}」，试试写成英文全称加州/国家名，如 "Lorne VIC" 或 "Queenstown, New Zealand"。`);
    update((t) => void t.places.push({ name, label: short(name), ...hit }));
  };
  const locateAll = async () => {
    setBusy('all');
    const failed: string[] = [];
    await geocodeAll(unknown, (name, hit) => {
      if (hit) update((t) => void t.places.push({ name, label: short(name), ...hit }));
      else failed.push(name);
    });
    setBusy('');
    if (failed.length) alert(`以下地点没找到：${failed.join('、')}。可改写名称后再试。`);
  };

  const calc = async () => {
    setBusy('route');
    const r = await fetchRoute(dayPlaces(trip, day));
    setBusy('');
    if (!r) return alert('无法获取路线（可能离线，或有地点缺少坐标）。');
    set((d) => {
      d.km = r.km;
      d.driveHours = r.hours;
    });
  };

  return (
    <div className="tools small">
      {unknown.length > 0 && (
        <p>
          <span className="muted">以下地点还没有坐标，地图上不会显示：</span>
          {unknown.length > 1 && (
            <button className="mini on" disabled={!!busy} onClick={locateAll}>
              {busy === 'all' ? '定位中…' : '全部定位'}
            </button>
          )}
          {unknown.map((n) => (
            <button key={n} className="mini" disabled={!!busy} onClick={() => locate(n)}>
              {busy === n ? '查找中…' : `定位「${short(n)}」`}
            </button>
          ))}
        </p>
      )}
      <button className="mini" disabled={!!busy} onClick={calc}>
        {busy === 'route' ? '计算中…' : '按地图路线自动计算里程和时间'}
      </button>
    </div>
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

function Settings({ trip, update, onImport }: { trip: Trip; update: Update; onImport: (t: Trip) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);

  const importFile = async (f: File) => {
    try {
      const t = migrateTrip(JSON.parse(await f.text()));
      if (!t) throw new Error('格式不对');
      // 导入为新行程，不覆盖现有数据
      onImport({ ...t, id: newId() });
      alert(`已导入「${t.name}」`);
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

      <AiSettingsCard trip={trip} update={update} />

      <section className="card">
        <h2>数据</h2>
        <p className="muted small">
          数据只保存在本设备浏览器中。要和家人共享，请「导出」后把文件发给对方，对方「导入」会作为一个新行程加入。
        </p>
        <div className="row wrap">
          <button className="primary" onClick={() => downloadJson(trip)}>导出 JSON</button>
          <button onClick={() => fileRef.current?.click()}>导入 JSON</button>
          <button onClick={() => window.print()}>打印 / 存为 PDF</button>
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

function AiSettingsCard({ trip, update }: { trip: Trip; update: Update }) {
  const [s, setS] = useState<AiSettings>(loadAiSettings);
  const [progress, setProgress] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<AiSettings>) => {
    const next = { ...s, ...patch };
    setS(next);
    saveAiSettings(next);
  };

  const runAll = async () => {
    if (!s.apiKey) return alert('请先填写 API Key');
    if (!confirm(`将为全部 ${trip.days.length} 天依次生成推荐，每天约 US$0.1–0.5（按实际用量计费）。继续？`)) return;
    setBusy(true);
    let cost = 0;
    const snapshot = trip;
    for (let i = 0; i < snapshot.days.length; i++) {
      const id = snapshot.days[i].id;
      try {
        const r = await generateDayRecs(s, snapshot, i, (m) => setProgress(`D${i + 1}：${m}`));
        cost += r.costUsd;
        update((t) => {
          applyResult(t, id, r.result);
        });
      } catch (e) {
        setProgress(`D${i + 1} 失败：${e instanceof Error ? e.message : e}`);
        setBusy(false);
        return;
      }
    }
    setProgress(`全部完成，共约 US$${cost.toFixed(2)}。到「行程」或「地图」页查看。`);
    setBusy(false);
  };

  return (
    <section className="card form">
      <h2>✨ AI 推荐</h2>
      <p className="muted small">
        用 Claude 联网搜索，为每天生成景点（含坐标、中文介绍）、住宿和餐饮推荐，只推荐查得到仍在营业的商家。需要你自己的{' '}
        <a className="link" href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">
          Anthropic API Key
        </a>
        ，按用量计费。
      </p>
      <Field label="Anthropic API Key">
        <input
          type="password"
          autoComplete="off"
          placeholder="sk-ant-…"
          value={s.apiKey}
          onChange={(e) => set({ apiKey: e.target.value })}
        />
      </Field>
      <p className="muted small">
        ⚠️ Key 只保存在这台设备的浏览器里，不会随「导出」发给别人。请勿在公用电脑上填写；建议在 Anthropic 控制台为它设置消费上限。
      </p>
      <Field label="模型">
        <select value={s.model} onChange={(e) => set({ model: e.target.value })}>
          {AI_MODELS.map((m) => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>
      </Field>
      <Field label="家庭偏好（可选）">
        <textarea
          rows={2}
          placeholder="如：孩子 6 岁和 9 岁；喜欢动物和海滩；想吃中餐/海鲜；住宿要有厨房；预算中等"
          value={s.preferences}
          onChange={(e) => set({ preferences: e.target.value })}
        />
      </Field>
      <div className="row wrap">
        <button className="primary" disabled={busy || !s.apiKey} onClick={runAll}>
          {busy ? '生成中…' : `为全部 ${trip.days.length} 天生成`}
        </button>
        {s.apiKey && <button onClick={() => set({ apiKey: '' })}>清除 Key</button>}
      </div>
      {progress && <p className="muted small">{progress}</p>}
      <p className="muted small">也可以在每天的「景点 · 住宿 · 餐饮」里单独点「✨ AI 生成推荐」。</p>
    </section>
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
