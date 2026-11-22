import type { Accommodation, ChecklistItem, Day, Expense, Mode, Place, Rec, Trip } from './types';
import { newId } from './id';
import { DEFAULT_PLACES } from './places';
import { GUIDES } from './guides';
import { genericChecklist } from './defaultTrip';

/*
 * 6 天方案：墨尔本 → 大洋路 → Port Fairy → 甘比尔山 → Robe → 库隆 → 阿德莱德 → 袋鼠岛 → 阿德莱德
 * - 每天车程按 OSRM 实际路线计算，均不超过 5 小时（第 6 天约 4.8 小时，需选下午有余量的渡轮）。
 * - 袋鼠岛信息（渡轮、门票、住宿、餐饮、生物安全规定）于 2026 年 11 月核实，价格多为估算，以官网为准。
 * - 不含第 6 天之后返回墨尔本的行程。
 */

/** 袋鼠岛线新增的地点（坐标来自维基百科 GeoData；Admirals Arch 为 Waymarking 换算，Remarkable Rocks 为近似值） */
export const KI_PLACES: Place[] = [
  {
    name: 'Griffiths Island VIC', label: 'Griffiths Island 格里菲斯岛', lat: -38.3933, lng: 142.2458, wiki: 'Griffiths Island',
    desc: 'Port Fairy 旁的小岛，环岛步道约 1 小时，可看灯塔；傍晚有短尾鹱归巢。',
  },
  { name: 'Normanville SA', label: 'Normanville', lat: -35.4466, lng: 138.3153, desc: '去渡轮码头路上的海边小镇，适合午餐。' },
  { name: 'Cape Jervis SA', label: 'Cape Jervis 渡轮码头', lat: -35.6, lng: 138.1, wiki: 'Cape Jervis', desc: '大陆这边的渡轮码头，开船前 30 分钟到达办理车辆登船。' },
  {
    name: 'Penneshaw SA', label: 'Penneshaw 袋鼠岛码头', lat: -35.7183, lng: 137.9403, wiki: 'Penneshaw, South Australia',
    desc: '袋鼠岛的渡轮码头小镇，有海滩和咖啡馆，上下船前后休息。',
  },
  {
    name: 'Seal Bay Conservation Park SA', label: '海狮湾 Seal Bay', lat: -35.9986, lng: 137.3625, wiki: 'Seal Bay Conservation Park',
    desc: '近距离看澳大利亚海狮，木栈道适合孩子，约 1–2 小时。2026 年 8 月起因疑似禽流感暂停沙滩参观（木栈道开放），出发前查官网。',
  },
  {
    name: 'Little Sahara SA', label: '小撒哈拉沙丘', lat: -35.954, lng: 137.246, wiki: 'Little Sahara (Kangaroo Island)',
    desc: '白色大沙丘，可租滑沙板滑沙，孩子最爱，约 1–2 小时。',
  },
  {
    name: 'Vivonne Bay SA', label: 'Vivonne Bay', lat: -35.9814, lng: 137.1806, wiki: 'Vivonne Bay (South Australia)',
    desc: '南岸长沙滩；杂货店的鳕鱼汉堡很有名。离码头区才适合游泳。',
  },
  {
    name: 'Remarkable Rocks SA', label: '神奇岩石 Remarkable Rocks', lat: -36.0462, lng: 136.713, wiki: 'Flinders Chase National Park',
    desc: '海边巨型风蚀花岗岩，孩子可在岩石间穿行拍照，注意大风湿滑。属弗林德斯蔡斯国家公园（家庭一日票约 $38）。',
  },
  {
    name: 'Admirals Arch SA', label: '海军上将拱门', lat: -36.0635, lng: 136.7049, wiki: 'Flinders Chase National Park',
    desc: '天然海蚀拱门，木栈道上能看到新西兰毛皮海豹群，约 30–45 分钟。',
  },
];

type R = Omit<Rec, 'id' | 'picked'>;
const allGuideRecs = Object.values(GUIDES).flatMap((g) => [...(g.stays ?? []), ...(g.dining ?? [])]);
/** 复用已核实的住宿 / 餐饮推荐（按城镇和类型挑选） */
function pick(where: string, kind: 'stay' | 'dining', meal?: string): R[] {
  const stays = new Set(Object.values(GUIDES).flatMap((g) => g.stays ?? []));
  const seen = new Set<string>();
  return allGuideRecs
    .filter((r) => r.where === where && (kind === 'stay' ? stays.has(r) : !stays.has(r)))
    .filter((r) => (seen.has(r.name) ? false : (seen.add(r.name), true)))
    .map((r) => (meal && kind === 'dining' ? { ...r, type: `${r.type.split(' · ')[0]} · ${meal}` } : r));
}
const rec = (r: Omit<R, 'price'> & { price: string }): R => r;

