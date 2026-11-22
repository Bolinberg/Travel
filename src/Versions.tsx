import { useMemo, useState } from 'react';
import type { Trip, TripVersion } from './types';
import { addDays, formatDate, money, summarize } from './calc';
import { KIND_LABEL, versionTrip } from './versions';
import { modeSummary } from './route';
import TripMap from './TripMap';

const short = (place: string) =>
  place.replace(/,?\s+(VIC|NSW|QLD|SA|WA|TAS|NT|ACT)$/i, '').replace(/,\s*(Australia|New Zealand)$/i, '');

function when(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

interface Scheme {
  key: string;
  name: string;
  trip: Trip;
  version?: TripVersion;
}

/** 「方案」页：历史版本列表 + 多方案对比 */
export default function Versions({
  trip,
  onSave,
  onRestore,
  onRename,
  onDelete,
}: {
  trip: Trip;
  onSave: (label: string) => void;
  onRestore: (id: string) => void;
  onRename: (id: string, label: string) => void;
  onDelete: (id: string) => void;
}) {
  const versions = [...(trip.versions ?? [])].reverse(); // 新的在上
  // 有备选方案（例如路线对比）时，默认选中它们并直接打开对比
  const proposals = versions.filter((v) => v.kind === 'proposal').map((v) => v.id).slice(0, 4).reverse();
  const [selected, setSelected] = useState<string[]>(proposals.length >= 2 ? proposals : ['current']);
  const [comparing, setComparing] = useState(proposals.length >= 2);

  const schemes: Scheme[] = useMemo(
    () => [
      { key: 'current', name: '当前版本', trip },
      ...versions.map((v) => ({ key: v.id, name: v.label, trip: versionTrip(trip, v), version: v })),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [trip],
  );
  const chosen = schemes.filter((s) => selected.includes(s.key));

  const toggle = (key: string) =>
    setSelected((sel) => (sel.includes(key) ? sel.filter((k) => k !== key) : sel.length >= 4 ? sel : [...sel, key]));

  const save = () => {
    const s = summarize(trip);
    const label = prompt('给这个方案起个名字', `${s.days} 天方案 · ${money(s.total)}`);
    if (label?.trim()) onSave(label.trim());
  };

  return (
    <>
      <section className="card">
        <div className="row between">
          <h2>方案与历史</h2>
          <button className="mini on" onClick={save}>保存当前为方案</button>
        </div>
        <p className="muted small">
          调整天数、AI 批量生成、恢复旧版本、删除某天之前会自动保存一份。勾选 2–4 个方案（含当前版本）即可并排对比，满意的方案可以「采用」。最多保留
          20 个版本，超出时先删除最旧的自动保存。
        </p>
      </section>

      <ul className="plain versions">
        {schemes.map((s) => (
          <VersionRow
            key={s.key}
            scheme={s}
            checked={selected.includes(s.key)}
            disabled={!selected.includes(s.key) && selected.length >= 4}
            onToggle={() => toggle(s.key)}
            onRestore={onRestore}
            onRename={onRename}
            onDelete={(id) => {
              setSelected((sel) => sel.filter((k) => k !== id));
              onDelete(id);
            }}
          />
        ))}
      </ul>
      {versions.length === 0 && (
        <p className="muted small center">还没有历史版本。在「行程 → 调整天数」里生成的方案可以「另存为方案」，也可以点上面的「保存当前为方案」。</p>
      )}

      <div className="compare-bar">
        <span className="small">已选 {chosen.length} 个方案</span>
        <button className="primary" disabled={chosen.length < 2} onClick={() => setComparing(true)}>
          对比所选
        </button>
      </div>

      {comparing && chosen.length >= 2 && (
        <MultiCompare schemes={chosen} onRestore={onRestore} onClose={() => setComparing(false)} />
      )}
    </>
  );
}

function VersionRow({
  scheme,
  checked,
  disabled,
  onToggle,
  onRestore,
  onRename,
  onDelete,
}: {
  scheme: Scheme;
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
  onRestore: (id: string) => void;
  onRename: (id: string, label: string) => void;
  onDelete: (id: string) => void;
}) {
  const s = summarize(scheme.trip);
  const v = scheme.version;
  return (
    <li className={`card version ${checked ? 'picked' : ''}`}>
      <label className="check">
        <input type="checkbox" checked={checked} disabled={disabled} onChange={onToggle} />
        <span className="grow">
          <b>{scheme.name}</b>{' '}
          {v ? <span className={`tag k-${v.kind}`}>{KIND_LABEL[v.kind]}</span> : <span className="tag good">当前</span>}
          <div className="muted small">
            {v ? `${when(v.createdAt)} · ` : ''}
            {s.days} 天 {s.nights} 晚 · {s.totalKm.toLocaleString()} km · 驾驶 {Math.round(s.driveHours)} 小时 · 预计 {money(s.total)}
          </div>
        </span>
      </label>
      {v && (
        <div className="row wrap small actions">
          <button
            className="mini on"
            onClick={() => confirm(`采用「${v.label}」？当前版本会先自动保存，之后可以随时切回。`) && onRestore(v.id)}
          >
            采用此方案
          </button>
          <button
            className="mini"
            onClick={() => {
              const label = prompt('重命名', v.label);
              if (label?.trim()) onRename(v.id, label.trim());
            }}
          >
            改名
          </button>
          <button className="mini danger" onClick={() => confirm(`删除「${v.label}」？`) && onDelete(v.id)}>
            删除
          </button>
        </div>
      )}
    </li>
  );
}

/** 多方案并排对比 */
function MultiCompare({
  schemes,
  onRestore,
  onClose,
}: {
  schemes: Scheme[];
  onRestore: (id: string) => void;
  onClose: () => void;
}) {
  const stats = schemes.map((s) => {
    const sum = summarize(s.trip);
    const maxDrive = Math.max(0, ...s.trip.days.map((d) => d.driveHours));
    const nightsAt = new Map<string, number>();
    s.trip.days.forEach((d) => d.accommodation && nightsAt.set(short(d.to), (nightsAt.get(short(d.to)) ?? 0) + 1));
    return {
      sum,
      maxDrive,
      longDays: s.trip.days.filter((d) => d.driveHours > 6).length,
      end: addDays(s.trip.startDate, s.trip.days.length - 1),
      stays: [...nightsAt.entries()].map(([k, n]) => `${k}${n > 1 ? ` ×${n}` : ''}`).join('、'),
      places: new Set(s.trip.days.flatMap((d) => [d.to, ...d.stops]).map(short)).size,
    };
  });
  const [mapIdx, setMapIdx] = useState(0);
  const best = (vals: number[], lower = true) => {
    const target = lower ? Math.min(...vals) : Math.max(...vals);
    return vals.map((v) => v === target && vals.some((x) => x !== target));
  };
  const row = (label: string, vals: number[], fmt: (n: number) => string, lower: boolean | null = true) => {
    const b = lower === null ? vals.map(() => false) : best(vals, lower);
    return (
      <tr>
        <th>{label}</th>
        {vals.map((v, i) => (
          <td key={i} className={b[i] ? 'best' : ''}>{fmt(v)}</td>
        ))}
      </tr>
    );
  };
  const maxDays = Math.max(...schemes.map((s) => s.trip.days.length));

  return (
    <section className="card multi">
      <div className="row between">
        <h2>方案对比</h2>
        <button className="icon" aria-label="关闭" onClick={onClose}>×</button>
      </div>
      <div className="table-scroll">
        <table className="cmp-table">
          <thead>
            <tr>
              <th />
              {schemes.map((s) => (
                <th key={s.key}>{s.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {row('天数', stats.map((x) => x.sum.days), (n) => `${n} 天`, null)}
            {row('总里程', stats.map((x) => x.sum.totalKm), (n) => `${n.toLocaleString()} km`)}
            {row('总驾驶', stats.map((x) => Math.round(x.sum.driveHours * 10) / 10), (n) => `${n} 小时`)}
            {row('最长一天', stats.map((x) => x.maxDrive), (n) => `${n} 小时`)}
            {row('超 6 小时的天数', stats.map((x) => x.longDays), (n) => `${n}`)}
            {row('预计花费', stats.map((x) => x.sum.total), money)}
            {row('人均', stats.map((x) => x.sum.perPerson), money)}
            {row('每天', stats.map((x) => x.sum.perDay), money)}
            {row('景点/地点数', stats.map((x) => x.places), (n) => `${n}`, false)}
            <tr>
              <th>结束日期</th>
              {stats.map((x, i) => (
                <td key={i}>{formatDate(x.end)}</td>
              ))}
            </tr>
            <tr>
              <th>过夜地</th>
              {stats.map((x, i) => (
                <td key={i} className="small">{x.stays || '—'}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="muted small">绿色 = 该项最优。</p>

      <h3>逐日路线</h3>
      <div className="table-scroll">
        <table className="cmp-table days">
          <thead>
            <tr>
              <th />
              {schemes.map((s) => (
                <th key={s.key}>{s.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: maxDays }, (_, i) => (
              <tr key={i}>
                <th>D{i + 1}</th>
                {schemes.map((s) => {
                  const d = s.trip.days[i];
                  if (!d) return <td key={s.key} className="muted">—</td>;
                  return (
                    <td key={s.key} className="small">
                      <div>{d.from === d.to ? `${short(d.from)} 周边` : `${short(d.from)} → ${short(d.to)}`}</div>
                      <div className="muted">
                        {d.driveHours} 小时 · {modeSummary(d).split(' ')[0]}
                        {d.driveHours > 6 && <span className="bad"> 偏长</span>}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3>地图</h3>
      <div className="chips">
        {schemes.map((s, i) => (
          <button key={s.key} className={mapIdx === i ? 'chip active' : 'chip'} onClick={() => setMapIdx(i)}>
            {s.name}
          </button>
        ))}
      </div>
      <TripMap trip={schemes[Math.min(mapIdx, schemes.length - 1)].trip} focus={null} height={300} />

      <div className="row wrap adopt">
        {schemes
          .filter((s) => s.version)
          .map((s) => (
            <button
              key={s.key}
              className="mini on"
              onClick={() => confirm(`采用「${s.name}」？当前版本会先自动保存。`) && onRestore(s.version!.id)}
            >
              采用「{s.name}」
            </button>
          ))}
      </div>
    </section>
  );
}
