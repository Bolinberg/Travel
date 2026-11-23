import { useEffect, useMemo, useRef, useState } from 'react';
import type { Day, Trip, TripVersion } from './types';
import { money, summarize } from './calc';
import { currentPlanId, planOptions, versionTrip } from './versions';
import { editEngine, editPlanWithAi } from './ai';
import { proposalFromAi, proposalTrip, type Proposal } from './replan';
import { Comparison } from './Replan';
import { looksLikeItinerary, parseItineraryText } from './itineraryParse';
import { MultiCompare } from './Versions';
import TripMap from './TripMap';

/*
 * 规划工作台：方案卡片（可比较的指标条）+ 逐日对比矩阵 + 「告诉我怎么改」输入框。
 */

const short = (place: string) =>
  place.replace(/,?\s+(VIC|NSW|QLD|SA|WA|TAS|NT|ACT)$/i, '').replace(/,\s*(Australia|New Zealand)$/i, '');
const route = (d: Day) => (d.from === d.to ? `${short(d.from)} 周边` : `${short(d.from)} → ${short(d.to)}`);

export interface PlanView {
  id: string | null; // null = 当前内容不属于任何方案
  tag: string;
  name: string;
  trip: Trip;
  active: boolean;
}

/** 行程里的所有方案（没有备选方案时只有「当前行程」一个） */
export function planViews(trip: Trip): PlanView[] {
  const opts = planOptions(trip);
  const active = currentPlanId(trip);
  if (!opts.length) return [{ id: null, tag: '当前', name: trip.name, trip, active: true }];
  return opts.map((v: TripVersion) => {
    const [tag, ...rest] = v.label.split('：');
    return {
      id: v.id,
      tag: rest.length ? tag : '方案',
      name: rest.length ? rest.join('：') : v.label,
      trip: v.id === active ? trip : versionTrip(trip, v),
      active: v.id === active,
    };
  });
}

function stats(t: Trip) {
  const s = summarize(t);
  const hours = t.days.map((d) => d.driveHours);
  return {
    days: s.days,
    nights: s.nights,
    drive: Math.round(s.driveHours * 10) / 10,
    longest: Math.max(0, ...hours),
    over5: hours.filter((h) => h > 5).length,
    cost: s.total,
  };
}

/* ---------------- 方案卡片 ---------------- */

export function PlanBoard({ trip, onSwitch, onNew }: { trip: Trip; onSwitch: (id: string) => void; onNew: () => void }) {
  const plans = planViews(trip);
  const all = plans.map((p) => ({ p, s: stats(p.trip) }));
  const max = {
    drive: Math.max(...all.map((x) => x.s.drive), 1),
    longest: Math.max(...all.map((x) => x.s.longest), 1),
    cost: Math.max(...all.map((x) => x.s.cost), 1),
  };
  const bar = (v: number, m: number, warn = false) => (
    <span className="pb-bar" aria-hidden="true">
      <span className={warn ? 'pb-fill warn' : 'pb-fill'} style={{ width: `${(v / m) * 100}%` }} />
    </span>
  );

  return (
    <section className="board" aria-label="行程方案">
      <div className="board-cards">
        {all.map(({ p, s }) => (
          <button
            key={p.id ?? 'current'}
            className={p.active ? 'pcard on' : 'pcard'}
            aria-pressed={p.active}
            disabled={!p.id}
            onClick={() => p.id && onSwitch(p.id)}
          >
            <span className="pcard-top">
              <span className="pcard-tag">{p.tag}</span>
              {p.active && plans.length > 1 && <span className="pcard-now">正在用</span>}
              {!p.active && p.id && <span className="pcard-use">改用这个</span>}
            </span>
            <span className="pcard-name">{p.name}</span>
            <span className="pcard-rows">
              <span className="pcard-row">
                <span>天数</span>
                <b>
                  {s.days} 天 {s.nights} 晚
                </b>
              </span>
              <span className="pcard-row">
                <span>总车程</span>
                <b>{s.drive} 小时</b>
                {bar(s.drive, max.drive)}
              </span>
              <span className="pcard-row">
                <span>最长一天</span>
                <b className={s.longest > 5 ? 'warn-text' : ''}>{s.longest} 小时</b>
                {bar(s.longest, max.longest, s.longest > 5)}
              </span>
              <span className="pcard-row">
                <span>预计花费</span>
                <b>{money(s.cost)}</b>
                {bar(s.cost, max.cost)}
              </span>
            </span>
            {s.over5 > 0 && <span className="pcard-flag">{s.over5} 天车程超过 5 小时</span>}
          </button>
        ))}
        <button className="pcard new" onClick={onNew}>
          <span className="pcard-plus" aria-hidden="true">+</span>
          <span className="pcard-name">新方案</span>
          <span className="muted small">用一句话描述，例如「在阿德莱德多住一天」</span>
        </button>
      </div>
    </section>
  );
}