const KI_STAYS: R[] = [
  rec({
    name: 'Discovery Parks – Kangaroo Island', where: 'Western KI (Karatta)', type: '度假村两卧小屋（可住 4 人）',
    price: '约 $180–300/晚（估算）', cost: 240, note: '离弗林德斯蔡斯国家公园约 10 分钟，园内常见野生动物',
  }),
  rec({
    name: 'Hanson Bay Cabins', where: 'Hanson Bay', type: '海滩旁独立小木屋',
    price: '约 $330–400/晚', cost: 360, note: '最接近国家公园，离安全游泳海滩约 100 米；预订前确认能住 4 人的那间',
  }),
  rec({
    name: 'Vivonne Bay 度假屋（Airbnb 等）', where: 'Vivonne Bay', type: '整栋度假屋，可自己做饭',
    price: '价格未核实', note: '步行到河口和海滩；只作为可选类型，请自行比较',
  }),
];
const PORT_FAIRY_STAYS: R[] = [
  rec({ name: 'BIG4 Port Fairy Holiday Park', where: 'Port Fairy', type: '度假村小屋', price: '12 月旺季，价格以官网为准', note: '家庭型度假营地，有游乐设施' }),
  rec({ name: 'Gardens Caravan Park', where: 'Port Fairy', type: '营地小屋（可做饭）', price: '价格未核实', note: '靠近东海滩和格里菲斯岛步道，草坪开阔适合孩子' }),
  rec({ name: 'Port Fairy Holiday Park', where: 'Port Fairy', type: '度假村小屋（多档次）', price: '约 $100–130/晚起（淡季参考）', note: '价格相对实惠；与 BIG4 是不同营地' }),
];
const FLEURIEU_LUNCH: R[] = [
  rec({ name: 'Normanville Hotel', where: 'Normanville', type: '酒馆餐厅 · 午餐', price: '$$', note: '去码头路上，价格实惠，有啤酒花园' }),
  rec({ name: 'Caffe on Bungala / Yankalilla Bakery', where: 'Normanville', type: '咖啡馆 / 面包店 · 午餐', price: '$', note: '快速简餐（营业时间未核实）' }),
];
const KI_DINING: R[] = [
  rec({ name: 'Vivonne Bay General Store', where: 'Vivonne Bay', type: '杂货店咖啡馆 · 午餐/晚餐', price: '$$', note: '招牌鳕鱼汉堡（约 $20，偶尔断货）' }),
  rec({ name: 'Fire and Smoke KI', where: 'Penneshaw', type: '比萨 / 家常菜', price: '$$', note: '离码头步行约 200 米，上下船前后用餐方便' }),
  rec({ name: 'Dudley Wines Cellar Door', where: 'Penneshaw', type: '酒庄比萨拼盘 · 午餐', price: '$$', note: '离码头约 12 km 的悬崖海景酒庄，营业日说法不一，建议提前订' }),
];

function stay(name: string, cost: number, notes = ''): Accommodation {
  return { name, cost, booked: false, paid: false, notes };
}

function day(
  title: string, from: string, to: string, km: number, driveHours: number, stops: string[],
  accommodation: Accommodation | null, notes: string, stays: R[], dining: R[], legModes?: Record<string, Mode>,
): Day {
  const toRec = (r: R): Rec => ({ ...r, id: newId(), picked: false });
  return {
    id: newId(), title, from, to, km, driveHours, stops, accommodation, notes,
    stayOptions: stays.map(toRec), dining: dining.map(toRec), ...(legModes ? { legModes } : {}),
  };
}

function checklist(group: string, items: string[]): ChecklistItem[] {
  return items.map((text) => ({ id: newId(), text, group, done: false }));
}

