import type { Accommodation, ChecklistItem, Day, Expense, Rec, Trip } from './types';
import { newId } from './id';
import { DEFAULT_PLACES } from './places';
import { GUIDES } from './guides';

/*
 * 默认行程：墨尔本 → 大洋路 → 甘比尔山 → 罗布 → 阿德莱德 → 格兰扁 → 墨尔本（9 天 8 晚）。
 * 里程/车程/价格均为估算值，出发前请按实际预订和导航结果修改。
 */

function stay(name: string, cost: number, notes = ''): Accommodation {
  return { name, cost, booked: false, paid: false, notes };
}

function day(
  title: string,
  from: string,
  to: string,
  km: number,
  driveHours: number,
  stops: string[],
  accommodation: Accommodation | null,
  notes = '',
): Day {
  return { id: newId(), title, from, to, km, driveHours, stops, accommodation, stayOptions: [], dining: [], notes };
}

function checklist(group: string, items: string[]): ChecklistItem[] {
  return items.map((text) => ({ id: newId(), text, group, done: false }));
}

export function createDefaultTrip(): Trip {
  const days: Day[] = [
    day(
      '出发 · 大洋路东段',
      'Melbourne VIC',
      'Apollo Bay VIC',
      195,
      3.5,
      ['Torquay VIC', 'Bells Beach VIC', 'Split Point Lighthouse, Aireys Inlet VIC', 'Lorne VIC'],
      stay('Apollo Bay 住宿', 290),
      '早出发避开周末出城车流；Lorne 午餐。',
    ),
    day(
      '十二门徒岩',
      'Apollo Bay VIC',
      'Warrnambool VIC',
      170,
      2.5,
      ['Great Otway National Park VIC', 'Twelve Apostles VIC', 'Loch Ard Gorge VIC', 'London Bridge, Port Campbell VIC'],
      stay('Warrnambool 住宿', 220),
      '十二门徒岩日落最美；Otway 路段弯多，注意晕车。',
    ),
    day(
      '进入南澳 · 蓝湖',
      'Warrnambool VIC',
      'Mount Gambier SA',
      200,
      2.5,
      ['Port Fairy VIC', 'Tower Hill Wildlife Reserve VIC'],
      stay('Mount Gambier 住宿', 180),
      '入南澳前吃完/丢弃新鲜水果蔬菜（检疫）。南澳时间比维州慢 30 分钟。',
    ),
    day(
      '海边小镇 Robe',
      'Mount Gambier SA',
      'Robe SA',
      130,
      1.5,
      ['Blue Lake, Mount Gambier SA', 'Umpherston Sinkhole SA', 'Beachport SA'],
      stay('Robe 住宿', 260),
      '轻松的一天，适合孩子海边玩。',
    ),
    day(
      '库隆 → 阿德莱德',
      'Robe SA',
      'Adelaide SA',
      345,
      4,
      ['Kingston SE SA', 'Coorong National Park SA', 'Hahndorf SA'],
      stay('Adelaide 住宿（第 1 晚）', 380),
      '最长的一天，中途在 Kingston SE / Meningie 休息；Hahndorf 德国小镇晚餐。',
    ),
    day(
      '阿德莱德市区',
      'Adelaide SA',
      'Adelaide SA',
      30,
      0.5,
      ['Adelaide Central Market SA', 'Adelaide Botanic Garden SA', 'Glenelg SA'],
      stay('Adelaide 住宿（第 2 晚）', 380),
      'Glenelg 海滩看日落，可坐电车。',
    ),
    day(
      '巴罗萨 / 动物园一日游',
      'Adelaide SA',
      'Adelaide SA',
      150,
      2,
      ['Cleland Wildlife Park SA', 'Barossa Valley SA'],
      stay('Adelaide 住宿（第 3 晚）', 380),
      '若遇圣诞节当天（12/25）多数商店和景点关门，请调整。',
    ),
    day(
      '返程 · 格兰扁',
      'Adelaide SA',
      'Halls Gap VIC',
      500,
      5.5,
      ['Tailem Bend SA', 'Bordertown SA', 'Horsham VIC'],
      stay('Halls Gap 住宿', 250),
      '返程长途，每 2 小时休息一次。Halls Gap 傍晚常见袋鼠。',
    ),
    day(
      '回家',
      'Halls Gap VIC',
      'Melbourne VIC',
      255,
      3,
      ['The Pinnacle Lookout, Grampians VIC', 'Ballarat VIC'],
      null,
      '早上可走 Pinnacle 步道，Ballarat 午餐。',
    ),
  ];

  // 按天挂上住宿 / 餐饮推荐
  days.forEach((d, i) => {
    const g = GUIDES[i];
    if (!g) return;
    d.stayOptions = (g.stays ?? []).map(toRec);
    d.dining = (g.dining ?? []).map(toRec);
  });

  const expenses: Expense[] = [
    { id: newId(), title: 'Cleland 野生动物园门票', category: 'activity', amount: 110, dayId: days[6].id, paid: false },
    { id: newId(), title: 'Otway Fly 树顶步道（可选）', category: 'activity', amount: 120, dayId: days[1].id, paid: false },
    { id: newId(), title: '阿德莱德市区停车', category: 'transport', amount: 80, dayId: days[5].id, paid: false },
    { id: newId(), title: '零食 / 饮用水 / 路上补给', category: 'food', amount: 120, dayId: null, paid: false },
    { id: newId(), title: '纪念品', category: 'shopping', amount: 150, dayId: null, paid: false },
    { id: newId(), title: '出发前汽车保养检查', category: 'other', amount: 200, dayId: null, paid: false },
  ];

  return {
    version: 2,
    id: newId(),
    name: '墨尔本 → 阿德莱德 家庭自驾',
    startDate: '2026-12-19',
    adults: 2,
    children: 2,
    budget: 5000,
    vehicle: { name: '家用 SUV', litresPer100km: 9, fuelPrice: 2.05 },
    food: { adultPerDay: 60, childPerDay: 35 },
    days,
    places: structuredClone(DEFAULT_PLACES),
    expenses,
    checklist: [
      ...genericChecklist(),
      ...checklist('路上注意', [
        '进入南澳前处理掉新鲜水果蔬菜（检疫规定，违者罚款）',
        '南澳比维州慢 30 分钟，注意入住/预约时间',
        '偏远路段加满油再走（库隆、Western Hwy）',
      ]),
      ...checklist('出发前', [
        '安装 VicEmergency 和 Alerts SA（夏季山火预警）',
      ]),
    ],
  };
}

