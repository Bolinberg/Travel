import { useEffect, useRef, useState } from 'react';
import type { Day, Place, Trip } from './types';
import { addDays, formatDate, fuelCost, money, summarize } from './calc';
import { createBlankTrip, createDefaultTrip, duplicateTrip, TEMPLATES } from './defaultTrip';
import { downloadJson, loadStore, migrateTrip, saveStore, type Store } from './storage';
import { newId } from './id';
import { AI_MODELS, applyResult, generateDayRecs, loadAiSettings, saveAiSettings, type AiSettings, aiParseChecklist } from './ai';
import TripMap, { dayColor, dayPlaces } from './TripMap';
import Replan from './Replan';
import { AskBar, PlansPage } from './Planner';
import { COMPARE_NAME, createRouteComparisonTrip, upgradeComparison } from './templateKI';
import { applyVerifiedStays, applyVerifiedStaysToDay } from './stays';
import Bookings, { isBookable, pickStay, stayGroups, stayLabel, stayLink } from './Bookings';
import { childAges, daysUntil, Field, hoursClass, leg, NumInput, short, shortTitle } from './ui';
import { autoRouteDay, routeKey } from './autoRoute';
import StayPicker, { DiningPicker, PlatformChips } from './StayPicker';
import { MORE_TICKET_PLATFORMS, ticketSearchLinks } from './search';
import { findDuplicate, isDuplicate, parseChecklistText, type ParsedItem } from './checklistParse';
import Versions from './Versions';
import { useSync } from './useSync';
import { JoinPrompt, SyncBadge, SyncCard } from './SyncUI';
import { parseInvite } from './sync';
import { addVersion, currentPlanId, planOptions, restoreVersion, saveAsPlan, snapshot, switchPlan } from './versions';
import { findPlace, geocode, geocodeAll, links, missingPlaces, useWiki } from './geo';
import { dayMode, dayPointNames, googleDirections, isDriveDay, MODE_KEYS, MODES, modeSummary, orderStops, routeDay } from './route';
import type { Mode } from './types';

type Tab = 'itinerary' | 'plans' | 'bookings' | 'prep' | 'settings';
type Update = (mutate: (draft: Trip) => void) => void;

/** 线性图标（24×24，描边随文字颜色） */
const ICONS: Record<string, React.ReactNode> = {
  itinerary: <path d="M6 3v18M6 7h9a3 3 0 0 1 0 6H9a3 3 0 0 0 0 6h9" />,
  plans: <path d="M4 5h7v14H4zM13 5h7v14h-7zM6.5 9h2M15.5 9h2M6.5 13h2M15.5 13h2" />,
  bookings: <path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4V8Zm6-2v12" />,
  prep: <path d="M4 8h16v11H4zM9 8V5h6v3M4 13h16" />,
  settings: (
    <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7.5 7.5 0 0 0-2-1.2L14.5 3h-5l-.4 2.6a7.5 7.5 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7.5 7.5 0 0 0 2 1.2l.4 2.6h5l.4-2.6a7.5 7.5 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2Z" />
  ),
};
export function Icon({ name }: { name: string }) {
  return (
    <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name]}
    </svg>
  );
}

const TABS: { key: Tab; label: string }[] = [
  { key: 'itinerary', label: '行程' },
  { key: 'plans', label: '方案' },
  { key: 'bookings', label: '预订' },
  { key: 'prep', label: '准备' },
];