/* ---------------- 逐日对比矩阵 ---------------- */

const intensity = (h: number) => (h > 6 ? 'h4' : h > 5 ? 'h3' : h > 3 ? 'h2' : h > 0.5 ? 'h1' : 'h0');

export function PlanMatrix({ trip, onSwitch }: { trip: Trip; onSwitch: (id: string) => void }) {
  const plans = planViews(trip);
  const maxDays = Math.max(...plans.map((p) => p.trip.days.length));
  return (
    <section className="matrix" aria-label="方案逐日对比">
      <p className="muted small">
        车程颜色：<span className="hchip h1">3 小时内</span> <span className="hchip h2">3–5 小时</span>{' '}
        <span className="hchip h3">5–6 小时</span> <span className="hchip h4">6 小时以上</span>
      </p>
      <div className="table-scroll">
        <table className="mx">
          <thead>
            <tr>
              <th className="mx-day" />
              {plans.map((p) => (
                <th key={p.id ?? 'current'} className={p.active ? 'on' : ''}>
                  <button className="mx-head" onClick={() => p.id && onSwitch(p.id)} disabled={!p.id || p.active}>
                    <span className="pcard-tag">{p.tag}</span> {p.name}
                    {p.active ? <span className="pcard-now">正在用</span> : <span className="mx-switch">改用</span>}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: maxDays }, (_, i) => (
              <tr key={i}>
                <th className="mx-day">第 {i + 1} 天</th>
                {plans.map((p) => {
                  const d = p.trip.days[i];
                  if (!d) return <td key={p.id ?? 'c'} className="mx-empty">已到家</td>;
                  return (
                    <td key={p.id ?? 'c'}>
                      <div className="mx-route">{route(d)}</div>
                      <div className="mx-meta">
                        <span className={`hchip ${intensity(d.driveHours)}`}>{d.driveHours ? `${d.driveHours} 小时` : '不开车'}</span>
                        <span className="mx-stay">{d.accommodation ? `住 ${short(d.to)}` : '回家'}</span>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ---------------- 「告诉我怎么改」 ---------------- */

const EXAMPLES = ['第 1 天别开那么久', '在阿德莱德多住一天', '最后一天直接回家，不去格兰扁', '加一天去 Victor Harbor'];

export function AskBar({
  trip,
  intent,
  focusKey,
  onApply,
  onSaveAsPlan,
}: {
  trip: Trip;
  /** new：从「+ 新方案」进来，主按钮是另存为新方案 */
  intent: 'edit' | 'new';
  /** 变化时聚焦输入框 */
  focusKey: number;
  onApply: (next: Trip, instruction: string) => void;
  onSaveAsPlan: (plan: Trip, title: string) => void;
}) {
  const [text, setText] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [engine, setEngine] = useState<'claude' | 'api' | null | undefined>(undefined);
  const [result, setResult] = useState<{ proposal: Proposal; title: string; instruction: string; engine: string } | null>(null);
  const ctl = useRef<AbortController | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let alive = true;
    editEngine().then((e) => alive && setEngine(e));
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    if (focusKey) input.current?.focus();
  }, [focusKey]);

  const run = async (instruction: string) => {
    if (!instruction.trim() || busy) return;
    setBusy(true);
    setError('');
    setStatus('正在准备…');
    ctl.current = new AbortController();
    try {
      const r = await editPlanWithAi(trip, instruction, setStatus, ctl.current.signal);
      setResult({
        proposal: proposalFromAi(trip, r.plan),
        title: r.plan.title || instruction.slice(0, 12),
        instruction,
        engine: r.engine === 'claude' ? 'Claude' : `AI（约 US$${(r.costUsd ?? 0).toFixed(2)}）`,
      });
      setStatus('');
    } catch (e) {
      setStatus('');
      const msg = e instanceof Error ? e.message : String(e);
      if (msg !== '已取消') setError(msg);
    } finally {
      setBusy(false);
      ctl.current = null;
    }
  };

  /**
   * 粘贴一整份行程：先按规则排出来给你看对比；能用 Claude 时再请 Claude 细化
   * （估里程车程、补上认不出的地点），细化好了替换掉。
   */
  const pasteItinerary = (raw: string): boolean => {
    if (!looksLikeItinerary(raw)) return false;
    const plan = parseItineraryText(raw, trip);
    setText('');
    setError('');
    setResult({ proposal: proposalFromAi(trip, plan), title: plan.title ?? '粘贴的行程', instruction: '粘贴的行程', engine: '自动识别' });
    if (engine) {
      setBusy(true);
      setStatus('Claude 正在细化这份行程（估里程车程、补上认不出的地点）…');
      ctl.current = new AbortController();
      const instruction = `我粘贴了一份行程，请按它重新安排整个行程：天数、每天去哪、住哪以粘贴内容为准；原行程里同样的日子尽量沿用（kind 填 same）；没写的里程和车程按真实道路估；地名用和原行程一致的写法，新地点在 places 里给坐标。\n\n<粘贴的行程>\n${raw.slice(0, 6000)}\n</粘贴的行程>`;
      editPlanWithAi(trip, instruction, setStatus, ctl.current.signal)
        .then((r) =>
          setResult((cur) =>
            cur && cur.instruction === '粘贴的行程'
              ? { proposal: proposalFromAi(trip, r.plan), title: r.plan.title || cur.title, instruction: '粘贴的行程', engine: r.engine === 'claude' ? 'Claude（已细化）' : 'AI（已细化）' }
              : cur,
          ),
        )
        .catch(() => {
          /* 细化失败就用自动识别的结果 */
        })
        .finally(() => {
          setBusy(false);
          setStatus('');
          ctl.current = null;
        });
    }
    return true;
  };

  const nextLetter = useMemo(() => {
    const used = new Set(planOptions(trip).map((v) => v.label.split('：')[0]));
    if (!planOptions(trip).length) return 'B';
    for (let i = 0; i < 26; i++) {
      const l = String.fromCharCode(65 + i);
      if (!used.has(l)) return l;
    }
    return '新';
  }, [trip]);

  const after = result ? proposalTrip(trip, result.proposal) : null;

  return (
    <>
      <form
        className="ask"
        onSubmit={(e) => {
          e.preventDefault();
          if (!pasteItinerary(text)) run(text);
        }}
      >
        <label className="ask-label" htmlFor="ask-input">
          {intent === 'new' ? '描述你想要的新方案' : '告诉我怎么改'}
        </label>
        <div className="ask-row">
          <textarea
            id="ask-input"
            ref={input}
            rows={1}
            value={text}
            placeholder={engine === null ? '粘贴一整份行程（第 1 天… 第 2 天…）可直接识别；一句话修改需在 Claude 里打开或填 API Key' : '例如：最后一天直接回家，不去格兰扁；也可以粘贴一整份行程'}
            onPaste={(e) => {
              if (pasteItinerary(e.clipboardData.getData('text'))) e.preventDefault();
            }}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                if (!pasteItinerary(text)) run(text);
              }
            }}
          />
          {busy ? (
            <button type="button" onClick={() => ctl.current?.abort()}>停止</button>
          ) : (
            <button type="submit" className="primary" disabled={!text.trim()}>
              {intent === 'new' ? '生成方案' : '调整'}
            </button>
          )}
        </div>
        {(status || error) && <p className={error ? 'ask-status err' : 'ask-status'}>{error || status}</p>}
        {!busy && !status && !error && !text && (
          <div className="ask-examples">
            {EXAMPLES.map((x) => (
              <button type="button" key={x} className="chip-x" onClick={() => setText(x)}>
                {x}
              </button>
            ))}
          </div>
        )}
      </form>

      {result && after && (
        <div className="sheet" role="dialog" aria-modal="true" aria-label="调整预览">
          <div className="sheet-inner">
            <div className="sheet-head">
              <div>
                <div className="muted small">你的要求</div>
                <b>「{result.instruction}」</b>
              </div>
              <button className="icon" aria-label="关闭" onClick={() => setResult(null)}>×</button>
            </div>
            <p className="muted small">
              {result.engine} 给出的方案：<b>{result.title}</b>。里程和车程是估算，应用后可在每天的编辑里按地图重算。
            </p>
            <Comparison
              trip={trip}
              proposal={result.proposal}
              preferSave={intent === 'new'}
              applyLabel="应用到当前方案"
              saveLabel={`另存为新方案 ${nextLetter}`}
              note="应用前会自动保存一份当前内容，可在「方案」页找回；另存为新方案后，可在行程页顶部和其他方案对比、切换。"
              onApply={(t) => {
                onApply(t, result.instruction);
                setResult(null);
                setText('');
              }}
              onSave={(t) => {
                onSaveAsPlan(t, result.title);
                setResult(null);
                setText('');
              }}
              onCancel={() => setResult(null)}
            />
          </div>
        </div>
      )}
    </>
  );
}

/* ---------------- 「方案」页 ---------------- */

/** 选方案：方案卡片 + 逐日 / 指标 / 地图对比 + 一句话生成新方案 + 改天数 + 历史版本 */
export function PlansPage({
  trip,
  onUse,
  onApplyEdit,
  onSavePlan,
  replan,
  history,
}: {
  trip: Trip;
  onUse: (id: string) => void;
  onApplyEdit: (next: Trip, instruction: string) => void;
  onSavePlan: (plan: Trip, title: string) => void;
  replan: React.ReactNode;
  history: React.ReactNode;
}) {
  const plans = planViews(trip);
  const active = plans.find((p) => p.active);
  const [view, setView] = useState<'days' | 'metrics' | 'map'>('days');
  const [mapIdx, setMapIdx] = useState(0);
  const [focusKey, setFocusKey] = useState(0);
  const askRef = useRef<HTMLElement>(null);
  const historyCount = (trip.versions ?? []).filter((v) => v.kind !== 'proposal').length;
  const VIEWS: [typeof view, string][] = [
    ['days', '逐日'],
    ['metrics', '指标'],
    ['map', '地图'],
  ];

  return (
    <>
      <div className="page-head">
        <h1>选方案</h1>
        <p className="muted small">
          {plans.length > 1
            ? `共 ${plans.length} 个方案，正在用 ${active?.tag ?? ''}。点卡片就改用那个方案，当前的修改会自动存回原方案，随时能切回来。`
            : '现在只有一个方案。在下面用一句话描述想要的变化，就能生成新方案来对比。'}
        </p>
      </div>
      <PlanBoard
        trip={trip}
        onSwitch={onUse}
        onNew={() => {
          setFocusKey((k) => k + 1);
          askRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }}
      />
      {plans.length > 1 && (
        <section className="plan-compare" aria-label="方案对比">
          <div className="seg-toggle" role="tablist" aria-label="对比方式">
            {VIEWS.map(([k, label]) => (
              <button key={k} role="tab" aria-selected={view === k} className={view === k ? 'on' : ''} onClick={() => setView(k)}>
                {label}
              </button>
            ))}
          </div>
          {view === 'days' && <PlanMatrix trip={trip} onSwitch={onUse} />}
          {view === 'metrics' && (
            <MultiCompare
              compact
              schemes={plans.map((p) => ({ key: p.id ?? 'current', name: `${p.tag}：${p.name}`, trip: p.trip }))}
              onRestore={onUse}
            />
          )}
          {view === 'map' && (
            <>
              <div className="chips">
                {plans.map((p, i) => (
                  <button key={p.id ?? 'c'} className={mapIdx === i ? 'chip active' : 'chip'} onClick={() => setMapIdx(i)}>
                    {p.tag}：{p.name}
                  </button>
                ))}
              </div>
              <TripMap trip={plans[Math.min(mapIdx, plans.length - 1)].trip} focus={null} height={340} />
            </>
          )}
        </section>
      )}
      <section className="card ask-card" ref={askRef}>
        <AskBar trip={trip} intent="new" focusKey={focusKey} onApply={onApplyEdit} onSaveAsPlan={onSavePlan} />
      </section>
      {replan}
      <details className="card history">
        <summary>历史版本（{historyCount}）</summary>
        {history}
      </details>
    </>
  );
}