/** 任何自驾行程通用的准备清单 */
export function genericChecklist(): ChecklistItem[] {
  return [
      ...checklist('出发前', [
        '预订全部住宿（节假日旺季尽早）',
        '汽车保养：轮胎、机油、雨刷、冷却液',
        '确认道路救援会员（如 RACV / RAA / NRMA）有效',
        '驾照、车辆注册、保险资料',
        '下载离线地图（偏远路段可能无信号）',
      ]),
      ...checklist('行李', [
        '儿童安全座椅',
        '防晒霜、帽子、太阳镜',
        '驱蚊液、急救包、常用药',
        '车载充电器 / 充电宝',
        '饮用水、零食、垃圾袋',
        '泳衣、沙滩巾',
        '保暖外套（海边早晚凉）',
      ]),
      ...checklist('路上注意', [
        '每开 2 小时休息一次',
        '黄昏和夜间注意动物，尽量不在天黑后开长途',
      ]),
  ];
}

function toRec(r: Omit<Rec, 'id' | 'picked'>): Rec {
  return { ...r, id: newId(), picked: false };
}

/** 旧版本（v1）数据升级：补上地点库与推荐信息 */
export function migrateTrip(t: any): Trip | null {
  if (!t || !Array.isArray(t.days) || !Array.isArray(t.expenses) || !Array.isArray(t.checklist)) return null;
  if (t.version === 2) {
    if (!t.id) t.id = newId();
    if (!Array.isArray(t.places)) t.places = [];
    return t as Trip;
  }
  if (t.version !== 1) return null;
  const fresh = createDefaultTrip();
  t.version = 2;
  t.id = newId();
  t.places = fresh.places;
  t.days.forEach((d: Day, i: number) => {
    const f = fresh.days[i];
    const same = f && f.to === d.to;
    d.stayOptions = same ? f.stayOptions : [];
    d.dining = same ? f.dining : [];
  });
  return t as Trip;
}

