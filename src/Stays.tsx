import type { Rec, Trip } from './types';
import { addDays, formatDate, money } from './calc';
import { links } from './geo';
import { STAYS_CHECKED } from './stays';

type Update = (mutate: (draft: Trip) => void) => void;

const short = (place: string) =>
  place.replace(/,?\s+(VIC|NSW|QLD|SA|WA|TAS|NT|ACT)$/i, '').replace(/,\s*(Australia|New Zealand)$/i, '');

/** 连续住同一个地方的几晚合成一组 */
function stayGroups(trip: Trip) {
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

/** 住宿总览：当前方案每个过夜地的候选住宿，可直接选定、标记已订 */
export default function Stays({ trip, update }: { trip: Trip; update?: Update }) {
  const groups = stayGroups(trip);
  const nights = groups.reduce((n, g) => n + g.days.length, 0);
  const accs = trip.days.filter((d) => d.accommodation).map((d) => d.accommodation!);
  const chosen = groups.filter((g) => trip.days[g.days[0]].stayOptions.some((r) => r.picked)).length;
  const booked = accs.filter((a) => a.booked).length;
  const total = accs.reduce((s, a) => s + (a.cost || 0), 0);

  const pick = (g: { days: number[] }, r: Rec) =>
    update?.((t) => {
      const on = !t.days[g.days[0]].stayOptions.find((x) => x.name === r.name)?.picked;
      for (const i of g.days) {
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
    });
  const setBooked = (g: { days: number[] }, v: boolean) =>
    update?.((t) => {
      for (const i of g.days) if (t.days[i].accommodation) t.days[i].accommodation!.booked = v;
    });

  return (
    <section className="stays">
      <div className="stays-head">
        <h2>住宿</h2>
        <div className="stays-sum">
          <span><b>{nights}</b> 晚 · {groups.length} 个地方</span>
          <span>已选 <b>{chosen}</b>/{groups.length}</span>
          <span className={booked < nights ? 'warn-text' : ''}>已订 <b>{booked}</b>/{nights} 晚</span>
          <span>预计 <b>{money(total)}</b></span>
        </div>
      </div>
      <p className="muted small stays-note">
        每个地方 3 家，都是可住一家四口、在官网或 Booking.com / Expedia 等大平台能订的在营住宿；标「推荐」的是首选。
        评分来自平台公开页面{STAYS_CHECKED ? `（${STAYS_CHECKED} 核对）` : ''}，价格是 12 月旺季估算，订之前请点链接确认实时价格、能住 4 人的房型和最少入住晚数。
        袋鼠岛房源少，建议最先订。
      </p>

      {groups.map((g) => {
        const first = trip.days[g.days[0]];
        const checkin = addDays(trip.startDate, g.days[0]);
        const checkout = addDays(trip.startDate, g.days[g.days.length - 1] + 1);
        const acc = first.accommodation!;
        const picked = first.stayOptions.find((r) => r.picked);
        const isBooked = g.days.every((i) => trip.days[i].accommodation?.booked);
        const dayLabel = g.days.length > 1 ? `第 ${g.days[0] + 1}–${g.days[g.days.length - 1] + 1} 天` : `第 ${g.days[0] + 1} 天`;
        return (
          <article key={g.days[0]} className="stay-group">
            <header className="stay-group-head">
              <div>
                <div className="muted small">
                  {dayLabel} · {formatDate(checkin)} 入住 · {g.days.length} 晚
                </div>
                <h3>{short(g.place)}</h3>
              </div>
              <span className={isBooked ? 'flag ok' : picked ? 'flag' : 'flag warn'}>
                {isBooked ? '已订' : picked ? '已选，未订' : '未选'}
              </span>
            </header>
            <div className="stay-current small">
              <span className="muted">当前：</span>
              <b>{acc.name || '未填写'}</b>
              <span className="muted"> · {money(acc.cost)}/晚</span>
              {update && (
                <label className="stay-booked">
                  <input type="checkbox" checked={isBooked} onChange={(e) => setBooked(g, e.target.checked)} /> 已订好
                </label>
              )}
            </div>
            <ul className="plain stay-options">
              {first.stayOptions.map((r) => (
                <li key={r.id} className={r.picked ? 'stay-opt picked' : 'stay-opt'}>
                  <div className="stay-opt-top">
                    <b className="stay-opt-name">{r.name}</b>
                    {r.top && <span className="tag top">推荐</span>}
                  </div>
                  <div className="muted small">
                    {r.type}
                    {r.where && !g.place.startsWith(r.where) ? ` · ${r.where}` : ''}
                  </div>
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
                    {update && (
                      <button className={r.picked ? 'mini on' : 'mini'} onClick={() => pick(g, r)}>
                        {r.picked ? '已选 ✓' : '选这家'}
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <a className="link small" href={links.booking(first.to, checkin, checkout, trip.adults)} target="_blank" rel="noreferrer">
              在 Booking.com 搜 {short(g.place)} {formatDate(checkin)}–{formatDate(checkout)} 的其他住宿 ↗
            </a>
          </article>
        );
      })}
      {!groups.length && <p className="muted">这个方案没有需要住宿的晚上。</p>}
    </section>
  );
}
