import { useState } from 'react';
import type { Rec, Trip } from './types';
import { addDays, foodStandard, formatDate, money } from './calc';
import { newId } from './id';
import { childAges, short } from './ui';
import { diningSearchLinks, extractUrl, loadPlatformPrefs, MORE_PLATFORMS, nameFromUrl, platformOf, savePlatformPrefs, staySearchLinks } from './search';
import { pickStay, stayGroups, stayLabel } from './Bookings';
import { usePasteBooking, usePasteDining } from './PasteBooking';

type Update = (mutate: (draft: Trip) => void) => void;

/** 这一晚所在的连住组 */
export function groupOf(trip: Trip, dayIndex: number): number[] {
  return stayGroups(trip).find((g) => g.days.includes(dayIndex))?.days ?? [dayIndex];
}

/** 粘贴进来的住宿还不知道价格：先按这处已有的价格估（已选的 > 候选的中位数 > 当前填的 > 200） */
export function estimateNightly(trip: Trip, dayIndex: number): number {
  const d = trip.days[dayIndex];
  const picked = d.stayOptions.find((r) => r.picked)?.cost;
  if (picked) return picked;
  const costs = d.stayOptions.map((r) => r.cost).filter((c): c is number => !!c).sort((a, b) => a - b);
  if (costs.length) return costs[Math.floor(costs.length / 2)];
  return d.accommodation?.cost || 200;
}

/** 粘贴链接 → 加入候选并选定（连住的每一晚一起）；返回加入的名字 */
export function addPastedStay(t: Trip, group: number[], url: string, title: string, nightly: number): string {
  const name = nameFromUrl(url) || title.slice(0, 60) || `${platformOf(url)} 上的住宿`;
  const platform = platformOf(url);
  const rec: Rec = {
    id: newId(),
    name,
    where: short(t.days[group[0]].to),
    type: `来自 ${platform}`,
    price: `估算 $${nightly}/晚，订好后填实价`,
    cost: nightly,
    note: '',
    picked: false,
    ...(platform === '官网' ? { url } : { bookingUrl: url }),
  };
  for (const i of group) {
    const d = t.days[i];
    // 同一个链接粘贴两次不重复加
    if (!d.stayOptions.some((r) => r.bookingUrl === url || r.url === url)) d.stayOptions.unshift({ ...rec, id: newId() });
  }
  const existing = t.days[group[0]].stayOptions.find((r) => r.bookingUrl === url || r.url === url)!;
  if (!existing.picked) pickStay(t, group, existing);
  return existing.name;
}

/**
 * 「住哪」：只需要粘贴链接。
 * 当前选择（去订 / 已订好）→ ① 一键去平台按评分找 → ② 粘贴看中的链接 → 候选
 */