/** 宽屏（≥ 980px）时行程旁边常驻地图 */
function useWide() {
  const q = '(min-width: 980px)';
  const [wide, setWide] = useState(() => typeof matchMedia !== 'undefined' && matchMedia(q).matches);
  useEffect(() => {
    const m = matchMedia(q);
    const on = () => setWide(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return wide;
}

function initialStore(): Store {
  const s = loadStore();
  if (s) return { ...s, trips: s.trips.map((t) => applyVerifiedStays(upgradeComparison(t))) };
  // 第一次打开：直接用家里确定的 7 天往返方案
  const t = createRouteComparisonTrip();
  return { activeId: t.id, trips: [t] };
}

/* 已经用过旧版本的设备：提示一次新的 6 天方案 */
// 家里最终选定的方案：9 天（袋鼠岛 2 晚、回程走格兰扁）
const KI_OFFER_KEY = 'travel-planner.offer.compare-ab2';
const hasKiTrip = (s: Store) => s.trips.find((t) => t.id === s.activeId)?.name === COMPARE_NAME;
function offerDismissed(): boolean {
  try {
    return localStorage.getItem(KI_OFFER_KEY) === 'dismissed';
  } catch {
    return false;
  }
}
function dismissOffer() {
  try {
    localStorage.setItem(KI_OFFER_KEY, 'dismissed');
  } catch {
    /* 忽略 */
  }
}

export default function App() {
  const [store, setStore] = useState<Store>(initialStore);
  const trip = store.trips.find((t) => t.id === store.activeId) ?? store.trips[0];
  const [tab, setTab] = useState<Tab>('itinerary');
  const wide = useWide();
  const [showTrips, setShowTrips] = useState(false);
  const [kiOffer, setKiOffer] = useState(() => !offerDismissed());
  const sync = useSync(store, setStore);
  // 打开邀请链接（#join=…）时提示加入
  const [invite, setInvite] = useState(() => (typeof location !== 'undefined' ? parseInvite(location.hash) : null));
  const closeInvite = () => {
    setInvite(null);
    history.replaceState(null, '', location.pathname + location.search);
  };
  /** 正在看的那一天（手机：底部面板；宽屏：时间线里展开，旁边地图聚焦） */
  const [openDay, setOpenDayRaw] = useState<number | null>(null);
  const [dayTab, setDayTab] = useState<DayTab>('plan');
  const setOpenDay = (i: number | null, tab: DayTab = 'plan') => {
    setDayTab(tab);
    setOpenDayRaw(i);
  };
  const onFlow = (step: FlowStep) => {
    if (step === 'cost') return goTo('bookings');
    if (step === 'route') {
      const i = trip.days.findIndex((d) => !d.from.trim() || !d.to.trim());
      return setOpenDay(i >= 0 ? i : 0, 'plan');
    }
    if (step === 'stays') {
      const g = stayGroups(trip).find((x) => stayLabel(trip.days[x.days[0]]) === '还没选住宿') ?? stayGroups(trip)[0];
      return g ? setOpenDay(g.days[0], 'stays') : undefined;
    }
    const i = trip.days.findIndex((d) => !d.dining.some((r) => r.picked));
    setOpenDay(i >= 0 ? i : 0, 'dining');
  };
  const [mapOpen, setMapOpen] = useState(false);
  const [mapFocus, setMapFocus] = useState<number | null>(null);
  const [askOpen, setAskOpen] = useState(false);
  const [toast, setToast] = useState('');
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  const goTo = (t: Tab) => {
    setTab(t);
    setOpenDay(null);
    setMapOpen(false);
    setAskOpen(false);
    window.scrollTo(0, 0);
  };
  const openMap = (i: number | null) => {
    setMapFocus(i);
    setMapOpen(true);
  };

  useEffect(() => {
    saveStore(store);
  }, [store]);

  // 有的日子还没有里程车程（比如刚应用了粘贴的行程）：自动查位置、按真实道路算（每组地址只试一次）
  const routedOnce = useRef(new Set<string>());
  useEffect(() => {
    const todo = trip.days.filter(
      (d) => !d.manualRoute && !d.km && d.from.trim() && d.to.trim() && d.from !== d.to && !routedOnce.current.has(d.id + routeKey(d)),
    );
    if (!todo.length) return;
    todo.forEach((d) => routedOnce.current.add(d.id + routeKey(d)));
    (async () => {
      for (const d of todo) await autoRouteDay(trip, d, update);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip]);

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
    goTo('itinerary');
  };
  // 大的调整后可撤销（只保留最近一次）
  const [undo, setUndo] = useState<{ trip: Trip; label: string } | null>(null);
  const replaceTrip = (next: Trip) =>
    setStore((s) => ({ ...s, trips: s.trips.map((t) => (t.id === next.id ? next : t)) }));
  const applyReplan = (next: Trip, label: string) => {
    setUndo({ trip, label });
    // 大改动前自动保存旧版本
    const withHistory = structuredClone(next);
    withHistory.versions = structuredClone(trip.versions ?? []);
    addVersion(withHistory, `调整天数前（${trip.days.length} 天）`, 'auto', snapshot(trip));
    replaceTrip(withHistory);
    goTo('itinerary');
  };
  const applyEdit = (next: Trip, instruction: string) => {
    setUndo({ trip, label: `「${instruction.slice(0, 24)}」` });
    const withHistory = structuredClone(next);
    withHistory.versions = structuredClone(trip.versions ?? []);
    withHistory.activePlan = trip.activePlan;
    addVersion(withHistory, `AI 调整前：${instruction.slice(0, 30)}`, 'auto', snapshot(trip));
    replaceTrip(withHistory);
    goTo('itinerary');
  };
  const savePlan = (plan: Trip, title: string) => {
    replaceTrip(saveAsPlan(trip, plan, title));
    setToast(`已另存为新方案「${title}」，可以和其他方案逐日对比`);
    goTo('plans');
  };
  const usePlan = (id: string) => {
    setUndo(null);
    setOpenDay(null);
    replaceTrip(switchPlan(trip, id));
  };
  const undoReplan = () => {
    if (!undo) return;
    replaceTrip(undo.trip);
    setUndo(null);
  };

  const switchTrip = (id: string) => {
    setUndo(null);
    setStore((s) => ({ ...s, activeId: id }));
    setShowTrips(false);
    goTo('itinerary');
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

  const sideMap = wide && tab === 'itinerary';
  const sum = summarize(trip);
  const plan = planName(trip);
  const [planTag, ...planRest] = (plan ?? '').split('：');
  const end = addDays(trip.startDate, Math.max(trip.days.length - 1, 0));

  return (
    <div className={`app tab-${tab}${sideMap ? ' with-side' : ''}`}>
      <header className="masthead">
        <div className="mh-main">
          <button className="trip-switch" onClick={() => setShowTrips(!showTrips)} aria-expanded={showTrips}>
            <span className="trip-switch-name">{trip.name}</span>
            <svg className="caret" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <button className="plan-line" onClick={() => goTo('plans')} title="选方案">
            {plan && (
              <>
                <span className="pcard-tag">{planRest.length ? planTag : '方案'}</span>{' '}
                <span className="plan-line-name">{planRest.length ? planRest.join('：') : plan}</span>
                <span className="sep">·</span>
              </>
            )}
            <span className="nowrap">{dateRange(trip.startDate, end)}</span>
            <span className="sep">·</span>
            <span className="nowrap">
              {sum.days} 天 {sum.nights} 晚
            </span>
          </button>
        </div>
        <div className="masthead-actions">
          <SyncBadge state={sync.state} onClick={() => goTo('settings')} />
          <button className={`icon-btn${tab === 'settings' ? ' on' : ''}`} aria-label="设置" title="设置" onClick={() => goTo('settings')}>
            <Icon name="settings" />
          </button>
        </div>
      </header>
      {kiOffer && !hasKiTrip(store) && (
        <section className="offer" aria-label="新方案">
          <div>
            <b>A/B 路线对比已更新</b>
            <p>从 Point Cook 出发。A：第 1 天直达蓝湖，袋鼠岛住 1 晚后回阿德莱德，经 Dimboola、格兰扁回家（7 天）；B：住 Port Campbell、Robe，袋鼠岛 2 晚，回程走格兰扁（9 天）；C：去程住 Apollo Bay 和蓝湖，之后同 B（9 天）。</p>
          </div>
          <div className="row wrap">
            <button
              className="primary"
              onClick={() => {
                const existing = store.trips.find((x) => x.name === COMPARE_NAME);
                if (existing) {
                  switchTrip(existing.id);
                } else {
                  const t = createRouteComparisonTrip();
                  t.startDate = trip.startDate; // 沿用你已经定好的出发日期
                  for (const v of t.versions ?? []) v.snapshot.startDate = trip.startDate;
                  addTrip(t);
                }
                goTo('plans');
              }}
            >
              打开路线对比
            </button>
            <button
              onClick={() => {
                dismissOffer();
                setKiOffer(false);
              }}
            >
              暂不
            </button>
          </div>
        </section>
      )}
      {invite && sync.cfg?.key !== invite.key && (
        <JoinPrompt invite={invite} store={store} setCfg={sync.setCfg} onDone={closeInvite} />
      )}
      {showTrips && <TripsPanel store={store} current={trip} onSwitch={switchTrip} onAdd={addTrip} onDelete={deleteTrip} />}
      <nav className="dock" aria-label="主要页面">
        {TABS.map((t) => (
          <button key={t.key} aria-current={tab === t.key ? 'page' : undefined} className={tab === t.key ? 'on' : ''} onClick={() => goTo(t.key)}>
            <Icon name={t.key} />
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
      <div className="layout">
        <main>
          {undo && undo.trip.id === trip.id && (tab === 'itinerary' || tab === 'plans') && (
            <section className="notice">
              <span>已调整行程：{undo.label}</span>
              <button className="mini" onClick={undoReplan}>撤销</button>
              <button className="icon" aria-label="关闭" onClick={() => setUndo(null)}>×</button>
            </section>
          )}
          {tab === 'itinerary' && (
            <>
              <PlanFlow trip={trip} onStep={onFlow} />
              <NextSteps trip={trip} goTo={goTo} />
              <MissingBanner trip={trip} update={update} />
              {!wide && (
                <section className="route-card" aria-label="路线地图">
                  <TripMap trip={trip} focus={openDay} height={170} />
                  <button className="route-expand" onClick={() => openMap(openDay)}>
                    展开地图
                  </button>
                </section>
              )}
              <Timeline
                trip={trip}
                update={update}
                open={openDay}
                onOpen={(i) => setOpenDay(i)}
                inline={
                  wide
                    ? (i) => (
                        <div className="tl-inline">
                          <DayDetail key={trip.days[i].id + dayTab} trip={trip} index={i} update={update} onMap={() => openMap(i)} goTo={goTo} initialTab={dayTab} />
                        </div>
                      )
                    : undefined
                }
              />
            </>
          )}
          {tab === 'plans' && (
            <PlansPage
              trip={trip}
              onUse={usePlan}
              onApplyEdit={applyEdit}
              onSavePlan={savePlan}
              replan={
                <Replan
                  key={trip.id + trip.days.length}
                  trip={trip}
                  onApply={applyReplan}
                  onSave={(t, label) => savePlan(t, label)}
                />
              }
              history={
                <Versions
                  trip={trip}
                  history
                  onSave={(label) => update((d) => void addVersion(d, label, 'manual'))}
                  onRestore={(id) => {
                    setUndo(null);
                    replaceTrip(restoreVersion(trip, id));
                    goTo('itinerary');
                  }}
                  onRename={(id, label) =>
                    update((d) => {
                      const v = d.versions?.find((x) => x.id === id);
                      if (v) v.label = label;
                    })
                  }
                  onDelete={(id) => update((d) => void (d.versions = d.versions?.filter((x) => x.id !== id)))}
                />
              }
            />
          )}
          {tab === 'bookings' && <Bookings trip={trip} update={update} />}
          {tab === 'prep' && (
            <>
              <section className="countdown">
                <b>{countdown(trip)}</b>
                <span className="muted small">
                  {formatDate(trip.startDate)} 从 {short(trip.days[0]?.from ?? '')} 出发 · 清单完成 {trip.checklist.filter((c) => c.done).length}/{trip.checklist.length}
                </span>
              </section>
              <Checklist trip={trip} update={update} />
            </>
          )}
          {tab === 'settings' && (
            <Settings trip={trip} update={update} onImport={addTrip}>
              <SyncCard cfg={sync.cfg} state={sync.state} setCfg={sync.setCfg} run={sync.run} store={store} />
            </Settings>
          )}
        </main>
        {sideMap && (
          <aside className="side-map" aria-label="路线地图">
            <div className="side-map-head">
              <span>{openDay === null ? '全程路线' : `第 ${openDay + 1} 天  ${leg(trip.days[openDay] ?? trip.days[0])}`}</span>
              {openDay !== null && (
                <button className="link" onClick={() => setOpenDay(null)}>看全程</button>
              )}
            </div>
            <TripMap trip={trip} focus={openDay} height={0} />
          </aside>
        )}
      </div>

      {tab === 'itinerary' && !askOpen && (
        <button className="fab" onClick={() => setAskOpen(true)}>
          ✎ 改行程
        </button>
      )}
      {askOpen && (
        <div className="sheet ask-sheet" role="dialog" aria-modal="true" aria-label="改行程" onClick={(e) => e.target === e.currentTarget && setAskOpen(false)}>
          <div className="sheet-inner">
            <div className="row between">
              <h2>改行程</h2>
              <button className="icon" aria-label="关闭" onClick={() => setAskOpen(false)}>×</button>
            </div>
            <p className="muted small">用一句话说想怎么改。会先给你看改前改后的对比，确认后才生效；也可以另存为新方案。</p>
            <AskBar trip={trip} intent="edit" focusKey={1} onApply={applyEdit} onSaveAsPlan={savePlan} />
          </div>
        </div>
      )}
      {!wide && tab === 'itinerary' && openDay !== null && (
        <DaySheet trip={trip} index={openDay} update={update} setIndex={(i) => setOpenDay(i, dayTab)} onMap={() => openMap(openDay)} goTo={goTo} initialTab={dayTab} />
      )}
      {mapOpen && (
        <MapOverlay
          trip={trip}
          focus={mapFocus}
          setFocus={setMapFocus}
          update={update}
          onOpenDay={(i) => {
            setMapOpen(false);
            setOpenDay(i);
          }}
          onClose={() => setMapOpen(false)}
        />
      )}
    </div>
  );
}

/* ---------------- 行程：下一步 ---------------- */

/** 「12月19日 至 27日」，跨月时写全 */
function dateRange(start: string, end: string): string {
  const [, m1, d1] = start.split('-').map(Number);
  const [, m2, d2] = end.split('-').map(Number);
  if (start === end) return `${m1}月${d1}日`;
  return m1 === m2 ? `${m1}月${d1}日–${d2}日` : `${m1}月${d1}日–${m2}月${d2}日`;
}

/** 当前方案的短名（「B」或行程名） */
function planName(trip: Trip): string | null {
  const id = currentPlanId(trip);
  const v = id ? trip.versions?.find((x) => x.id === id) : undefined;
  return v && planOptions(trip).length > 1 ? v.label : null;
}

function countdown(trip: Trip): string {
  const n = daysUntil(trip.startDate);
  if (n > 1) return `还有 ${n} 天出发`;
  if (n === 1) return '明天出发';
  if (n === 0) return '今天出发';
  if (-n < trip.days.length) return `旅途第 ${-n + 1} 天`;
  return '旅行已结束';
}

type FlowStep = 'route' | 'stays' | 'dining' | 'cost';

/** 规划流程：① 每天去哪 → ② 住哪 → ③ 吃什么 → ④ 花多少 */
function PlanFlow({ trip, onStep }: { trip: Trip; onStep: (s: FlowStep) => void }) {
  const groups = stayGroups(trip);
  const routed = trip.days.filter((d) => d.from.trim() && d.to.trim()).length;
  const chosen = groups.filter((g) => stayLabel(trip.days[g.days[0]]) !== '还没选住宿').length;
  const meals = trip.days.reduce((n, d) => n + d.dining.filter((r) => r.picked).length, 0);
  const total = summarize(trip).total;
  const steps: { k: FlowStep; label: string; value: string; done: boolean }[] = [
    { k: 'route', label: '每天去哪', value: `${routed}/${trip.days.length} 天已定`, done: routed === trip.days.length },
    { k: 'stays', label: '住哪', value: groups.length ? `已选 ${chosen}/${groups.length} 处` : '不住宿', done: chosen === groups.length },
    { k: 'dining', label: '吃什么', value: meals ? `已选 ${meals} 家` : '还没选', done: meals > 0 },
    { k: 'cost', label: '花多少', value: money(total), done: false },
  ];
  return (
    <nav className="flow" aria-label="规划步骤">
      {steps.map((st, i) => (
        <button key={st.k} className={`flow-step${st.done ? ' done' : ''}`} onClick={() => onStep(st.k)}>
          <span className="flow-n" aria-hidden="true">{st.done ? '✓' : i + 1}</span>
          <span className="flow-text">
            <b>{st.label}</b>
            <span>{st.value}</span>
          </span>
        </button>
      ))}
    </nav>
  );
}

/** 行程页顶部：倒计时 + 最要紧的 3 件事 */
function NextSteps({ trip, goTo }: { trip: Trip; goTo: (t: Tab) => void }) {
  const items: { text: React.ReactNode; action: string; tab: Tab; urgent?: boolean }[] = [];
  const unbookedGroups = stayGroups(trip).filter((g) => g.days.some((i) => !trip.days[i].accommodation?.booked));
  const unbookedNights = unbookedGroups.reduce((n, g) => n + g.days.filter((i) => !trip.days[i].accommodation?.booked).length, 0);
  const tickets = trip.expenses.filter((e) => isBookable(e) && !e.booked && !e.paid && e.dayId);
  // 渡轮最容易订满，排在最前面
  tickets.sort((a, b) => Number(/渡轮|ferry|sealink/i.test(b.title)) - Number(/渡轮|ferry|sealink/i.test(a.title)));
  if (tickets[0]) items.push({ text: shortTitle(tickets[0].title), action: '去订', tab: 'bookings', urgent: /渡轮|ferry|sealink/i.test(tickets[0].title) });
  if (unbookedNights > 0) {
    const places = [...new Set(unbookedGroups.map((g) => short(g.place)))];
    items.push({
      text: (
        <>
          还有 <b>{unbookedNights}</b> 晚住宿未订<span className="muted">（{places.slice(0, 3).join('、')}{places.length > 3 ? ' 等' : ''}）</span>
        </>
      ),
      action: '去订',
      tab: 'bookings',
    });
  }
  if (tickets.length > 1) items.push({ text: <>还有 {tickets.length - 1} 项门票 / 交通没订</>, action: '查看', tab: 'bookings' });
  const before = trip.checklist.filter((c) => !c.done);
  if (items.length < 3 && before.length) items.push({ text: <>准备清单还剩 {before.length} 项</>, action: '查看', tab: 'prep' });

  return (
    <section className="next" aria-label="下一步">
      <div className="next-head">
        <span>下一步</span>
        <span className="next-count">{countdown(trip)}</span>
      </div>
      {items.length ? (
        <ul className="plain">
          {items.slice(0, 3).map((it, i) => (
            <li key={i} className={it.urgent ? 'urgent' : ''}>
              <span>{it.text}</span>
              <button className="link strong" onClick={() => goTo(it.tab)}>
                {it.action} →
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="small">住宿、门票都订好了，准备清单也完成了。</p>
      )}
    </section>
  );
}

/** 找门票 / 活动时用更大的区域名（Vivonne Bay → Kangaroo Island，Halls Gap → Grampians） */
const ticketArea = (place: string) => {
  const t = short(place);
  if (/vivonne bay|kingscote|penneshaw|american river/i.test(t)) return 'Kangaroo Island';
  if (/halls gap/i.test(t)) return 'Grampians';
  if (/port campbell|apollo bay|lorne/i.test(t)) return `${t} Great Ocean Road`;
  return t;
};

/* ---------------- 行程：时间线 ---------------- */

function dayChip(d: Day): { cls: string; text: string } {
  if (dayMode(d) === 'walk') return { cls: 'h0', text: '步行' };
  if (!d.driveHours) return { cls: 'h0', text: d.from === d.to ? '休息' : '—' };
  return { cls: hoursClass(d.driveHours), text: `${d.driveHours} 小时` };
}
const hasFerry = (d: Day) => d.mode === 'ferry' || Object.values(d.legModes ?? {}).includes('ferry');

function stayState(acc: Day['accommodation']) {
  if (!acc) return null;
  return acc.paid ? { cls: 'ok', text: '已付' } : acc.booked ? { cls: 'ok', text: '已订' } : { cls: 'no', text: '未订' };
}

function Timeline({
  trip,
  update,
  open,
  onOpen,
  inline,
}: {
  trip: Trip;
  update: Update;
  open: number | null;
  onOpen: (i: number | null) => void;
  /** 宽屏时在这一天下面直接展开详情 */
  inline?: (i: number) => React.ReactNode;
}) {
  const addDay = () => {
    const last = trip.days[trip.days.length - 1];
    const d: Day = {
      id: newId(),
      title: '新的一天',
      from: last?.to ?? '',
      to: '',
      km: 0,
      driveHours: 0,
      stops: [],
      accommodation: null,
      stayOptions: [],
      dining: [],
      notes: '',
    };
    update((t) => void t.days.push(d));
    onOpen(trip.days.length);
  };

  return (
    <section className="tl" aria-label="逐日行程">
      <ol className="plain tl-list">
        {trip.days.map((d, i) => {
          const chip = dayChip(d);
          const st = stayState(d.accommodation);
          const last = i === trip.days.length - 1;
          return (
            <li key={d.id} className={open === i ? 'tl-item open' : 'tl-item'} style={{ ['--c' as string]: dayColor(i) }}>
              <button className="tl-row" onClick={() => onOpen(open === i ? null : i)} aria-expanded={open === i}>
                <span className="tl-n">{i + 1}</span>
                <span className="tl-main">
                  <span className="tl-title">{d.title}</span>
                  <span className="tl-sub">
                    {formatDate(addDays(trip.startDate, i))} · {leg(d)}
                  </span>
                  <span className="tl-stay">
                    {d.accommodation
                      ? d.stayOptions.some((r) => r.picked) || stayLabel(d) !== '还没选住宿'
                        ? `住 ${stayLabel(d)}`
                        : `住 ${short(d.to)} · 还没选住宿`
                      : last
                        ? '到家'
                        : '当晚不住宿'}
                  </span>
                </span>
                <span className="tl-side">
                  <span className={`hchip ${chip.cls}`}>
                    {hasFerry(d) ? '⛴ ' : ''}
                    {chip.text}
                  </span>
                  {st && <span className={`tl-st ${st.cls}`}>{st.text}</span>}
                </span>
              </button>
              {open === i && inline?.(i)}
            </li>
          );
        })}
      </ol>
      <button className="add-line" onClick={addDay}>+ 添加一天</button>
    </section>
  );
}

/* ---------------- 行程：某一天 ---------------- */

type DayTab = 'plan' | 'sights' | 'stays' | 'dining';

function DayDetail({
  trip,
  index,
  update,
  onMap,
  onClose,
  goTo,
  initialTab = 'plan',
}: {
  trip: Trip;
  index: number;
  update: Update;
  onMap: () => void;
  onClose?: () => void;
  goTo: (t: Tab) => void;
  initialTab?: DayTab;
}) {
  const day = trip.days[index];
  const [tab, setTab] = useState<DayTab>(initialTab === 'stays' && !day.accommodation ? 'plan' : initialTab);
  const [editing, setEditing] = useState(day.title === '新的一天');
  const set = (mutate: (d: Day) => void) =>
    update((t) => {
      const d = t.days.find((x) => x.id === day.id);
      if (d) mutate(d);
    });
  const fuel = isDriveDay(day) ? fuelCost(day.km, trip.vehicle.litresPer100km, trip.vehicle.fuelPrice) : 0;
  const sights = dayPlaces(trip, day).filter((p) => p.desc && p.name !== day.from);
  const acc = day.accommodation;
  const last = index === trip.days.length - 1;
  const tabs: [DayTab, string][] = [
    ['plan', '安排'],
    ['sights', `景点 ${sights.length}`],
    ...(acc ? ([['stays', `住宿 ${day.stayOptions.length}`]] as [DayTab, string][]) : []),
    ['dining', `吃饭 ${day.dining.length}`],
  ];

  return (
    <div className="dd">
      <div className="dd-head">
        <div className="dd-head-main">
          <div className="muted small">
            第 {index + 1} 天 · {formatDate(addDays(trip.startDate, index))}
          </div>
          <h2 className="dd-title">{day.title}</h2>
          <div className="dd-route">{leg(day)}</div>
        </div>
        <div className="dd-head-actions">
          <button className="mini" onClick={() => setEditing(!editing)}>{editing ? '完成' : '编辑'}</button>
          {onClose && (
            <button className="icon" aria-label="关闭" onClick={onClose}>×</button>
          )}
        </div>
      </div>

      {editing ? (
        <DayEditor trip={trip} index={index} update={update} set={set} onDeleted={onClose} />
      ) : (
        <>
          <dl className="dd-kv">
            <div>
              <dt>里程</dt>
              <dd>{day.km} km</dd>
            </div>
            <div>
              <dt>路上</dt>
              <dd className={day.driveHours > 6 ? 'warn-text' : ''}>{day.driveHours} 小时</dd>
            </div>
            <div>
              <dt>油费</dt>
              <dd>{fuel ? money(fuel) : '—'}</dd>
            </div>
            <div>
              <dt>交通</dt>
              <dd className="dd-mode">{modeSummary(day)}</dd>
            </div>
          </dl>
          <div className="dd-tabs" role="tablist" aria-label="这一天">
            {tabs.map(([k, label]) => (
              <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
                {label}
              </button>
            ))}
          </div>

          {tab === 'plan' && (
            <div className="dd-plan">
              {day.stops.length > 0 && (
                <ol className="plain dd-stops">
                  {day.stops.map((s, i) => (
                    <li key={s + i}>
                      <span className="dd-dot" aria-hidden="true" />
                      {short(s)}
                    </li>
                  ))}
                  <li className="dd-end">
                    <span className="dd-dot end" aria-hidden="true" />
                    {short(day.to)}
                  </li>
                </ol>
              )}
              {day.notes && <p className="dd-notes">{day.notes}</p>}
              {acc ? (
                <TonightStay trip={trip} index={index} update={update} onChoose={() => setTab('stays')} goTo={goTo} />
              ) : (
                <div className="dd-stay home">今晚 · {last ? '到家' : '不住宿'}</div>
              )}
              <div className="row wrap gap small">
                <button className="link" onClick={onMap}>在地图上看</button>
                <a className="link" href={googleDirections(day)} target="_blank" rel="noreferrer">Google 地图导航 ↗</a>
              </div>
            </div>
          )}
          {tab === 'sights' && (
            <>
              <div className="sp-step">
                <div className="find-head">门票 / 活动：去平台找</div>
                <PlatformChips links={ticketSearchLinks(ticketArea(day.to), day.to)} kind="ticket" infos={MORE_TICKET_PLATFORMS} />
              </div>
              <DayGuide trip={trip} day={day} index={index} update={update} only="sights" />
            </>
          )}
          {tab === 'stays' && <DayGuide trip={trip} day={day} index={index} update={update} only="stays" />}
          {tab === 'dining' && <DayGuide trip={trip} day={day} index={index} update={update} only="dining" />}
        </>
      )}
    </div>
  );
}

/** 某一天的「今晚住」：当前选择 + 去订 / 换一家 / 标记已订 */
function TonightStay({
  trip,
  index,
  update,
  onChoose,
  goTo,
}: {
  trip: Trip;
  index: number;
  update: Update;
  onChoose: () => void;
  goTo: (t: Tab) => void;
}) {
  const day = trip.days[index];
  const acc = day.accommodation!;
  const picked = day.stayOptions.find((r) => r.picked);
  const top = day.stayOptions.find((r) => r.top);
  const link = stayLink(trip, index);
  const st = stayState(acc)!;
  // 连住的几晚一起改状态
  const group = stayGroups(trip).find((g) => g.days.includes(index))?.days ?? [index];
  const setBooked = (booked: boolean) =>
    update((t) => {
      for (const i of group) {
        const a = t.days[i].accommodation;
        if (!a) continue;
        a.booked = booked;
        if (!booked) a.paid = false;
      }
    });
  return (
    <div className={`dd-stay${acc.booked ? ' booked' : ''}`}>
      <div className="row between">
        <span className="muted small">今晚住{group.length > 1 ? `（连住 ${group.length} 晚）` : ''}</span>
        <span className={`tl-st ${st.cls}`}>{st.text}</span>
      </div>
      <b className="dd-stay-name">{stayLabel(day)}</b>
      <div className="muted small">
        {money(acc.cost)}/晚
        {picked?.rating ? ` · ★ ${picked.rating}` : ''}
      </div>
      {!picked && top && (
        <p className="small dd-suggest">
          推荐：<b>{top.name}</b>
          {top.rating ? ` · ★ ${top.rating}` : ''}
          {top.note ? `。${top.note}` : ''}
        </p>
      )}
      <div className="row wrap gap">
        {!picked && top ? (
          <button className="mini on" onClick={() => update((t) => pickStay(t, group, top))}>选推荐这家</button>
        ) : (
          link && (
            <a className="mini on btn-link" href={link} target="_blank" rel="noreferrer">去订 ↗</a>
          )
        )}
        {day.stayOptions.length > 0 && (
          <button className="mini" onClick={onChoose}>{picked ? '换一家' : `看候选（${day.stayOptions.length}）`}</button>
        )}
        <button className="mini" onClick={() => setBooked(!acc.booked)}>{acc.booked ? '改为未订' : '标记已订'}</button>
        <button className="link small" onClick={() => goTo('bookings')}>全部预订 →</button>
      </div>
    </div>
  );
}

/** 地址输入：打字时不改行程，离开输入框或按回车才提交（避免每个字都去查位置） */
function AddressInput({
  value,
  onCommit,
  placeholder,
  label,
  listId,
  autoFocus,
}: {
  value: string;
  onCommit: (v: string) => void;
  placeholder: string;
  label: string;
  listId: string;
  autoFocus?: boolean;
}) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  // 按回车提交后紧接着会失焦，别再提交一次
  const done = useRef(false);
  const commit = () => {
    if (done.current) return;
    if (text.trim() !== value.trim()) {
      done.current = true;
      onCommit(text.trim());
      setTimeout(() => (done.current = false), 0);
    }
  };
  return (
    <input
      aria-label={label}
      value={text}
      list={listId}
      autoFocus={autoFocus}
      placeholder={placeholder}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
          e.preventDefault();
          commit();
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}

/** 自动生成的标题：「A → B」或「A 周边」 */
const autoTitle = (d: Pick<Day, 'from' | 'to'>) => (d.from.trim() && d.to.trim() ? leg(d as Day) : '新的一天');

/**
 * 编辑某一天：只填地址（目的地、途经点），其余自动算——
 * 出发地沿用前一天的目的地，坐标、里程、车程、油费、标题都自动生成；手动改放在「高级」里。
 */
function DayEditor({
  trip,
  index,
  update,
  set,
  onDeleted,
}: {
  trip: Trip;
  index: number;
  update: Update;
  set: (mutate: (d: Day) => void) => void;
  onDeleted?: () => void;
}) {
  const day = trip.days[index];
  const acc = day.accommodation;
  const prev = trip.days[index - 1];
  const next = trip.days[index + 1];
  const last = index === trip.days.length - 1;
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [editFrom, setEditFrom] = useState(false);
  const listId = `places-${day.id}`;
  const fuel = isDriveDay(day) ? fuelCost(day.km, trip.vehicle.litresPer100km, trip.vehicle.fuelPrice) : 0;

  // 地址改了就自动重算（打开时已经算好的不重算，避免覆盖原来按实际情况调过的车程）
  const key = routeKey(day);
  const openedKey = useRef(day.routeKey ?? key);
  const isNew = day.km === 0 && day.from.trim() !== '' && day.to.trim() !== '' && day.from.trim() !== day.to.trim();
  useEffect(() => {
    if (day.manualRoute || !day.from.trim() || !day.to.trim()) return;
    if (key === day.routeKey || (key === openedKey.current && !isNew)) return;
    let alive = true;
    const timer = setTimeout(async () => {
      setBusy(true);
      const r = await autoRouteDay(trip, day, update, (s) => alive && setStatus(s));
      if (!alive) return;
      setBusy(false);
      if (!r) return setStatus('');
      const parts = [];
      if (r.missing.length) parts.push(`没找到「${r.missing.map(short).join('、')}」的位置，可以写得更完整，如「Lorne VIC」「Victor Harbor SA」`);
      if (r.modeChanged) parts.push(`交通方式已按距离自动改成「${MODES[r.modeChanged].label}」，可在「高级」里改`);
      if (r.estimated) parts.push(`有 ${r.estimated} 段没取到真实道路（可能离线），先按直线估算`);
      setStatus(parts.join('；'));
    }, 300);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, day.manualRoute]);

  /** 改地址：标题是自动生成的就跟着改；改了目的地，第二天的出发地也跟着改 */
  const setPlaces = (mutate: (d: Day) => void) =>
    update((t) => {
      const i = t.days.findIndex((x) => x.id === day.id);
      const d = t.days[i];
      if (!d) return;
      const wasAuto = !d.title.trim() || d.title === '新的一天' || d.title === autoTitle(d);
      const oldTo = d.to;
      mutate(d);
      d.stops = d.stops.map((s) => s.trim()).filter(Boolean);
      if (wasAuto || oldTo.trim() !== d.to.trim()) d.title = autoTitle(d);
      // 目的地换了：原来那个地方的住宿、餐厅候选都不适用了
      if (oldTo.trim() !== d.to.trim()) {
        if (d.accommodation) {
          const old = d.accommodation;
          if (old.booked && old.name) {
            d.notes = `⚠️ 目的地改了：原来订的「${old.name}」在 ${short(oldTo)}，记得取消或改订。\n${d.notes}`.trim();
          }
          d.accommodation = { name: '', cost: old.cost, booked: false, paid: false, notes: '' };
          d.stayOptions = [];
          applyVerifiedStaysToDay(d);
        }
        d.dining = d.dining.filter((r) => r.picked && r.where !== short(oldTo));
      }
      const n = t.days[i + 1];
      if (n && oldTo !== d.to && n.from.trim() === oldTo.trim()) {
        const nAuto = !n.title.trim() || n.title === autoTitle(n);
        n.from = d.to;
        if (nAuto) n.title = autoTitle(n);
      }
    });

  // 第二天的出发地跟着改了：也帮它重算
  useEffect(() => {
    if (!next || next.manualRoute || routeKey(next) === next.routeKey || next.from.trim() !== day.to.trim()) return;
    if (next.routeKey === undefined && next.km > 0) return; // 原来就有的数据，没改过出发地
    const timer = setTimeout(() => void autoRouteDay(trip, next, update), 2500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [next?.from]);

  const known = [...new Set(trip.places.map((p) => p.name))];

  return (
    <div className="form day-editor">
      <datalist id={listId}>
        {known.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>

      <div className="de-route">
        <div className="de-row">
          <span className="de-dot" aria-hidden="true" />
          <span className="de-label">从</span>
          {editFrom || index === 0 || !prev ? (
            <AddressInput
              label="出发地"
              value={day.from}
              listId={listId}
              placeholder="出发地址，如 Point Cook VIC"
              onCommit={(v) => setPlaces((d) => void (d.from = v))}
            />
          ) : (
            <span className="de-from">
              {short(day.from) || '—'}
              <span className="muted small">（前一天的目的地）</span>
              <button className="link small" onClick={() => setEditFrom(true)}>改</button>
            </span>
          )}
        </div>
        {day.stops.map((s, i) => (
          <div className="de-row" key={i + s}>
            <span className="de-dot small" aria-hidden="true" />
            <span className="de-label">途经</span>
            <AddressInput
              label={`途经点 ${i + 1}`}
              value={s}
              listId={listId}
              placeholder="途经的地方或景点"
              onCommit={(v) => setPlaces((d) => void (d.stops[i] = v))}
            />
            <button className="icon" aria-label={`删除途经点 ${short(s)}`} onClick={() => setPlaces((d) => void d.stops.splice(i, 1))}>
              ×
            </button>
          </div>
        ))}
        <div className="de-row">
          <span className="de-dot small ghost" aria-hidden="true" />
          <span className="de-label" />
          <AddressInput
            key={day.stops.length}
            label="添加途经点"
            value=""
            listId={listId}
            placeholder="+ 加一个途经点（可选）"
            onCommit={(v) => v && setPlaces((d) => void d.stops.push(v))}
          />
        </div>
        <div className="de-row">
          <span className="de-dot end" aria-hidden="true" />
          <span className="de-label">到</span>
          <AddressInput
            label="目的地"
            value={day.to}
            listId={listId}
            autoFocus={day.title === '新的一天'}
            placeholder="今天去哪，如 Robe SA"
            onCommit={(v) => setPlaces((d) => void (d.to = v))}
          />
        </div>
      </div>

      <div className={`de-auto${busy ? ' busy' : ''}`} aria-live="polite">
        <div className="de-auto-head">自动计算{day.manualRoute ? '（已改为手动）' : ''}</div>
        <div className="de-auto-vals">
          <span>
            <b>{day.km}</b> km
          </span>
          <span>
            约 <b>{day.driveHours}</b> 小时
          </span>
          <span>油费 <b>{fuel ? money(fuel) : '—'}</b></span>
          <span className="muted small">{modeSummary(day)}</span>
        </div>
        {(busy || status) && <p className="small de-status">{status}</p>}
      </div>

      {!last && (
        <label className="check">
          <input
            type="checkbox"
            checked={!!acc}
            onChange={(e) =>
              set((d) => {
                d.accommodation = e.target.checked ? { name: '', cost: 0, booked: false, paid: false, notes: '' } : null;
              })
            }
          />
          今晚住在 {short(day.to) || '目的地'}（住宿在「住宿」分页里按评分找、加入）
        </label>
      )}

      <details className="advanced">
        <summary className="muted small">高级：标题、交通方式、手动改里程、备注</summary>
        <div className="form">
          <Field label="标题（默认按路线自动生成）">
            <input value={day.title} onChange={(e) => set((d) => void (d.title = e.target.value))} />
          </Field>
          <ModeEditor day={day} set={set} />
          <div className="grid2">
            <Field label="里程 (km)">
              <NumInput value={day.km} onChange={(v) => set((d) => void ((d.km = v), (d.manualRoute = true)))} />
            </Field>
            <Field label="路上时间 (小时)">
              <NumInput value={day.driveHours} step={0.5} onChange={(v) => set((d) => void ((d.driveHours = v), (d.manualRoute = true)))} />
            </Field>
          </div>
          {day.manualRoute && (
            <button className="mini" onClick={() => set((d) => void ((d.manualRoute = false), (d.routeKey = undefined)))}>
              恢复自动计算
            </button>
          )}
          <PlaceTools trip={trip} day={day} update={update} set={set} />
          <Field label="备注">
            <textarea rows={3} value={day.notes} onChange={(e) => set((d) => void (d.notes = e.target.value))} />
          </Field>
        </div>
      </details>

      <DayMoveDelete trip={trip} index={index} update={update} onDeleted={onDeleted} />
    </div>
  );
}

function DayMoveDelete({ trip, index, update, onDeleted }: { trip: Trip; index: number; update: Update; onDeleted?: () => void }) {
  const day = trip.days[index];
  const move = (dir: -1 | 1) =>
    update((t) => {
      const j = index + dir;
      if (j < 0 || j >= t.days.length) return;
      [t.days[index], t.days[j]] = [t.days[j], t.days[index]];
    });
  const remove = () => {
    if (!confirm(`删除第 ${index + 1} 天？（删除前会自动保存一个版本，可在「方案 → 历史版本」里找回）`)) return;
    update((t) => {
      addVersion(t, `删除第 ${index + 1} 天「${day.title}」之前`, 'auto');
      t.days = t.days.filter((x) => x.id !== day.id);
      t.expenses.forEach((e) => {
        if (e.dayId === day.id) e.dayId = null;
      });
    });
    onDeleted?.();
  };
  return (
    <div className="row wrap">
      <button onClick={() => move(-1)} disabled={index === 0}>上移</button>
      <button onClick={() => move(1)} disabled={index === trip.days.length - 1}>下移</button>
      <span className="spacer" />
      <button className="danger" onClick={remove}>删除这天</button>
    </div>
  );
}

/** 手机：从下往上拉出的某一天详情，可左右翻到前一天 / 后一天 */
function DaySheet({
  trip,
  index,
  update,
  setIndex,
  onMap,
  goTo,
  initialTab,
}: {
  trip: Trip;
  index: number;
  update: Update;
  setIndex: (i: number | null) => void;
  onMap: () => void;
  goTo: (t: Tab) => void;
  initialTab?: DayTab;
}) {
  const close = () => setIndex(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    document.body.classList.add('no-scroll');
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.classList.remove('no-scroll');
    };
  });
  if (!trip.days[index]) return null;
  return (
    <div className="sheet day-sheet" role="dialog" aria-modal="true" aria-label={`第 ${index + 1} 天`} onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="sheet-inner">
        <div className="grab" aria-hidden="true" />
        <DayDetail key={trip.days[index].id + (initialTab ?? '')} trip={trip} index={index} update={update} onMap={onMap} onClose={close} goTo={goTo} initialTab={initialTab} />
        <div className="dd-nav">
          {index > 0 ? <button onClick={() => setIndex(index - 1)}>← 第 {index} 天</button> : <span />}
          {index < trip.days.length - 1 ? <button onClick={() => setIndex(index + 1)}>第 {index + 2} 天 →</button> : <span />}
        </div>
      </div>
    </div>
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
      const r = await routeDay(t, d);
      if (r.segments.length && !r.failed) Object.assign(d, { km: r.km, driveHours: r.hours });
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

/* ---------------- 地图（全屏） ---------------- */

function MapOverlay({
  trip,
  focus,
  setFocus,
  update,
  onOpenDay,
  onClose,
}: {
  trip: Trip;
  focus: number | null;
  setFocus: (i: number | null) => void;
  update: Update;
  onOpenDay: (i: number) => void;
  onClose: () => void;
}) {
  const day = focus !== null ? trip.days[focus] : null;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.classList.add('no-scroll');
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.classList.remove('no-scroll');
    };
  });
  return (
    <div className="map-overlay" role="dialog" aria-modal="true" aria-label="路线地图">
      <div className="mo-top">
        <button className="mo-close" onClick={onClose}>← 返回</button>
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
      </div>
      <div className="mo-map">
        <TripMap trip={trip} focus={focus} height={0} />
      </div>
      <div className="mo-card">
        {day ? (
          <>
            <div className="row between">
              <div>
                <div className="muted small">
                  第 {focus! + 1} 天 · {formatDate(addDays(trip.startDate, focus!))} · {day.km} km · {day.driveHours} 小时
                </div>
                <b>{day.title}</b>
              </div>
              <button className="mini on" onClick={() => onOpenDay(focus!)}>看这一天</button>
            </div>
            <RouteCheck trip={trip} day={day} update={update} />
          </>
        ) : (
          <p className="muted small">每天一种颜色；实线是真实道路，带数字的圆点是当晚过夜地，小圆点是途经景点。点标记看照片和介绍，点上面的 D1、D2… 只看那一天。</p>
        )}
      </div>
    </div>
  );
}

/** 交通方式：当天默认 + 每一段单独指定 */
function ModeEditor({ day, set }: { day: Day; set: (mutate: (d: Day) => void) => void }) {
  const names = dayPointNames(day);
  const setLeg = (to: string, v: string) =>
    set((d) => {
      const m = { ...(d.legModes ?? {}) };
      if (v === '') delete m[to];
      else m[to] = v as Mode;
      d.legModes = Object.keys(m).length ? m : undefined;
    });
  return (
    <div className="mode-editor">
      <Field label="当天主要交通方式">
        <select value={dayMode(day)} onChange={(e) => set((d) => void (d.mode = e.target.value as Mode))}>
          {MODE_KEYS.map((m) => (
            <option key={m} value={m}>{MODES[m].icon} {MODES[m].label}</option>
          ))}
        </select>
      </Field>
      {names.length > 1 && (
        <details>
          <summary className="small">分段设置（例如：开车到市区，再坐电车去海滩）</summary>
          <ul className="plain legs">
            {names.slice(1).map((to, k) => (
              <li key={to + k} className="row small">
                <span className="grow">{short(names[k])} → {short(to)}</span>
                <select value={day.legModes?.[to] ?? ''} onChange={(e) => setLeg(to, e.target.value)}>
                  <option value="">同当天（{MODES[dayMode(day)].icon}）</option>
                  {MODE_KEYS.map((m) => (
                    <option key={m} value={m}>{MODES[m].icon} {MODES[m].label}</option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        </details>
      )}
      {!isDriveDay(day) && <p className="muted small">这一天不按自驾计算油费；交通票价请在「费用」里添加。</p>}
    </div>
  );
}

/** 地图页：用真实路线核对当天填写的里程 / 时间 */
function RouteCheck({ trip, day, update }: { trip: Trip; day: Day; update: Update }) {
  const [r, setR] = useState<Awaited<ReturnType<typeof routeDay>> | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let alive = true;
    setR(null);
    routeDay(trip, day).then((x) => alive && setR(x));
    return () => {
      alive = false;
    };
    // 只在路线相关字段变化时重算
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day.from, day.to, day.stops.join('|'), day.mode, JSON.stringify(day.legModes), trip.places.length, retry]);
  if (!r || !r.segments.length) return null;
  const off = Math.abs(r.km - day.km) > Math.max(10, day.km * 0.15);
  return (
    <div className="route-check small">
      <div>
        {r.segments.map((s, i) => (
          <span key={i} className="seg-pill">
            {MODES[s.mode].icon} {s.km} km · {s.hours} 小时{s.routed ? '' : '（示意）'}
          </span>
        ))}
      </div>
      <div className="muted">
        地图路线合计 {r.km} km · 约 {r.hours} 小时
        {r.failed > 0 && (
          <>
            ；{r.failed} 段未能获取真实道路，按直线估算{' '}
            <button className="link" onClick={() => setRetry((n) => n + 1)}>重试</button>
          </>
        )}
      </div>
      {off && (
        <div>
          <span className="warn-text">与填写的 {day.km} km / {day.driveHours} 小时不一致</span>{' '}
          <button
            className="mini"
            onClick={() =>
              update((t) => {
                const d = t.days.find((x) => x.id === day.id);
                if (d) Object.assign(d, { km: r.km, driveHours: r.hours });
              })
            }
          >
            用地图数据更新
          </button>
        </div>
      )}
    </div>
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
function DayGuide({
  trip,
  day,
  index,
  update,
  only,
}: {
  trip: Trip;
  day: Day;
  index: number;
  update?: Update;
  /** 只显示其中一部分（某一天详情的分页） */
  only?: 'sights' | 'stays' | 'dining';
}) {
  const show = (k: 'sights' | 'stays' | 'dining') => !only || only === k;
  const sights = dayPlaces(trip, day).filter((p) => p.desc && p.name !== day.from);

  return (
    <div className="guide">
      {update && show('sights') && <AiButton trip={trip} index={index} update={update} />}
      {show('sights') && !sights.length && <p className="muted small">这天还没有景点介绍，可以用上面的按钮让 AI 生成，或在「编辑」里添加途经点。</p>}
      {show('sights') && sights.length > 0 && (
        <>
          <h3>📍 景点与风景</h3>
          <div className="sights">
            {sights.map((p) => (
              <PlaceCard key={p.name} place={p} />
            ))}
          </div>
        </>
      )}

      {show('stays') && day.accommodation && update && <StayPicker trip={trip} dayIndex={index} update={update} />}

      {show('dining') && update && <DiningPicker trip={trip} dayIndex={index} update={update} />}
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
  const [imgFailed, setImgFailed] = useState(false);
  return (
    <article className="sight">
      <div className="photo">
        {wiki?.thumb && !imgFailed ? (
          <img src={wiki.thumb} alt={place.label} loading="lazy" onError={() => setImgFailed(true)} />
        ) : (
          <span aria-hidden="true">📷</span>
        )}
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
    const r = await routeDay(trip, day);
    setBusy('');
    if (!r.segments.length) return alert('无法计算路线：至少需要两个有坐标的地点。');
    if (r.failed) alert(`有 ${r.failed} 段未能获取真实道路（可能离线），已按直线距离估算。`);
    set((d) => {
      d.km = r.km;
      d.driveHours = r.hours;
    });
  };
  const reorder = () => {
    const next = orderStops(trip, day);
    set((d) => void (d.stops = next));
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
      <div className="row wrap">
        <button className="mini" disabled={!!busy} onClick={calc}>
          {busy === 'route' ? '计算中…' : '重新按真实道路计算'}
        </button>
        <button className="mini" disabled={day.stops.filter((x) => x.trim()).length < 2} onClick={reorder}>
          途经点按顺路排序
        </button>
      </div>
    </div>
  );
}

/* ---------------- 清单 ---------------- */

function Checklist({ trip, update }: { trip: Trip; update: Update }) {
  const groups = [...new Set(trip.checklist.map((c) => c.group))];
  const [text, setText] = useState('');
  const [group, setGroup] = useState(groups[0] ?? '出发前');

  const add = () => {
    if (!text.trim()) return;
    if (importText(text)) return;
    update((t) => void t.checklist.push({ id: newId(), text: text.trim(), group: group.trim() || '其他', done: false }));
    setText('');
  };

  // 粘贴整段：拆成一条条、分组、去掉已有的；能用 Claude 时再整理一遍
  const [pasteText, setPasteText] = useState('');
  const [msg, setMsg] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const importText = (raw: string): boolean => {
    if (!raw.includes('\n') && !/[、；;]/.test(raw) && raw.length < 40) return false;
    const knownGroups = groups.length ? groups : ['出发前', '行李', '路上注意'];
    const write = (items: ParsedItem[], ids: string[]) => {
      const existing = trip.checklist.filter((c) => !ids.includes(c.id));
      const fresh: ParsedItem[] = [];
      const skipped: string[] = [];
      const ticked: string[] = []; // 粘贴里打了勾、和已有条目重复的：把已有的也勾上
      for (const it of items) {
        const at = findDuplicate(it.text, existing.map((c) => c.text));
        if (at >= 0) {
          skipped.push(it.text);
          if (it.done && !existing[at].done) ticked.push(existing[at].id);
        } else if (isDuplicate(it.text, fresh.map((f) => f.text))) skipped.push(it.text);
        else fresh.push(it);
      }
      update((t) => {
        t.checklist = t.checklist.filter((c) => !ids.includes(c.id));
        for (const c of t.checklist) if (ticked.includes(c.id)) c.done = true;
        fresh.forEach((f, k) => t.checklist.push({ id: ids[k], text: f.text, group: f.group, done: f.done }));
      });
      const byGroup = new Map<string, number>();
      fresh.forEach((f) => byGroup.set(f.group, (byGroup.get(f.group) ?? 0) + 1));
      return `加了 ${fresh.length} 项${fresh.length ? `：${[...byGroup].map(([g, n]) => `${g} ${n}`).join('、')}` : ''}${
        skipped.length ? `；跳过 ${skipped.length} 项已有的（${skipped.slice(0, 4).join('、')}${skipped.length > 4 ? ' 等' : ''}）` : ''
      }${ticked.length ? `；其中 ${ticked.length} 项你已经做完了，已勾上` : ''}`;
    };
    const items = parseChecklistText(raw, knownGroups);
    if (!items.length) {
      setMsg('没认出清单项。每行一项，或用顿号隔开就行。');
      return true;
    }
    const ids = Array.from({ length: 200 }, () => newId());
    setMsg(write(items, ids));
    setText('');
    setPasteText('');
    setAiBusy(true);
    aiParseChecklist(raw, knownGroups).then((ai) => {
      setAiBusy(false);
      if (!ai?.length) return;
      const same = ai.length === items.length && ai.every((x, k) => x.text === items[k].text && x.group === items[k].group);
      if (same) return setMsg((m) => `${m}（Claude 已核对）`);
      setMsg(`${write(ai, ids)}（Claude 整理过）`);
    });
    return true;
  };

  return (
    <>
      <section className="paste-box" aria-labelledby="cl-paste">
        <div id="cl-paste" className="find-head">有现成的清单？整段粘贴到这里，自动拆成一条条、分好组</div>
        <textarea
          aria-label="粘贴清单"
          rows={2}
          placeholder="行李清单、备忘录、聊天里的待办都行：自动去掉序号符号，按「行李 / 出发前 / 路上注意 / 阿德莱德 / 袋鼠岛」分组，已有的不重复加，打了勾的算已完成。"
          value={pasteText}
          onPaste={(e) => {
            if (importText(e.clipboardData.getData('text'))) e.preventDefault();
          }}
          onChange={(e) => setPasteText(e.target.value)}
        />
        {pasteText.trim() && (
          <button className="primary" onClick={() => importText(pasteText) || setMsg('内容太少了，直接在下面「新增事项」里加就好。')}>整理并加入</button>
        )}
        {aiBusy && <p className="small muted">Claude 正在整理…</p>}
        {msg && <p className="small sp-added">{msg}</p>}
      </section>
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
          placeholder="新增事项（也可以粘贴一整段清单）"
          value={text}
          onPaste={(e) => {
            if (importText(e.clipboardData.getData('text'))) e.preventDefault();
          }}
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

function Settings({
  trip,
  update,
  onImport,
  children,
}: {
  trip: Trip;
  update: Update;
  onImport: (t: Trip) => void;
  children?: React.ReactNode;
}) {
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
        {trip.children > 0 && (
          <Field label="小孩年龄（订房平台按年龄算房型，用逗号隔开）">
            <AgesInput trip={trip} update={update} />
          </Field>
        )}
      </section>
      {children}

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
          未开启家庭同步时，数据只保存在本设备浏览器中。也可以「导出」文件发给家人，对方「导入」会作为一个新行程加入。
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
    update((t) => void addVersion(t, 'AI 批量生成前', 'auto'));
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

/** 小孩年龄输入：打字时保留原文，离开输入框才整理 */
function AgesInput({ trip, update }: { trip: Trip; update: Update }) {
  const [text, setText] = useState(childAges(trip).join(', '));
  const commit = () => {
    const ages = text
      .split(/[,，\s]+/)
      .map((x) => Number(x))
      .filter((n) => Number.isFinite(n) && n >= 0 && n < 18);
    update((t) => void (t.childAges = ages));
    setText(childAges({ ...trip, childAges: ages }).join(', '));
  };
  return <input inputMode="numeric" value={text} placeholder="如 8, 6" onChange={(e) => setText(e.target.value)} onBlur={commit} />;
}
