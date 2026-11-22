import { useMemo, useState } from 'react';
import type { Day, Trip } from './types';
import { addDays, formatDate, money } from './calc';
import { affectedBookings, compare, proposalFromAi, proposalTrip, proposeByRules, type ChangeKind, type Proposal } from './replan';
import { loadAiSettings, replanWithAi } from './ai';
import TripMap from './TripMap';

const KIND_LABEL: Record<ChangeKind, string> = {
  same: '不变',
  merged: '合并',
  split: '拆分',
  added: '新增',
  edited: '调整',
};

const short = (place: string) =>
  place.replace(/,?\s+(VIC|NSW|QLD|SA|WA|TAS|NT|ACT)$/i, '').replace(/,\s*(Australia|New Zealand)$/i, '');
const route = (d: Day) => (d.from === d.to ? `${short(d.from)} 周边` : `${short(d.from)} → ${short(d.to)}`);

/** 行程页顶部：输入目标天数 → 生成方案 → 对比 → 确认应用 */
export default function Replan({
  trip,
  onApply,
  onSave,
}: {
  trip: Trip;
  onApply: (t: Trip, label: string) => void;
  /** 另存为备选方案，不应用 */
  onSave: (t: Trip, label: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState(trip.days.length);
  const [request, setRequest] = useState('');
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const hasKey = !!loadAiSettings().apiKey;

  const valid = target >= 1 && target <= 60 && target !== trip.days.length;

  const byRules = () => {
    setStatus('');
    setProposal(proposeByRules(trip, target));
  };
  const byAi = async () => {
    setBusy(true);
    setProposal(null);
    try {
      const { plan, costUsd } = await replanWithAi(loadAiSettings(), trip, target, request, setStatus);
      setProposal(proposalFromAi(trip, plan));
      setStatus(`AI 方案已生成（约 US$${costUsd.toFixed(2)}）`);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <section className="card row between replan-entry">
        <span>
          共 <b>{trip.days.length}</b> 天，想改天数？
        </span>
        <button
          className="mini on"
          onClick={() => {
            setOpen(true);
            setTarget(Math.max(1, trip.days.length - 3));
          }}
        >
          调整天数
        </button>
      </section>
    );
  }

  return (
    <section className="card replan">
      <div className="row between">
        <h2>调整天数</h2>
        <button className="icon" aria-label="关闭" onClick={() => { setOpen(false); setProposal(null); setStatus(''); }}>×</button>
      </div>
      <div className="row wrap target">
        <span>
          {trip.days.length} 天 →
        </span>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={60}
          value={target}
          onChange={(e) => {
            setTarget(Number(e.target.value));
            setProposal(null);
          }}
        />
        <span>天</span>
      </div>
      <textarea
        rows={2}
        placeholder="额外要求（AI 调整时参考），如：阿德莱德至少住 2 晚；一定要去十二门徒岩；每天开车不超过 4 小时"
        value={request}
        onChange={(e) => setRequest(e.target.value)}
      />
      <div className="row wrap">
        <button className="primary" disabled={!valid || busy} onClick={byRules}>智能调整</button>
        <button className="mini ai-btn big" disabled={!valid || busy || !hasKey} onClick={byAi}>
          {busy ? '✨ AI 规划中…' : '✨ AI 调整'}
        </button>
      </div>
      <p className="muted small">
        「智能调整」立即给出方案：缩短时合并车程较短或同城的相邻日，延长时先拆分长途日、再在主要目的地加住。
        {hasKey ? '「AI 调整」会综合景点取舍、车程和孩子体力重新编排，并参考你的额外要求。' : '在「设置 → AI 推荐」填写 API Key 后可用「AI 调整」。'}
      </p>
      {status && <p className="muted small">{status}</p>}
      {proposal && (
        <Comparison
          trip={trip}
          proposal={proposal}
          onApply={(t) => {
            onApply(t, `${trip.days.length} 天 → ${t.days.length} 天`);
            setOpen(false);
            setProposal(null);
            setStatus('');
          }}
          onCancel={() => setProposal(null)}
          onSave={(t) => {
            const label = prompt(
              '给这个方案起个名字',
              `${t.days.length} 天方案（${proposal.engine === 'ai' ? 'AI' : '智能规则'}）`,
            );
            if (!label?.trim()) return;
            onSave(t, label.trim());
            setStatus(`已另存为方案「${label.trim()}」，可在「方案」页对比或采用。`);
          }}
        />
      )}
    </section>
  );
}

function Delta({ before, after, fmt, lowerIsGood = true }: { before: number; after: number; fmt: (n: number) => string; lowerIsGood?: boolean }) {
  const d = after - before;
  const cls = d === 0 ? 'muted' : (d < 0) === lowerIsGood ? 'good' : 'bad';
  return (
    <>
      <span className="muted">{fmt(before)}</span> → <b>{fmt(after)}</b>{' '}
      {d !== 0 && <span className={`small ${cls}`}>({d > 0 ? '+' : '−'}{fmt(Math.abs(d))})</span>}
    </>
  );
}

function Comparison({
  trip,
  proposal,
  onApply,
  onCancel,
  onSave,
}: {
  trip: Trip;
  proposal: Proposal;
  onApply: (t: Trip) => void;
  onCancel: () => void;
  onSave: (t: Trip) => void;
}) {
  const after = useMemo(() => proposalTrip(trip, proposal), [trip, proposal]);
  const c = useMemo(() => compare(trip, after), [trip, after]);
  const bookings = useMemo(() => affectedBookings(trip, after), [trip, after]);
  const [mapView, setMapView] = useState<'after' | 'before'>('after');
  const maxDrive = (t: Trip) => Math.max(0, ...t.days.map((d) => d.driveHours));
  const hrs = (n: number) => `${Math.round(n * 10) / 10} 小时`;

  return (
    <div className="compare">
      <h3>
        调整方案 <span className="tag">{proposal.engine === 'ai' ? 'AI' : '智能规则'}</span>
      </h3>
      <p className="notes">{proposal.summary}</p>

      <div className="cmp-stats">
        <div>天数 / 晚数</div>
        <div>
          <Delta before={c.before.days} after={c.after.days} fmt={(n) => `${n} 天`} lowerIsGood={false} /> ·{' '}
          {c.after.nights} 晚
        </div>
        <div>总里程</div>
        <div><Delta before={c.before.totalKm} after={c.after.totalKm} fmt={(n) => `${n.toLocaleString()} km`} /></div>
        <div>总驾驶</div>
        <div><Delta before={c.before.driveHours} after={c.after.driveHours} fmt={hrs} /></div>
        <div>最长一天</div>
        <div><Delta before={maxDrive(trip)} after={maxDrive(after)} fmt={hrs} /></div>
        <div>预计花费</div>
        <div><Delta before={c.before.total} after={c.after.total} fmt={money} /></div>
        <div>结束日期</div>
        <div>
          <span className="muted">{formatDate(addDays(trip.startDate, trip.days.length - 1))}</span> →{' '}
          <b>{formatDate(addDays(trip.startDate, after.days.length - 1))}</b>
        </div>
      </div>

      {(c.longDrives > 0 || bookings.length > 0) && (
        <div className="warn-box small">
          {c.longDrives > 0 && <p>⚠️ 有 {c.longDrives} 天车程超过 6 小时，带孩子会比较累。</p>}
          {bookings.length > 0 && <p>⚠️ 以下已预订的住宿需要取消或改期：{bookings.join('、')}</p>}
        </div>
      )}
      {c.dropped.length > 0 && (
        <p className="small">
          <span className="muted">不再经过：</span>
          {c.dropped.map((x) => <span key={x} className="chip-s drop">{short(x)}</span>)}
        </p>
      )}
      {c.added.length > 0 && (
        <p className="small">
          <span className="muted">新增地点：</span>
          {c.added.map((x) => <span key={x} className="chip-s add">{short(x)}</span>)}
        </p>
      )}

      <div className="row seg">
        <button className={mapView === 'after' ? 'chip active' : 'chip'} onClick={() => setMapView('after')}>新方案地图</button>
        <button className={mapView === 'before' ? 'chip active' : 'chip'} onClick={() => setMapView('before')}>原计划地图</button>
      </div>
      <TripMap trip={mapView === 'after' ? after : trip} focus={null} height={280} />

      <h3>逐日对比</h3>
      <ol className="plain cmp-days">
        {proposal.days.map((p, i) => {
          const d = after.days[i];
          return (
            <li key={d.id} className={`cmp-day k-${p.kind}`}>
              <div className="cmp-new">
                <div className="row between">
                  <b>
                    D{i + 1} · {formatDate(addDays(after.startDate, i))}
                  </b>
                  <span className={`tag k-${p.kind}`}>{KIND_LABEL[p.kind]}</span>
                </div>
                <div>{d.title}</div>
                <div className="small">
                  {route(d)} <span className="muted">· {d.km} km · {d.driveHours} 小时</span>
                  {d.driveHours > 6 && <span className="bad"> · 车程偏长</span>}
                </div>
                {d.stops.length > 0 && <div className="small muted">途经：{d.stops.map(short).join(' · ')}</div>}
                <div className="small">{d.accommodation ? `🏨 ${d.accommodation.name} · ${money(d.accommodation.cost)}` : '🏠 不住宿'}</div>
                {p.reason && <div className="small reason">{p.reason}</div>}
              </div>
              <div className="cmp-old small">
                <span className="muted">原计划：</span>
                {p.sources.length === 0 && <span className="muted">（无，新增的一天）</span>}
                {p.sources.map((s) => {
                  const o = trip.days[s];
                  return (
                    <div key={s}>
                      D{s + 1} {route(o)} <span className="muted">· {o.driveHours} 小时 · {o.accommodation?.name ?? '不住宿'}</span>
                    </div>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ol>

      <div className="row sticky-actions">
        <button className="primary" onClick={() => onApply(after)}>确认应用（{after.days.length} 天）</button>
        <button onClick={() => onSave(after)}>另存为方案</button>
        <button onClick={onCancel}>放弃</button>
      </div>
      <p className="muted small">应用前会自动保存当前版本；也可以先「另存为方案」，到「方案」页和其他方案一起对比。</p>
    </div>
  );
}