export default function StayPicker({
  trip,
  dayIndex,
  update,
  compact = false,
}: {
  trip: Trip;
  dayIndex: number;
  update: Update;
  /** 在「预订」页里展开时不重复显示标题 */
  compact?: boolean;
}) {
  const group = groupOf(trip, dayIndex);
  const first = trip.days[group[0]];
  const acc = first.accommodation;
  const nights = group.length;
  const checkin = addDays(trip.startDate, group[0]);
  const checkout = addDays(trip.startDate, group[nights - 1] + 1);
  const picked = first.stayOptions.find((r) => r.picked);
  const top = first.stayOptions.find((r) => r.top) ?? first.stayOptions[0];
  const booked = group.every((i) => trip.days[i].accommodation?.booked);
  const nightly = acc?.cost || 0;
  const label = stayLabel(first);
  const chosen = label !== '还没选住宿';
  const link = picked?.bookingUrl || picked?.url || acc?.notes.match(/https?:\/\/\S+/)?.[0];

  const [paste, setPaste] = useState('');
  const [added, setAdded] = useState('');
  const [paying, setPaying] = useState(false);
  const [paid, setPaid] = useState(0);
  const [editing, setEditing] = useState(false);
  const [showAll, setShowAll] = useState(false);

  if (!acc) return <p className="muted small">这天不住宿。</p>;

  const pasted = usePasteBooking(trip, update);
  const takeText = (text: string) => {
    // 整段预订确认 / 房源文字：认出名称、日期、价格、确认号
    if (pasted.handle(text, group[0])) {
      setAdded('');
      setPaste('');
      return;
    }
    const { url, title } = extractUrl(text);
    if (!url) {
      setPaste(text);
      return;
    }
    let name = '';
    const est = estimateNightly(trip, group[0]);
    update((t) => void (name = addPastedStay(t, group, url, title, est)));
    // update 是异步合并的，名字直接按同样规则算一次用来提示
    setAdded(name || nameFromUrl(url) || title || platformOf(url));
    setPaste('');
  };
  const pasteFromClipboard = async () => {
    try {
      takeText(await navigator.clipboard.readText());
    } catch {
      /* 不能读剪贴板时直接在输入框里粘贴 */
    }
  };
  const confirmBooked = () => {
    const total = paid || nightly * nights;
    const perNight = Math.round(total / nights);
    update((t) => {
      for (const i of group) {
        const a = t.days[i].accommodation;
        if (!a) continue;
        a.booked = true;
        a.cost = perNight;
        const r = t.days[i].stayOptions.find((x) => x.picked);
        if (r) {
          r.cost = perNight;
          r.price = `实付 $${perNight}/晚`;
        }
      }
    });
    setPaying(false);
  };
  const setNightly = (v: number) =>
    update((t) => {
      for (const i of group) {
        const a = t.days[i].accommodation;
        if (a) a.cost = v;
        const r = t.days[i].stayOptions.find((x) => x.picked);
        if (r) {
          r.cost = v;
          r.price = `$${v}/晚`;
        }
      }
    });
  const rename = (name: string) =>
    update((t) => {
      for (const i of group) {
        const a = t.days[i].accommodation;
        if (a) a.name = name;
        const r = t.days[i].stayOptions.find((x) => x.picked);
        if (r) r.name = name;
      }
    });

  const links = staySearchLinks({ place: first.to, checkin, checkout, adults: trip.adults, childAges: childAges(trip) });
  const [favs, setFavs] = useState<string[]>(loadPlatformPrefs);
  const [moreOpen, setMoreOpen] = useState(false);
  const others = first.stayOptions.filter((r) => !r.picked);
  const shown = showAll ? others : others.slice(0, 3);

  return (
    <div className="sp">
      {!compact && (
        <div className="sp-head">
          <h3>住哪</h3>
          <span className="muted small">
            {short(first.to)} · {formatDate(checkin)} 入住 · {nights} 晚 · {trip.adults} 大 {trip.children} 小
          </span>
        </div>
      )}

      {/* 当前选择 */}
      <div className={`sp-now${booked ? ' booked' : chosen ? ' chosen' : ''}`}>
        {chosen ? (
          <>
            <div className="row between">
              <span className="muted small">已选</span>
              <span className={`tl-st ${booked ? 'ok' : 'no'}`}>{booked ? (acc.paid ? '已付' : '已订') : '未订'}</span>
            </div>
            {editing ? (
              <div className="grid2">
                <input aria-label="住宿名称" defaultValue={label} onBlur={(e) => e.target.value.trim() && rename(e.target.value.trim())} />
                <input
                  aria-label="每晚价格"
                  type="number"
                  inputMode="decimal"
                  defaultValue={nightly}
                  onBlur={(e) => setNightly(Number(e.target.value) || 0)}
                />
              </div>
            ) : (
              <b className="sp-name">{label}</b>
            )}
            <div className="small">
              {money(nightly)}/晚 × {nights} 晚 = <b>{money(nightly * nights)}</b>
              {picked?.price?.startsWith('估算') && <span className="muted">（估算，订好后填实价）</span>}
              {picked?.rating && <span className="rating"> · ★ {picked.rating}</span>}
            </div>
            {paying ? (
              <div className="sp-pay">
                <label className="small">
                  实付总价（{nights} 晚，AUD）
                  <input
                    type="number"
                    inputMode="decimal"
                    autoFocus
                    placeholder={String(nightly * nights)}
                    value={paid || ''}
                    onChange={(e) => setPaid(Number(e.target.value) || 0)}
                    onKeyDown={(e) => e.key === 'Enter' && confirmBooked()}
                  />
                </label>
                <button className="mini on" onClick={confirmBooked}>确认已订</button>
                <button className="mini" onClick={() => setPaying(false)}>取消</button>
              </div>
            ) : (
              <div className="row wrap gap">
                {!booked && link && (
                  <a className="mini on btn-link" href={link} target="_blank" rel="noreferrer">去 {platformOf(link)} 订 ↗</a>
                )}
                {!booked ? (
                  <button className="mini" onClick={() => (setPaid(0), setPaying(true))}>已订好</button>
                ) : (
                  <button
                    className="mini"
                    onClick={() => update((t) => group.forEach((i) => t.days[i].accommodation && ((t.days[i].accommodation!.booked = false), (t.days[i].accommodation!.paid = false))))}
                  >
                    改为未订
                  </button>
                )}
                <button className="link small" onClick={() => setEditing(!editing)}>{editing ? '完成' : '改名称 / 价格'}</button>
              </div>
            )}
          </>
        ) : (
          <>
            <b>还没选住宿</b>
            {top ? (
              <div className="row wrap gap small">
                <span>
                  推荐 <b>{top.name}</b>
                  {top.rating ? ` · ★ ${top.rating}` : ''}
                </span>
                <button className="mini on" onClick={() => update((t) => pickStay(t, group, top))}>选这家</button>
              </div>
            ) : (
              <span className="muted small">用下面的链接去平台找，看中了把链接粘贴回来。</span>
            )}
          </>
        )}
      </div>

      {/* ① 去找 */}
      <div className="sp-step">
        <div className="find-head">① 去平台找（已按评分筛好，带上日期和人数）</div>
        <div className="sp-links">
          {links
            .filter((l) => favs.includes(l.key))
            .map((l) => (
              <a key={l.key} className="sp-chip" href={l.href} target="_blank" rel="noreferrer" title={l.hint}>
                {l.label} ↗
              </a>
            ))}
          <button className="sp-chip more" onClick={() => setMoreOpen(!moreOpen)} aria-expanded={moreOpen}>
            {moreOpen ? '收起' : `更多平台（${links.length - favs.filter((k) => links.some((l) => l.key === k)).length}）`}
          </button>
        </div>
        {moreOpen && (
          <ul className="plain sp-more">
            {links.map((l) => {
              const info = MORE_PLATFORMS.find((p) => p.key === l.key);
              const on = favs.includes(l.key);
              return (
                <li key={l.key}>
                  <div className="sp-cand">
                    <a className="link strong" href={l.href} target="_blank" rel="noreferrer">{l.label} ↗</a>
                    <span className="muted small">{info?.about ?? l.hint}</span>
                  </div>
                  <button
                    className={on ? 'mini on' : 'mini'}
                    aria-pressed={on}
                    title={on ? '从常用里去掉' : '放到常用（每一晚都直接显示）'}
                    onClick={() => {
                      const next = on ? favs.filter((k) => k !== l.key) : [...favs, l.key];
                      setFavs(next);
                      savePlatformPrefs(next);
                    }}
                  >
                    {on ? '★ 常用' : '☆ 设为常用'}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* ② 粘贴 */}
      <div className="sp-step">
        <div className="find-head">② 看中了或订好了？把链接或整段确认信息粘贴到这里</div>
        <div className="sp-paste">
          <textarea
            aria-label="粘贴住宿链接或预订确认"
            rows={2}
            placeholder="粘贴房源链接，或确认邮件 / 订单页面的整段文字（自动认出名称、日期、总价和确认号）"
            value={paste}
            onPaste={(e) => {
              e.preventDefault();
              takeText(e.clipboardData.getData('text'));
            }}
            onChange={(e) => setPaste(e.target.value)}
          />
          <div className="sp-paste-btns">
            <button onClick={pasteFromClipboard}>粘贴</button>
            {paste.trim() && (
              <button className="primary" onClick={() => takeText(paste)}>加入</button>
            )}
          </div>
        </div>
        {added && <p className="small sp-added">已加入并选定「{added}」。价格先按估算，订好后点「已订好」填实付总价，或把确认邮件整段粘贴进来。</p>}
        {pasted.busy && <p className="small muted">Claude 正在核对…</p>}
        {pasted.message && <p className="small sp-added">{pasted.message}</p>}
        {pasted.warn && <p className="small warn-text">{pasted.warn}</p>}
      </div>

      {/* 候选 */}
      {others.length > 0 && (
        <div className="sp-step">
          <div className="find-head">其他候选（{others.length}）</div>
          <ul className="plain sp-list">
            {shown.map((r) => {
              const l = r.bookingUrl || r.url;
              return (
                <li key={r.id}>
                  <div className="sp-cand">
                    <b>
                      {r.name} {r.top && <span className="tag top">推荐</span>}
                    </b>
                    <span className="muted small">
                      {r.rating ? `★ ${r.rating} · ` : ''}
                      {r.cost ? `约 ${money(r.cost)}/晚` : r.price}
                      {r.note ? ` · ${r.note}` : ''}
                    </span>
                  </div>
                  <div className="sp-cand-act">
                    {l && (
                      <a className="link small" href={l} target="_blank" rel="noreferrer">{platformOf(l)} ↗</a>
                    )}
                    <button className="mini" onClick={() => update((t) => pickStay(t, group, r))}>选这家</button>
                    <button
                      className="icon"
                      aria-label={`删除 ${r.name}`}
                      onClick={() => update((t) => group.forEach((i) => void (t.days[i].stayOptions = t.days[i].stayOptions.filter((x) => x.name !== r.name))))}
                    >
                      ×
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          {others.length > 3 && (
            <button className="link small" onClick={() => setShowAll(!showAll)}>{showAll ? '收起' : `再看 ${others.length - 3} 家`}</button>
          )}
        </div>
      )}
    </div>
  );
}

/** 「吃什么」：和住宿一样，粘贴链接就加入这天；价格可以之后再填 */
export function DiningPicker({ trip, dayIndex, update }: { trip: Trip; dayIndex: number; update: Update }) {
  const day = trip.days[dayIndex];
  const date = addDays(trip.startDate, dayIndex);
  const [paste, setPaste] = useState('');
  const [added, setAdded] = useState('');
  const [showAll, setShowAll] = useState(false);
  const set = (mutate: (list: Rec[]) => void) =>
    update((t) => {
      const d = t.days.find((x) => x.id === day.id);
      if (d) mutate(d.dining);
    });

  const pastedMeal = usePasteDining(trip, update);
  const takeText = (text: string) => {
    // 整段餐厅页面 / 订位确认：认出名称、评分、价位、订位时间和确认号
    if (pastedMeal.handle(text, dayIndex)) {
      setAdded('');
      setPaste('');
      return;
    }
    const { url, title } = extractUrl(text);
    if (!url) {
      setPaste(text);
      return;
    }
    const name = nameFromUrl(url) || title.slice(0, 60) || `${platformOf(url)} 上的餐厅`;
    set((list) => {
      const hit = list.find((r) => r.url === url || r.bookingUrl === url);
      if (hit) return void (hit.picked = true);
      list.unshift({
        id: newId(),
        name,
        where: short(day.to),
        type: `来自 ${platformOf(url)}`,
        price: '',
        note: '',
        picked: true,
        ...(platformOf(url) === '官网' ? { url } : { bookingUrl: url }),
      });
    });
    setAdded(name);
    setPaste('');
  };
  const pasteFromClipboard = async () => {
    try {
      takeText(await navigator.clipboard.readText());
    } catch {
      /* 不能读剪贴板时直接在输入框里粘贴 */
    }
  };

  const chosen = day.dining.filter((r) => r.picked);
  const others = day.dining.filter((r) => !r.picked);
  const shown = showAll ? others : others.slice(0, 3);
  const links = diningSearchLinks(day.to, date, trip.adults + trip.children);
  const standard = foodStandard(trip);
  const pickedCost = chosen.reduce((n, r) => n + (r.cost || 0), 0);

  return (
    <div className="sp">
      <div className="sp-head">
        <h3>吃什么</h3>
        <span className="muted small">
          {short(day.to)} 一带 · 当天餐饮按每日标准 {money(standard)}，选的餐厅合计更高时按餐厅算
        </span>
      </div>

      <div className={`sp-now${chosen.length ? ' chosen' : ''}`}>
        {chosen.length ? (
          <>
            <span className="muted small">
              这天想去 {chosen.length} 家{pickedCost ? ` · 合计 ${money(pickedCost)}` : ''}
            </span>
            <ul className="plain sp-list">
              {chosen.map((r) => {
                const l = r.bookingUrl || r.url;
                return (
                  <li key={r.id}>
                    <div className="sp-cand">
                      <b>{r.name}</b>
                      <span className="muted small">
                        {r.rating ? `★ ${r.rating} · ` : ''}
                        {r.type && !/^来自 /.test(r.type) ? `${r.type} · ` : ''}
                        {l && (
                          <a className="link" href={l} target="_blank" rel="noreferrer">{platformOf(l)} ↗</a>
                        )}
                      </span>
                      {r.note && <span className="small sp-note">{r.note}</span>}
                    </div>
                    <div className="sp-cand-act">
                      <a
                        className="link small"
                        href={'https://www.opentable.com.au/s?' + new URLSearchParams({ term: `${r.name} ${short(day.to)}`, covers: String(trip.adults + trip.children), dateTime: `${date}T18:00` })}
                        target="_blank"
                        rel="noreferrer"
                        title="在 OpenTable 上按人数和日期订位"
                      >
                        订位 ↗
                      </a>
                      <label className="check small" title="订好位了">
                        <input
                          type="checkbox"
                          checked={!!r.booked}
                          onChange={(e) =>
                            set((list) => {
                              const x = list.find((y) => y.id === r.id);
                              if (x) x.booked = e.target.checked;
                            })
                          }
                        />
                        已订
                      </label>
                      <span className="sp-price">
                        $
                        <input
                          type="number"
                          inputMode="decimal"
                          aria-label={`${r.name} 这顿价格`}
                          placeholder="这顿多少"
                          value={r.cost || ''}
                          onChange={(e) =>
                            set((list) => {
                              const x = list.find((y) => y.id === r.id);
                              if (x) x.cost = Number(e.target.value) || undefined;
                            })
                          }
                        />
                      </span>
                      <button className="icon" aria-label={`不去 ${r.name}`} onClick={() => set((list) => void (list.find((y) => y.id === r.id)!.picked = false))}>
                        ×
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <b>还没选餐厅</b>
        )}
      </div>

      <div className="sp-step">
        <div className="find-head">① 去平台找（按评分）</div>
        <div className="sp-links">
          {links.map((l) => (
            <a key={l.key} className="sp-chip" href={l.href} target="_blank" rel="noreferrer" title={l.hint}>
              {l.key === 'google-family' ? '适合带孩子' : l.label} ↗
            </a>
          ))}
        </div>
      </div>

      <div className="sp-step">
        <div className="find-head">② 看中了或订好了？把链接或整段信息粘贴到这里</div>
        <div className="sp-paste">
          <textarea
            aria-label="粘贴餐厅链接或信息"
            rows={2}
            placeholder="粘贴链接，或 Google 地图 / Tripadvisor 餐厅页、OpenTable 订位确认的整段文字（自动认出名称、评分、价位和订位信息）"
            value={paste}
            onPaste={(e) => {
              e.preventDefault();
              takeText(e.clipboardData.getData('text'));
            }}
            onChange={(e) => setPaste(e.target.value)}
          />
          <div className="sp-paste-btns">
            <button onClick={pasteFromClipboard}>粘贴</button>
            {paste.trim() && (
              <button className="primary" onClick={() => takeText(paste)}>加入</button>
            )}
          </div>
        </div>
        {added && <p className="small sp-added">已加入「{added}」。知道价格的话填在上面，会计入花费；也可以把餐厅页面整段粘贴进来自动认出价位。</p>}
        {pastedMeal.busy && <p className="small muted">Claude 正在核对…</p>}
        {pastedMeal.message && <p className="small sp-added">{pastedMeal.message}</p>}
        {pastedMeal.warn && <p className="small warn-text">{pastedMeal.warn}</p>}
      </div>

      {others.length > 0 && (
        <div className="sp-step">
          <div className="find-head">推荐（{others.length}）</div>
          <ul className="plain sp-list">
            {shown.map((r) => (
              <li key={r.id}>
                <div className="sp-cand">
                  <b>{r.name}</b>
                  <span className="muted small">
                    {r.type}
                    {r.price ? ` · ${r.price}` : ''}
                    {r.note ? ` · ${r.note}` : ''}
                  </span>
                </div>
                <div className="sp-cand-act">
                  <button className="mini" onClick={() => set((list) => void (list.find((y) => y.id === r.id)!.picked = true))}>想去</button>
                </div>
              </li>
            ))}
          </ul>
          {others.length > 3 && (
            <button className="link small" onClick={() => setShowAll(!showAll)}>{showAll ? '收起' : `再看 ${others.length - 3} 家`}</button>
          )}
        </div>
      )}
    </div>
  );
}
