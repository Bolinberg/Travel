/*
 * 行程粘贴识别：游记、旅行社行程单、聊天里的计划、别的 AI 写的行程……
 * 认出每一天的出发地 → 目的地、途经点、住哪，转成「调整方案」（和「改行程」一样先对比再应用）。
 */
import type { Place, Trip } from './types';
import type { AiReplan, AiReplanDay } from './ai';
import { DEFAULT_PLACES } from './places';
import { haversineKm } from './route';

const CN_NUM: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
function cnToInt(s: string): number {
  if (/^\d+$/.test(s)) return +s;
  if (s === '十') return 10;
  if (s.startsWith('十')) return 10 + (CN_NUM[s[1]] ?? 0);
  if (s.endsWith('十')) return (CN_NUM[s[0]] ?? 0) * 10;
  if (s.includes('十')) return (CN_NUM[s[0]] ?? 0) * 10 + (CN_NUM[s[2]] ?? 0);
  return CN_NUM[s] ?? 0;
}

/** 行首的「第 N 天 / Day N / D1」 */
const DAY_HEAD = /^\s*(?:#{1,4}\s*)?(?:\*\*)?\s*(?:(?:day|d)\s*(\d{1,2})|第\s*([一二三四五六七八九十\d]{1,3})\s*天)\s*(?:\*\*)?\s*[:：.、\-–—)）]?\s*/i;

export const looksLikeItinerary = (text: string) => text.split('\n').filter((l) => DAY_HEAD.test(l)).length >= 2;

interface Alias {
  re: RegExp;
  name: string;
  len: number;
}

/** 地名别名：行程里的地点 + 内置地点（中英文名、去掉州名），再加几个常见叫法 */
function aliases(trip: Trip): Alias[] {
  const home = trip.days[0]?.from ?? 'Melbourne VIC';
  const places: Place[] = [...trip.places, ...DEFAULT_PLACES.filter((p) => !trip.places.some((x) => x.name === p.name))];
  const has = (n: string) => places.some((p) => p.name === n);
  const list: [string, string][] = [];
  for (const p of places) {
    const bare = p.name.replace(/,?\s+(VIC|NSW|QLD|SA|WA|TAS|NT|ACT)$/i, '');
    list.push([bare, p.name]);
    // 「Coorong National Park」也认「Coorong」
    const core = bare.replace(/,.*$/, '').replace(/\s+(National Park|Conservation Park|Wildlife (?:Park|Reserve)|Botanic Garden|Lookout|Sinkhole|Lighthouse)$/i, '');
    if (core !== bare && core.length >= 4) list.push([core, p.name]);
    for (const part of p.label.split(/[\s（）()·]+/)) if (part.length >= 2 && !/^(the|of)$/i.test(part)) list.push([part, p.name]);
  }
  const extra: [string, string][] = [
    ['墨尔本', home],
    ['melbourne', home],
    ['回家', home],
    ['返回', home],
    ['home', home],
    ['蓝湖', has('Mount Gambier SA') ? 'Mount Gambier SA' : 'Blue Lake, Mount Gambier SA'],
    ['甘比尔', 'Mount Gambier SA'],
    ['格兰扁', 'Halls Gap VIC'],
    ['grampians', 'Halls Gap VIC'],
    ['袋鼠岛', has('Vivonne Bay SA') ? 'Vivonne Bay SA' : 'Kingscote, Kangaroo Island SA'],
    ['kangaroo island', has('Vivonne Bay SA') ? 'Vivonne Bay SA' : 'Kingscote, Kangaroo Island SA'],
    ['十二门徒', 'Twelve Apostles VIC'],
    ['12 apostles', 'Twelve Apostles VIC'],
    ['阿波罗湾', 'Apollo Bay VIC'],
    ['坎贝尔港', 'Port Campbell VIC'],
    ['汉多夫', 'Hahndorf SA'],
    ['巴拉瑞特', 'Ballarat VIC'],
    ['疏芬山', 'Ballarat VIC'],
  ];
  return [...extra, ...list]
    .filter(([a]) => a.length >= 2)
    .map(([a, name]) => ({
      re: new RegExp(/^[\x00-\x7f]+$/.test(a) ? `\\b${a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b` : a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
      name,
      len: a.length,
    }))
    .sort((x, y) => y.len - x.len);
}

/** 一段文字里提到的地点（按出现位置排序，不重复） */
function placesIn(text: string, al: Alias[]): string[] {
  const hits: { name: string; at: number }[] = [];
  let rest = text;
  for (const a of al) {
    const m = a.re.exec(rest);
    if (!m) continue;
    hits.push({ name: a.name, at: m.index });
    // 把认到的部分盖掉，免得短别名再认一次（如 Mount Gambier 和 Gambier）
    rest = rest.slice(0, m.index) + ' '.repeat(m[0].length) + rest.slice(m.index + m[0].length);
  }
  return [...new Set(hits.sort((a, b) => a.at - b.at).map((h) => h.name))];
}

const resolve = (seg: string, al: Alias[]): string => placesIn(seg, al)[0] ?? seg.trim().replace(/[*_#]/g, '');

const ARROW = /\s*(?:→|->|=>|⟶|➡|—>|-{1,2}>|\s[-–—~]\s|到达?|至|\bto\b)\s*/i;

/** 没有现成数据时按直线距离估：公路约为直线的 1.25 倍、平均 80 km/h；有地点不认识就先给 0 */
function estimate(trip: Trip, names: string[]): { km: number; hours: number } {
  const all = [...trip.places, ...DEFAULT_PLACES];
  const pts = names.map((n) => all.find((p) => p.name === n));
  if (pts.some((p) => !p) || pts.length < 2) return { km: 0, hours: 0 };
  let km = 0;
  for (let i = 1; i < pts.length; i++) km += haversineKm(pts[i - 1]!, pts[i]!);
  km = Math.round(km * 1.25);
  return { km, hours: km < 3 ? 0 : Math.round((km / 80) * 10) / 10 };
}

export function parseItineraryText(text: string, trip: Trip): AiReplan {
  const al = aliases(trip);
  const home = trip.days[0]?.from ?? 'Melbourne VIC';
  const lines = text.replace(/\r/g, '').split('\n');
  // 按「第 N 天」切块
  const blocks: { head: string; body: string[] }[] = [];
  for (const line of lines) {
    const m = DAY_HEAD.exec(line);
    if (m && cnToInt(m[1] ?? m[2]) > 0) blocks.push({ head: line.replace(DAY_HEAD, '').trim(), body: [] });
    else if (blocks.length && line.trim()) blocks[blocks.length - 1].body.push(line.trim());
  }

  let prevTo = home;
  const days: AiReplanDay[] = blocks.map((b, i) => {
    const last = i === blocks.length - 1;
    const all = [b.head, ...b.body].join('\n');
    // 住哪
    const stayM = all.match(/(?:住宿?|宿|入住|过夜|stay(?:ing)?\s+(?:in|at|overnight in)?|overnight(?:\s+in|\s+at)?|night(?:s)?\s+in|accommodation[:：]?)\s*[:：]?\s*([^\n,，。;；(（]+)/i);
    const stay = stayM ? resolve(stayM[1], al) : '';
    // 路线：标题行里的「A → B → C」优先，其次正文第一处
    const routeLine = [b.head, ...b.body].find((l) => ARROW.test(l) && placesIn(l, al).length + (l.split(ARROW).length - 1) >= 2) ?? '';
    let from = prevTo;
    let to = '';
    let stops: string[] = [];
    if (routeLine) {
      const parts = routeLine
        .replace(/^[^:：]*[:：]\s*(?=.*(?:→|->|到|\bto\b))/i, '')
        .split(ARROW)
        .map((p) => p.replace(/[（(].*?[)）]/g, '').replace(/(?:住|宿|stay|overnight).*$/i, '').trim())
        .filter(Boolean);
      const resolved = parts.map((p) => resolve(p, al)).filter(Boolean);
      if (resolved.length >= 2) {
        // 第一段是出发地（和前一天的目的地一致时直接用前一天的写法）
        from = resolved[0] === prevTo || placesIn(parts[0], al)[0] === prevTo ? prevTo : resolved[0];
        to = resolved[resolved.length - 1];
        stops = resolved.slice(1, -1);
      }
    }
    if (!to) to = stay || (/回家|返回|home|back to melbourne/i.test(all) ? home : '');
    if (!to) {
      // 没写路线：这一天提到的最后一个地方当作目的地，其余当途经
      const ps = placesIn(all, al).filter((p) => p !== from);
      to = ps[ps.length - 1] ?? from;
    }
    if (stay && stay !== to) to = stay;
    // 途经：「途经 / 经过 / via」后面的，以及正文里提到的其他地点
    const viaM = all.match(/(?:途经|经过|经由|via|stops?|visit(?:ing)?)\s*[:：]?\s*([^\n。]+)/i);
    const mentioned = placesIn(viaM ? viaM[1] : all, al);
    for (const p of mentioned) if (p !== from && p !== to && !stops.includes(p)) stops.push(p);
    const goingHome = last || /回家|返回|home|back to melbourne/i.test(all);
    const overnight = !!stay || (!goingHome && to !== home);
    if (last && to !== home && !stay) {
      stops = [...stops, to].filter((p) => p !== home);
      to = home;
    }
    // 里程车程：当前行程或其他方案里有同样起终点的就沿用；都没有就按直线距离先估（应用后按真实道路重算）
    const same = trip.days.findIndex((d) => d.from === from && d.to === to);
    const orig = same >= 0 ? trip.days[same] : undefined;
    const other = orig ?? (trip.versions ?? []).flatMap((v) => v.snapshot.days).find((d) => d.from === from && d.to === to && d.km > 0);
    const est = other ? { km: other.km, hours: other.driveHours } : estimate(trip, [from, ...stops, to]);
    const title = (
      b.head
        .replace(/[*_#]/g, '')
        .replace(/\s*[|｜]\s*/g, ' ')
        .replace(/[，,;；]?\s*(?:住宿?|宿|入住|过夜|stay|overnight)[^，,;；]*$/i, '')
        .trim() || `${from} → ${to}`
    ).slice(0, 40);
    prevTo = to;
    return {
      title,
      from,
      to,
      stops,
      km: est.km,
      driveHours: est.hours,
      overnight,
      sources: same >= 0 ? [same + 1] : [],
      kind: orig && orig.from === from && orig.to === to && !!orig.accommodation === overnight ? ('same' as const) : same >= 0 ? ('edited' as const) : ('added' as const),
      reason: '',
      notes: b.body.join(' ').slice(0, 400),
    };
  });

  const nights = days.filter((d) => d.overnight).length;
  return {
    title: `粘贴的 ${days.length} 天行程`,
    summary: `按粘贴的内容排成 ${days.length} 天 ${nights} 晚。没有写里程和车程的日子，应用后会按真实道路自动计算；认不出的地名会自动查位置。`,
    days,
    places: [],
  };
}