export function createKangarooIslandTrip(): Trip {
  const days: Day[] = [
    day('出发 · 大洋路东段', 'Melbourne VIC', 'Apollo Bay VIC', 195, 3.1,
      ['Torquay VIC', 'Bells Beach VIC', 'Split Point Lighthouse, Aireys Inlet VIC', 'Lorne VIC'],
      stay('Apollo Bay 住宿', 290), '早出发避开出城车流；Lorne 午餐。',
      pick('Apollo Bay', 'stay'), [...pick('Lorne', 'dining', '午餐'), ...pick('Apollo Bay', 'dining', '晚餐')]),
    day('十二门徒岩 → Port Fairy', 'Apollo Bay VIC', 'Port Fairy VIC', 194, 3.1,
      ['Twelve Apostles VIC', 'Loch Ard Gorge VIC', 'London Bridge, Port Campbell VIC', 'Tower Hill Wildlife Reserve VIC'],
      stay('Port Fairy 住宿', 220), 'Port Campbell 午餐；傍晚可走 Griffiths Island 环岛步道。',
      PORT_FAIRY_STAYS, [...pick('Port Campbell', 'dining', '午餐'), ...pick('Port Fairy', 'dining', '晚餐')]),
    day('甘比尔山 · 蓝湖 → Robe', 'Port Fairy VIC', 'Robe SA', 298, 3.8,
      ['Mount Gambier SA', 'Blue Lake, Mount Gambier SA', 'Umpherston Sinkhole SA'],
      stay('Robe 住宿', 260), '进入南澳前处理掉新鲜水果蔬菜（果蝇检疫）；南澳时间比维州慢 30 分钟。甘比尔山午餐，12 月蓝湖最蓝。',
      pick('Robe', 'stay'), [...pick('Mount Gambier', 'dining', '午餐'), ...pick('Robe', 'dining', '晚餐')]),
    day('库隆 → 汉多夫 → 阿德莱德', 'Robe SA', 'Adelaide SA', 338, 4.3,
      ['Kingston SE SA', 'Coorong National Park SA', 'Hahndorf SA'],
      stay('Adelaide 住宿（第 1 晚）', 380), '最长的路段之一，Kingston SE（大龙虾）或 Meningie 休息；Hahndorf 德国村晚餐后进城。',
      pick('Adelaide', 'stay'), [...pick('Meningie', 'dining', '午餐'), ...pick('Hahndorf', 'dining', '晚餐')]),
    day('渡轮上袋鼠岛 · 海狮湾 · 滑沙', 'Adelaide SA', 'Vivonne Bay SA', 230, 3.3,
      ['Normanville SA', 'Cape Jervis SA', 'Penneshaw SA', 'Seal Bay Conservation Park SA', 'Little Sahara SA'],
      stay('袋鼠岛西南部住宿', 260), '订上午的渡轮（航程约 45 分钟，开船前 30 分钟到 Cape Jervis 办理车辆登船；上船前洗车）。岛上避免黄昏和夜间开车（野生动物多）。',
      KI_STAYS, [...FLEURIEU_LUNCH, ...KI_DINING.filter((r) => r.where === 'Vivonne Bay')],
      { 'Penneshaw SA': 'ferry' }),
    day('神奇岩石 · 拱门 → 回阿德莱德', 'Vivonne Bay SA', 'Adelaide SA', 320, 4.8,
      ['Remarkable Rocks SA', 'Admirals Arch SA', 'Penneshaw SA', 'Cape Jervis SA'],
      stay('Adelaide 住宿（第 2 晚）', 380), '车程最紧的一天：早上先去弗林德斯蔡斯国家公园，Penneshaw 赶下午的渡轮（留足余量），回大陆后直接进城。大风天岩石和拱门可能关闭。',
      pick('Adelaide', 'stay'), [...KI_DINING.filter((r) => r.where === 'Penneshaw'), ...pick('Adelaide', 'dining', '晚餐')],
      { 'Cape Jervis SA': 'ferry' }),
  ];

  const expenses: Expense[] = [
    { id: newId(), title: 'SeaLink 渡轮往返（1 车 + 2 大 2 小，最低约 $496，12 月旺季会更贵，以报价为准）', category: 'transport', amount: 600, dayId: days[4].id, paid: false },
    { id: newId(), title: '海狮湾家庭票（约 $110）', category: 'activity', amount: 110, dayId: days[4].id, paid: false },
    { id: newId(), title: '小撒哈拉滑沙板租用（约 $37/块 × 2）', category: 'activity', amount: 74, dayId: days[4].id, paid: false },
    { id: newId(), title: '弗林德斯蔡斯国家公园家庭一日票（约 $38）', category: 'activity', amount: 38, dayId: days[5].id, paid: false },
    { id: newId(), title: '零食 / 饮用水 / 路上补给', category: 'food', amount: 100, dayId: null, paid: false },
    { id: newId(), title: '阿德莱德停车', category: 'transport', amount: 50, dayId: null, paid: false },
  ];

  const known = new Set(DEFAULT_PLACES.map((p) => p.name));
  return {
    version: 2,
    id: newId(),
    name: '墨尔本 → 甘比尔山 → 阿德莱德 → 袋鼠岛（6 天）',
    startDate: '2026-12-11',
    adults: 2,
    children: 2,
    budget: 5000,
    vehicle: { name: '家用 SUV', litresPer100km: 9, fuelPrice: 2.05 },
    food: { adultPerDay: 60, childPerDay: 35 },
    days,
    places: [...structuredClone(DEFAULT_PLACES), ...KI_PLACES.filter((p) => !known.has(p.name))],
    expenses,
    checklist: [
      ...genericChecklist(),
      ...checklist('袋鼠岛', [
        '尽早预订 SeaLink 渡轮（12 月旺季会满），先订船再订岛上住宿；订票需填车辆品牌、型号、年份',
        '上船前洗车（防瓦螨），开船前 30 分钟到 Cape Jervis',
        '不要带蜂蜜、蜂蜡等蜂产品和未清洗的土豆上岛（袋鼠岛生物安全规定，码头会检查）',
        '出发前查海狮湾沙滩是否恢复开放（2026 年 8 月起暂停）',
        '确定第 6 天之后怎么回墨尔本',
      ]),
      ...checklist('路上注意', [
        '进入南澳前处理掉新鲜水果蔬菜（果蝇检疫）',
        '南澳比维州慢 30 分钟，注意渡轮和入住时间',
      ]),
    ],
  };
}