export interface NewTripOptions {
  name: string;
  origin: string;
  destination: string;
  startDate: string;
  days: number;
  adults: number;
  children: number;
  budget: number;
}

/** 空白行程：第一天从出发地出发，最后一天返回出发地，中间停留在目的地 */
export function createBlankTrip(o: NewTripOptions): Trip {
  const n = Math.max(1, Math.min(60, Math.round(o.days)));
  const dest = o.destination.trim() || o.origin.trim();
  const origin = o.origin.trim() || dest;
  const days: Day[] = Array.from({ length: n }, (_, i) => {
    const from = i === 0 ? origin : dest;
    const to = i === n - 1 && n > 1 ? origin : dest;
    const title = i === 0 ? '出发' : i === n - 1 ? '返程' : `第 ${i + 1} 天`;
    const last = i === n - 1 && n > 1;
    return day(title, from, to, 0, 0, [], last ? null : stay(`${to} 住宿`, 0));
  });
  return {
    version: 2,
    id: newId(),
    name: o.name.trim() || `${origin} → ${dest}`,
    startDate: o.startDate,
    adults: o.adults,
    children: o.children,
    budget: o.budget,
    vehicle: { name: '自驾车', litresPer100km: 9, fuelPrice: 2 },
    food: { adultPerDay: 60, childPerDay: 35 },
    days,
    places: [],
    expenses: [],
    checklist: genericChecklist(),
  };
}

/** 复制行程结构：新 id，清空预订/付款/勾选状态 */
export function duplicateTrip(src: Trip, name: string, startDate: string): Trip {
  const t = structuredClone(src);
  t.id = newId();
  t.versions = undefined; // 副本不带历史
  t.name = name;
  t.startDate = startDate;
  const dayIds = new Map<string, string>();
  for (const d of t.days) {
    const id = newId();
    dayIds.set(d.id, id);
    d.id = id;
    if (d.accommodation) Object.assign(d.accommodation, { booked: false, paid: false, notes: '' });
    for (const r of [...d.stayOptions, ...d.dining]) Object.assign(r, { id: newId(), picked: false });
  }
  for (const e of t.expenses) Object.assign(e, { id: newId(), paid: false, dayId: e.dayId ? dayIds.get(e.dayId) ?? null : null });
  for (const c of t.checklist) Object.assign(c, { id: newId(), done: false });
  return t;
}

import { createGrandTrip, createKangarooIslandTrip, createLoopTrip, createNineDayTrip, createSevenDayTrip } from './templateKI';

export const TEMPLATES = [
  {
    key: 'mel-nine-9',
    label: '9 天往返：大洋路 → 甘比尔山 → 阿德莱德（熊猫）→ 袋鼠岛 2 晚 → 格兰扁 → 墨尔本',
    create: createNineDayTrip,
  },
  {
    key: 'mel-grand-8',
    label: '8 天往返：大洋路 → 甘比尔山 → 阿德莱德（熊猫、博物馆）→ 袋鼠岛 → 墨尔本（每天车程 5 小时内）',
    create: createGrandTrip,
  },
  {
    key: 'mel-blue-7',
    label: '7 天往返：墨尔本 → 蓝湖（住）→ 阿德莱德（熊猫、博物馆）→ 袋鼠岛 → 墨尔本（前两天各约 5.5 小时）',
    create: createSevenDayTrip,
  },
  {
    key: 'mel-loop-6',
    label: '6 天往返：墨尔本 → 十二门徒岩 → 甘比尔山 → 阿德莱德（2 晚）→ 墨尔本（每天车程 5 小时内）',
    create: createLoopTrip,
  },
  {
    key: 'mel-ki-6',
    label: '6 天单程：墨尔本 → 甘比尔山 → 阿德莱德 → 袋鼠岛（不含回墨尔本）',
    create: createKangarooIslandTrip,
  },
  { key: 'mel-adl', label: '示例：墨尔本 → 大洋路 → 阿德莱德（9 天，含景点/住宿/餐饮推荐）', create: createDefaultTrip },
];
