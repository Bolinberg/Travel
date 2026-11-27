import type { Accommodation, ChecklistItem, Day, Expense, Mode, Place, Rec, Trip } from './types';
import { newId } from './id';
import { DEFAULT_PLACES } from './places';
import { GUIDES } from './guides';
import { genericChecklist } from './defaultTrip';
import { addVersion, snapshot, switchPlan } from './versions';
import { applyVerifiedStays, applyVerifiedStaysToDay } from './stays';

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

/* ------------------------------------------------------------------
 * 6 天往返：墨尔本 → 十二门徒岩 → Warrnambool → 甘比尔山 → Robe → 库隆 → 阿德莱德（2 晚）→ Dimboola → 墨尔本
 * 每天车程按 OSRM 实际路线计算：4.6 / 4.5 / 4.3 / 1.6 / 4.9 / 4.5 小时。袋鼠岛放不进 6 天往返。
 * ------------------------------------------------------------------ */

export const LOOP_PLACES: Place[] = [
  { name: 'Colac VIC', label: 'Colac', lat: -38.3393, lng: 143.5847, wiki: 'Colac, Victoria', desc: '内陆去十二门徒岩的捷径，路过可休息加油。' },
  {
    name: 'Dimboola VIC', label: 'Dimboola', lat: -36.4535, lng: 142.0271, wiki: 'Dimboola',
    desc: 'Wimmera 河边的小镇，回程过夜点，正好把阿德莱德到墨尔本的长途分成两半；附近有 Little Desert 国家公园。',
  },
];

export const LOOP_NAME = '墨尔本 → 阿德莱德 → 墨尔本 6 天往返';

export function createLoopTrip(): Trip {
  const days: Day[] = [
    day('十二门徒岩 → Warrnambool', 'Melbourne VIC', 'Warrnambool VIC', 306, 4.6,
      ['Colac VIC', 'Twelve Apostles VIC', 'Loch Ard Gorge VIC', 'London Bridge, Port Campbell VIC'],
      stay('Warrnambool 住宿', 220), '走内陆 Colac 直达十二门徒岩，比沿大洋路海岸绕行省 2 小时；Port Campbell 午餐。',
      pick('Warrnambool', 'stay'), [...pick('Port Campbell', 'dining', '午餐'), ...pick('Warrnambool', 'dining', '晚餐')]),
    day('Port Fairy · 甘比尔山蓝湖 → Robe', 'Warrnambool VIC', 'Robe SA', 329, 4.5,
      ['Tower Hill Wildlife Reserve VIC', 'Port Fairy VIC', 'Mount Gambier SA', 'Blue Lake, Mount Gambier SA', 'Umpherston Sinkhole SA'],
      stay('Robe 住宿', 260), '进入南澳前处理掉新鲜水果蔬菜（果蝇检疫）；南澳时间比维州慢 30 分钟。甘比尔山午餐，12 月蓝湖最蓝。',
      pick('Robe', 'stay'), [...pick('Mount Gambier', 'dining', '午餐'), ...pick('Robe', 'dining', '晚餐')]),
    day('库隆 → 汉多夫 → 阿德莱德', 'Robe SA', 'Adelaide SA', 338, 4.3,
      ['Kingston SE SA', 'Coorong National Park SA', 'Hahndorf SA'],
      stay('Adelaide 住宿（第 1 晚）', 380), 'Kingston SE（大龙虾）或 Meningie 休息；Hahndorf 德国村晚餐后进城。',
      pick('Adelaide', 'stay'), [...pick('Meningie', 'dining', '午餐'), ...pick('Hahndorf', 'dining', '晚餐')]),
    day('阿德莱德：动物园 + 海滩', 'Adelaide SA', 'Adelaide SA', 59, 1.6,
      ['Cleland Wildlife Park SA', 'Adelaide Central Market SA', 'Glenelg SA'],
      stay('Adelaide 住宿（第 2 晚）', 380), '上午 Cleland 喂袋鼠、抱考拉（需预约时段），中午中央市场（周一、周日休市），傍晚 Glenelg 海滩看日落。',
      pick('Adelaide', 'stay'), pick('Adelaide', 'dining')),
    day('回程（上）→ Dimboola', 'Adelaide SA', 'Dimboola VIC', 392, 4.9,
      ['Tailem Bend SA', 'Bordertown SA'],
      stay('Dimboola 住宿', 180), '回程长途，Tailem Bend 和 Bordertown（白袋鼠保护区）各休息一次。进入维州后时间快 30 分钟。',
      [], []),
    day('回程（下）→ 回家', 'Dimboola VIC', 'Melbourne VIC', 340, 4.5,
      ['Horsham VIC', 'Ballarat VIC'],
      null, 'Ballarat 午餐；时间充裕可去 Sovereign Hill 淘金镇（需半天）。',
      [], pick('Ballarat', 'dining', '午餐')),
  ];

  const expenses: Expense[] = [
    { id: newId(), title: 'Cleland 野生动物园门票', category: 'activity', amount: 110, dayId: days[3].id, paid: false },
    { id: newId(), title: '阿德莱德市区停车', category: 'transport', amount: 60, dayId: days[3].id, paid: false },
    { id: newId(), title: '零食 / 饮用水 / 路上补给', category: 'food', amount: 100, dayId: null, paid: false },
    { id: newId(), title: '出发前汽车保养检查', category: 'other', amount: 200, dayId: null, paid: false },
  ];

  const known = new Set(DEFAULT_PLACES.map((p) => p.name));
  return {
    version: 2,
    id: newId(),
    name: LOOP_NAME,
    startDate: '2026-12-11',
    adults: 2,
    children: 2,
    budget: 5000,
    vehicle: { name: '家用 SUV', litresPer100km: 9, fuelPrice: 2.05 },
    food: { adultPerDay: 60, childPerDay: 35 },
    days,
    places: [...structuredClone(DEFAULT_PLACES), ...LOOP_PLACES.filter((p) => !known.has(p.name))],
    expenses,
    checklist: [
      ...genericChecklist(),
      ...checklist('路上注意', [
        '进入南澳前处理掉新鲜水果蔬菜（果蝇检疫）',
        '南澳比维州慢 30 分钟，注意入住和预约时间',
        'Cleland 抱考拉需提前预约时段',
      ]),
    ],
  };
}

/* ------------------------------------------------------------------
 * 8 天往返（默认）：大洋路 → 甘比尔山 → 阿德莱德（3 晚：动物园看熊猫 + 北台地博物馆美术馆）→ 袋鼠岛 → 墨尔本
 * 车程（OSRM）：4.6 / 4.5 / 4.3 / 步行 / 3.3 / 4.8 / 4.9 / 4.5 小时。
 * 阿德莱德场馆信息于 2026 年 11 月核实：熊猫星秋、宜兰 2025 年 1 月起公开展出（10 年租借），随动物园门票参观；
 * 南澳博物馆、美术馆、州立图书馆、植物园免费；移民博物馆 2026 年 7 月起闭馆维修。
 * ------------------------------------------------------------------ */

export const CITY_PLACES: Place[] = [
  {
    name: 'Adelaide Zoo SA', label: '阿德莱德动物园（大熊猫）', lat: -34.915, lng: 138.6062, wiki: 'Adelaide Zoo',
    desc: '大熊猫星秋和宜兰在竹林馆，随门票参观；每天 9:30–17:00，建议网上先买票、早到避开排队，家庭游约 3–4 小时。',
  },
  {
    name: 'South Australian Museum SA', label: '南澳博物馆', lat: -34.921, lng: 138.6036, wiki: 'South Australian Museum',
    desc: '免费，每天 10:00–17:00。恐龙和巨型动物化石、鲸鱼骨架、古埃及展、原住民文化馆，孩子最爱（太平洋文化馆 2026 年底前暂闭）。',
  },
  {
    name: 'Art Gallery of South Australia SA', label: '南澳美术馆', lat: -34.9207, lng: 138.6043, wiki: 'Art Gallery of South Australia',
    desc: '免费，每天 10:00–17:00，紧挨博物馆。大型雕塑和当代装置孩子也爱看；馆内咖啡馆开到 16:30。',
  },
  {
    name: 'State Library of South Australia SA', label: '南澳州立图书馆（Mortlock 厅）', lat: -34.9211, lng: 138.6027,
    wiki: 'State Library of South Australia',
    desc: '免费，工作日 10:00–17:00。Mortlock 阅览厅像《哈利·波特》里的图书馆，拍照很美；有儿童区 Little Library。',
  },
];

const CITY_LUNCH: R[] = [
  rec({ name: 'Botanic Lodge', where: 'Adelaide Botanic Garden', type: '湖边休闲餐厅 · 午餐', price: '$$', note: '有儿童菜单；湖边没有围栏，注意看好孩子' }),
  rec({ name: 'Evergreen Deli', where: 'Adelaide Botanic Garden', type: '轻食熟食 · 午餐', price: '$', note: '花园里快速吃个午饭' }),
  rec({ name: 'AGSA_eat', where: 'Art Gallery of South Australia', type: '美术馆咖啡馆', price: '$–$$', note: '看展顺路，开到 16:30' }),
];

export const GRAND_NAME = '墨尔本 → 阿德莱德 → 袋鼠岛 → 墨尔本 8 天往返';

export function createGrandTrip(): Trip {
  const loop = createLoopTrip();
  const ki = createKangarooIslandTrip();
  const clone = (d: Day): Day => ({ ...structuredClone(d), id: newId() });

  const cityDay = day(
    '阿德莱德：动物园看熊猫 + 博物馆美术馆', 'Adelaide SA', 'Adelaide SA', 5, 1.2,
    ['Adelaide Zoo SA', 'Adelaide Botanic Garden SA', 'South Australian Museum SA', 'Art Gallery of South Australia SA', 'State Library of South Australia SA'],
    stay('Adelaide 住宿（第 2 晚）', 380),
    '全天步行：9:30 动物园开门先看熊猫 → 穿过植物园（午餐）→ 北台地的博物馆、美术馆、图书馆都在一条街上，相隔 1–3 分钟。场馆 17:00 关门。傍晚可坐电车去 Glenelg 看日落。天气 36°C 以上植物园温室会提前关。',
    pick('Adelaide', 'stay'), CITY_LUNCH,
  );
  cityDay.mode = 'walk';

  const toKI = clone(ki.days[4]);
  const backFromKI = clone(ki.days[5]);
  backFromKI.accommodation = stay('Adelaide 住宿（第 3 晚）', 380);
  backFromKI.notes = '车程最紧的一天：早上先去弗林德斯蔡斯国家公园，Penneshaw 赶下午的渡轮（留足余量），回大陆后直接进城休息。大风天岩石和拱门可能关闭。';

  const homeA = clone(loop.days[4]);
  const homeB = clone(loop.days[5]);

  const days: Day[] = [clone(loop.days[0]), clone(loop.days[1]), clone(loop.days[2]), cityDay, toKI, backFromKI, homeA, homeB];

  const expenses: Expense[] = [
    { id: newId(), title: '阿德莱德动物园家庭票（约 $124，网上先买）', category: 'activity', amount: 124, dayId: cityDay.id, paid: false },
    { id: newId(), title: 'SeaLink 渡轮往返（1 车 + 2 大 2 小，最低约 $496，12 月旺季会更贵，以报价为准）', category: 'transport', amount: 600, dayId: toKI.id, paid: false },
    { id: newId(), title: '海狮湾家庭票（约 $110）', category: 'activity', amount: 110, dayId: toKI.id, paid: false },
    { id: newId(), title: '小撒哈拉滑沙板租用（约 $37/块 × 2）', category: 'activity', amount: 74, dayId: toKI.id, paid: false },
    { id: newId(), title: '弗林德斯蔡斯国家公园家庭一日票（约 $38）', category: 'activity', amount: 38, dayId: backFromKI.id, paid: false },
    { id: newId(), title: '阿德莱德停车（3 晚）', category: 'transport', amount: 90, dayId: null, paid: false },
    { id: newId(), title: '零食 / 饮用水 / 路上补给', category: 'food', amount: 140, dayId: null, paid: false },
    { id: newId(), title: '出发前汽车保养检查', category: 'other', amount: 200, dayId: null, paid: false },
  ];

  const places = [...loop.places];
  for (const p of [...KI_PLACES, ...CITY_PLACES]) if (!places.some((x) => x.name === p.name)) places.push(p);

  return {
    ...loop,
    id: newId(),
    name: GRAND_NAME,
    budget: 7000,
    days,
    places,
    expenses,
    checklist: [
      ...genericChecklist(),
      ...checklist('阿德莱德', [
        '网上提前买动物园门票（看熊猫）；想参加熊猫幕后体验要另外预约',
        '查天气：36°C 以上植物园温室提前关门',
      ]),
      ...checklist('袋鼠岛', [
        '尽早预订 SeaLink 渡轮（12 月旺季会满），先订船再订岛上住宿；订票需填车辆品牌、型号、年份',
        '上船前洗车（防瓦螨），开船前 30 分钟到 Cape Jervis',
        '不要带蜂蜜、蜂蜡等蜂产品和未清洗的土豆上岛（袋鼠岛生物安全规定，码头会检查）',
        '出发前查海狮湾沙滩是否恢复开放（2026 年 8 月起暂停）',
      ]),
      ...checklist('路上注意', [
        '进入南澳前处理掉新鲜水果蔬菜（果蝇检疫）',
        '南澳比维州慢 30 分钟，注意渡轮、入住和预约时间',
      ]),
    ],
  };
}

/* ------------------------------------------------------------------
 * 7 天往返（默认）：第 1 天直接开到甘比尔山住蓝湖边，第 2 天直达阿德莱德。
 * 车程（OSRM）：5.7 / 5.4 / 步行 / 3.3 / 4.8 / 4.9 / 4.5 小时——前两天超过 5 小时，是家里选择的取舍。
 * 不经过大洋路、Robe、库隆。
 * ------------------------------------------------------------------ */

export const SEVEN_NAME = '墨尔本 → 蓝湖 → 阿德莱德 → 袋鼠岛 → 墨尔本 7 天';

export function createSevenDayTrip(): Trip {
  const grand = createGrandTrip();
  const clone = (d: Day): Day => ({ ...structuredClone(d), id: newId() });

  const toBlueLake = day(
    '墨尔本 → 甘比尔山 · 住蓝湖边', 'Melbourne VIC', 'Mount Gambier SA', 422, 5.7,
    ['Blue Lake, Mount Gambier SA', 'Umpherston Sinkhole SA'],
    stay('Mount Gambier 住宿（蓝湖边）', 200),
    '全程约 5.7 小时，走 Western Fwy → Ballarat → Glenelg Hwy → Hamilton，在 Ballarat 和 Hamilton 各休息一次。进入南澳前处理掉新鲜水果蔬菜（果蝇检疫）；南澳时间比维州慢 30 分钟。傍晚看蓝湖，天黑后 Umpherston 天坑花园有负鼠出来觅食。',
    pick('Mount Gambier', 'stay'), pick('Mount Gambier', 'dining', '晚餐'),
  );
  const toAdelaide = day(
    '蓝湖 → 汉多夫 → 阿德莱德', 'Mount Gambier SA', 'Adelaide SA', 437, 5.4,
    ['Hahndorf SA'],
    stay('Adelaide 住宿（第 1 晚）', 380),
    '约 5.4 小时，经 Naracoorte、Keith、Tailem Bend，中途休息两次。早上可再看一眼蓝湖；Hahndorf 德国村晚餐后进城。',
    pick('Adelaide', 'stay'), pick('Hahndorf', 'dining', '晚餐'),
  );

  const [, , , city, toKI, backFromKI, homeA, homeB] = grand.days.map(clone);
  city.notes =
    '全天步行（12/13 是周日）：9:30 动物园开门先看熊猫 → 穿过植物园（午餐）→ 北台地的南澳博物馆、美术馆（每天 10:00–17:00）。州立图书馆周末开放时间没能确认，去之前查一下；中央市场周日不开。傍晚可坐电车去 Glenelg 看日落。天气 36°C 以上植物园温室会提前关。';

  const days = [toBlueLake, toAdelaide, city, toKI, backFromKI, homeA, homeB];
  // 开销跟着新的日期 id
  const idMap = new Map(grand.days.map((d, i) => [d.id, ([null, null, null, city, toKI, backFromKI, homeA, homeB] as (Day | null)[])[i]?.id ?? null]));
  const expenses = grand.expenses.map((e) => ({ ...e, id: newId(), dayId: e.dayId ? idMap.get(e.dayId) ?? null : null }));

  return { ...grand, id: newId(), name: SEVEN_NAME, budget: 6500, days, expenses };
}

/* ------------------------------------------------------------------
 * 9 天往返（默认）：8 天方案的基础上，袋鼠岛住 2 晚、回程走格兰扁。
 * 第 1 天走大洋路全程住 Port Campbell。车程（OSRM）：4.8 / 5.3 / 4.3 / 步行 / 3.3 / 2.1 / 3.8 / 5.1 / 3.6 小时（第 2、8 天略超 5 小时）。
 * ------------------------------------------------------------------ */

export const NINE_NAME = '大洋路 → 阿德莱德 → 袋鼠岛 → 格兰扁 9 天';

export function createNineDayTrip(): Trip {
  const grand = createGrandTrip();
  const clone = (d: Day): Day => ({ ...structuredClone(d), id: newId() });
  const [d1, d2, d3, cityTpl, toKITpl] = grand.days;

  // 阿德莱德这天放慢：动物园 + 植物园 + 博物馆，美术馆和图书馆看体力
  const city = clone(cityTpl);
  city.stops = ['Adelaide Zoo SA', 'Adelaide Botanic Garden SA', 'South Australian Museum SA'];
  city.km = 4;
  city.driveHours = 1;
  city.notes =
    '慢慢走：9:30 动物园开门先看熊猫（家庭约 3 小时）→ 穿过植物园吃午饭 → 下午南澳博物馆（恐龙、鲸鱼骨架，免费）。体力还够再去隔壁的美术馆或州立图书馆，场馆 17:00 关门。傍晚可坐电车去 Glenelg 看日落。36°C 以上植物园温室会提前关。';

  const toKI = clone(toKITpl);
  toKI.accommodation = stay('袋鼠岛西南部住宿（第 1 晚，连住 2 晚）', 260);

  const kiDay = day(
    '袋鼠岛：神奇岩石 · 海军上将拱门', 'Vivonne Bay SA', 'Vivonne Bay SA', 117, 2.1,
    ['Remarkable Rocks SA', 'Admirals Arch SA'],
    stay('袋鼠岛西南部住宿（第 2 晚）', 260),
    '不用赶船的一天：上午去弗林德斯蔡斯国家公园（家庭一日票约 $38），看神奇岩石和拱门下的海豹；下午回 Vivonne Bay 海滩玩。黄昏后岛上动物多，尽量天黑前回到住处。大风天岩石和拱门可能关闭。',
    KI_STAYS, KI_DINING.filter((r) => r.where === 'Vivonne Bay'),
  );

  const leaveKI = day(
    '离岛 → 渡轮 → Tailem Bend', 'Vivonne Bay SA', 'Tailem Bend SA', 298, 3.8,
    ['Kingscote, Kangaroo Island SA', 'Penneshaw SA', 'Cape Jervis SA'],
    stay('Tailem Bend 住宿', 160),
    'Kingscote 午餐（海鲜），Penneshaw 坐下午的渡轮（开船前 30 分钟到码头），回大陆后往东开到墨累河边的 Tailem Bend 过夜，给第二天去格兰扁缩短路程。',
    [], [
      rec({ name: 'Kangaroo Island Fresh Seafoods', where: 'Kingscote', type: '海鲜外卖 · 午餐', price: '$–$$', note: '本地生蚝、扇贝和炸鱼薯条（营业时间先电话确认）' }),
      ...KI_DINING.filter((r) => r.where === 'Penneshaw'),
    ],
    { 'Cape Jervis SA': 'ferry' },
  );

  const toGrampians = day(
    '回程 → 格兰扁 Halls Gap', 'Tailem Bend SA', 'Halls Gap VIC', 399, 5.1,
    ['Bordertown SA', 'Horsham VIC'],
    stay('Halls Gap 住宿', 250),
    '约 5.1 小时，是全程最长的一天，Bordertown（白袋鼠保护区）和 Horsham 各休息一次。进入维州后时间快 30 分钟。傍晚 Halls Gap 的草地上常有成群袋鼠。',
    pick('Halls Gap', 'stay'), pick('Halls Gap', 'dining', '晚餐'),
  );

  const home = day(
    '格兰扁 Pinnacle → Ballarat → 回家', 'Halls Gap VIC', 'Melbourne VIC', 275, 3.6,
    ['The Pinnacle Lookout, Grampians VIC', 'Ballarat VIC'],
    null,
    '早上走 Pinnacle 步道（从 Sundial 停车场往返约 4 km，带孩子约 2 小时），Ballarat 午餐后回家。',
    [], pick('Ballarat', 'dining', '午餐'),
  );

  // 第 1 天走大洋路全程，住 Port Campbell（可以在十二门徒岩看日落）；第 2 天一路到 Robe
  const gor = day(
    '大洋路全程 → 十二门徒岩日落', 'Melbourne VIC', 'Port Campbell VIC', 296, 4.8,
    ['Torquay VIC', 'Bells Beach VIC', 'Split Point Lighthouse, Aireys Inlet VIC', 'Lorne VIC', 'Apollo Bay VIC', 'Twelve Apostles VIC', 'Loch Ard Gorge VIC'],
    stay('Port Campbell 住宿', 230),
    '沿海岸开完整段大洋路：Torquay → Bells Beach → Split Point 灯塔 → Lorne（午餐）→ Apollo Bay，之后转进 Otway 雨林路段，弯多注意晕车。住 Port Campbell，离十二门徒岩约 10 分钟，可以傍晚去看日落（12 月日落约 20:40）。早上一早出发，避开周五出城车流。',
    [
      rec({ name: 'NRMA Port Campbell Holiday Park', where: 'Port Campbell', type: '度假村小屋 / 别墅', price: '12 月价格以官网为准', note: '镇上最大的家庭型营地，有家庭房；评分约 8.0/10' }),
      rec({ name: 'Port Campbell Parkview Motel & Apartments', where: 'Port Campbell', type: '汽车旅馆 / 公寓', price: '价格以官网为准', note: '步行约 10 分钟到游客中心和海滩，免费停车' }),
      rec({ name: 'Portside Motel', where: 'Port Campbell', type: '汽车旅馆', price: '价格以官网为准', note: '有客人评价房间够大、适合带孩子' }),
    ],
    [...pick('Lorne', 'dining', '午餐'), ...pick('Port Campbell', 'dining', '晚餐')],
  );
  const toRobe = day(
    'Warrnambool · Port Fairy · 甘比尔山蓝湖 → Robe', 'Port Campbell VIC', 'Robe SA', 389, 5.3,
    ['London Bridge, Port Campbell VIC', 'Warrnambool VIC', 'Port Fairy VIC', 'Mount Gambier SA', 'Blue Lake, Mount Gambier SA', 'Umpherston Sinkhole SA'],
    stay('Robe 住宿', 260),
    '全程最长的一天（约 5.3 小时）：早上顺路看伦敦拱门，Port Fairy 喝咖啡，甘比尔山午餐、看蓝湖和天坑花园，傍晚到 Robe。进入南澳前处理掉新鲜水果蔬菜（果蝇检疫）；南澳时间慢 30 分钟，等于多出半小时。',
    pick('Robe', 'stay'), [...pick('Mount Gambier', 'dining', '午餐'), ...pick('Robe', 'dining', '晚餐')],
  );
  void d1;
  void d2;

  const days = [gor, toRobe, clone(d3), city, toKI, kiDay, leaveKI, toGrampians, home];

  const expenses: Expense[] = [
    { id: newId(), title: '阿德莱德动物园家庭票（约 $124，网上先买）', category: 'activity', amount: 124, dayId: city.id, paid: false },
    { id: newId(), title: 'SeaLink 渡轮往返（1 车 + 2 大 2 小，最低约 $496，12 月旺季会更贵，以报价为准）', category: 'transport', amount: 600, dayId: toKI.id, paid: false },
    { id: newId(), title: '海狮湾家庭票（约 $110）', category: 'activity', amount: 110, dayId: toKI.id, paid: false },
    { id: newId(), title: '小撒哈拉滑沙板租用（约 $37/块 × 2）', category: 'activity', amount: 74, dayId: toKI.id, paid: false },
    { id: newId(), title: '弗林德斯蔡斯国家公园家庭一日票（约 $38）', category: 'activity', amount: 38, dayId: kiDay.id, paid: false },
    { id: newId(), title: '阿德莱德停车（2 晚）', category: 'transport', amount: 60, dayId: null, paid: false },
    { id: newId(), title: '零食 / 饮用水 / 路上补给', category: 'food', amount: 160, dayId: null, paid: false },
    { id: newId(), title: '出发前汽车保养检查', category: 'other', amount: 200, dayId: null, paid: false },
  ];

  const places = [...grand.places];
  const extra: Place[] = [
    { name: 'Port Campbell VIC', label: 'Port Campbell', lat: -38.6195, lng: 142.995, wiki: 'Port Campbell, Victoria', desc: '十二门徒岩旁的海边小镇，住这里方便傍晚去看日落。' },
    { name: 'Kingscote, Kangaroo Island SA', label: 'Kingscote 金斯科特', lat: -35.6531, lng: 137.6342, wiki: 'Kingscote, South Australia', desc: '袋鼠岛最大的镇，补给、加油、吃海鲜方便。' },
  ];
  for (const p of extra) if (!places.some((x) => x.name === p.name)) places.push(p);

  return { ...grand, id: newId(), name: NINE_NAME, budget: 7500, days, expenses, places };
}

/* ------------------------------------------------------------------
 * 路线对比（从 Point Cook 出发）：
 *   A：第 1 天大洋路一路开到甘比尔山住蓝湖，第 2 天直达阿德莱德；袋鼠岛住 1 晚后回阿德莱德，再住 Dimboola、经格兰扁回家（7 天）
 *   B：第 1 天大洋路住 Port Campbell，第 2 天住 Robe，第 3 天到阿德莱德（9 天）
 * 两个方案作为「备选方案」放进行程的版本列表，在「方案」页并排对比。
 * 车程（OSRM，从 Point Cook）：A 7.9 / 5.4 …；B 4.4 / 5.3 / 4.3 …
 * ------------------------------------------------------------------ */

export const COMPARE_NAME = 'Point Cook 出发 · A/B 路线对比';
export const COMPARE_A = 'A：直达蓝湖、袋鼠岛 1 晚（7 天）';
export const COMPARE_B = 'B：住 Port Campbell、Robe（9 天）';
export const COMPARE_C = 'C：住 Apollo Bay、蓝湖（9 天）';
export const COMPARE_D = 'D：按需求定制 · 格兰扁 2 晚（9 天）';
export const COMPARE_E = 'E：在 D 基础上不去袋鼠岛 · 阿德莱德直接开回家（4 天）';
export const COMPARE_F = 'F：在 E 基础上阿德莱德多住 2 晚（6 天）';
/** 家里定下的日期：12/12（六）出发，12/20（日）回家 */
export const TRIP_START = '2026-12-12';

/** 按名字选定某天的住宿（模板用，不依赖界面代码） */
function choose(d: Day, name: string) {
  const r = d.stayOptions.find((x) => x.name === name);
  if (!r || !d.accommodation) return;
  d.stayOptions.forEach((x) => (x.picked = x === r));
  d.accommodation.name = r.name;
  if (r.cost) d.accommodation.cost = r.cost;
  const link = r.bookingUrl || r.url;
  if (link && !d.accommodation.notes.includes(link)) d.accommodation.notes = `预订：${link}`;
}

const POINT_COOK: Place = {
  name: 'Point Cook VIC', label: 'Point Cook（家）', lat: -37.9148, lng: 144.7509, wiki: 'Point Cook, Victoria',
  desc: '出发和回家的地方。',
};

export function createRouteComparisonTrip(): Trip {
  const b = createNineDayTrip();
  b.places = [...b.places.filter((p) => p.name !== POINT_COOK.name), POINT_COOK];
  Object.assign(b.days[0], { from: 'Point Cook VIC', km: 272, driveHours: 4.4 });
  Object.assign(b.days[8], { to: 'Point Cook VIC', km: 267, driveHours: 3.5 });

  const clone = (d: Day): Day => ({ ...structuredClone(d), id: newId() });
  const a1 = day(
    '大洋路一路开到甘比尔山 · 住蓝湖', 'Point Cook VIC', 'Mount Gambier SA', 525, 7.9,
    ['Torquay VIC', 'Bells Beach VIC', 'Split Point Lighthouse, Aireys Inlet VIC', 'Lorne VIC', 'Apollo Bay VIC',
      'Twelve Apostles VIC', 'Loch Ard Gorge VIC', 'London Bridge, Port Campbell VIC', 'Warrnambool VIC', 'Port Fairy VIC',
      'Blue Lake, Mount Gambier SA'],
    stay('Mount Gambier 住宿（蓝湖边）', 200),
    '纯开车约 7.9 小时，加上停 Torquay、Lorne、十二门徒岩和午餐，实际在路上 10–11 小时；7 点出发，大约当地时间傍晚 6:30–7:30 到（南澳慢 30 分钟）。Port Fairy 之后正是黄昏，注意路上的袋鼠。想早点到可以少停 Bells Beach 和 Split Point。进入南澳前处理掉新鲜水果蔬菜。',
    pick('Mount Gambier', 'stay'), [...pick('Lorne', 'dining', '午餐'), ...pick('Mount Gambier', 'dining', '晚餐')],
  );
  const a2 = day(
    '蓝湖 → 汉多夫 → 阿德莱德', 'Mount Gambier SA', 'Adelaide SA', 437, 5.4,
    ['Hahndorf SA'],
    stay('Adelaide 住宿（第 1 晚）', 380),
    '约 5.4 小时，走内陆经 Naracoorte、Keith、Tailem Bend，不经过 Robe 和库隆（走海边要 6 小时）。早上可再看一眼蓝湖；Hahndorf 德国村晚餐后进城。',
    pick('Adelaide', 'stay'), pick('Hahndorf', 'dining', '晚餐'),
  );
  // 阿德莱德 + 上袋鼠岛沿用 B；袋鼠岛只住 1 晚，第 5 天看完西部回阿德莱德住；
  // 第 6 天一早从阿德莱德出发住 Dimboola，第 7 天经格兰扁回家
  const [city, toKI] = b.days.slice(3, 5).map(clone);
  toKI.accommodation = stay('袋鼠岛西南部住宿（1 晚）', 260);
  const a5 = day(
    '神奇岩石 · 拱门 → 渡轮回阿德莱德', 'Vivonne Bay SA', 'Adelaide SA', 320, 4.8,
    ['Remarkable Rocks SA', 'Admirals Arch SA', 'Penneshaw SA', 'Cape Jervis SA'],
    stay('Adelaide 住宿（第 3 晚）', 380),
    '早上先去弗林德斯蔡斯国家公园（家庭一日票约 $38），Penneshaw 赶下午的渡轮（开船前 30 分钟到，留足余量），回大陆后直接进城休息。大风天岩石和拱门可能关闭。',
    pick('Adelaide', 'stay'), [...KI_DINING.filter((r) => r.where === 'Penneshaw'), ...pick('Adelaide', 'dining', '晚餐')],
    { 'Cape Jervis SA': 'ferry' },
  );
  const a6 = day(
    '一早离开阿德莱德 → Dimboola', 'Adelaide SA', 'Dimboola VIC', 392, 4.9,
    ['Tailem Bend SA', 'Bordertown SA'],
    stay('Dimboola 住宿', 160),
    '早上出发，约 4.9 小时。Tailem Bend 和 Bordertown（白袋鼠保护区，免费）各休息一次；进入维州后时间快 30 分钟。Dimboola 在 Wimmera 河边，营地旁有游乐场和滑板公园。',
    [
      rec({ name: 'Dimboola Riverside Holiday Park', where: 'Dimboola', type: '河边度假营地（两卧小屋）', price: '价格以官网为准', note: '有两卧小屋和带上下铺的小屋，旁边是游乐场；镇政府经营' }),
      rec({ name: 'Motel Dimboola', where: 'Dimboola', type: '汽车旅馆', price: '有平台报价约 $69/晚（可能过时）', note: '在 Horsham Road 上，有洗衣服务' }),
      rec({ name: 'Victoria Hotel Dimboola', where: 'Dimboola', type: '酒店客房', price: '价格以官网为准', note: '房间简单，有适合家庭的房型' }),
    ],
    [],
  );
  const a7 = day(
    '格兰扁 Pinnacle → Ballarat → 回家', 'Dimboola VIC', 'Point Cook VIC', 370, 5.0,
    ['Horsham VIC', 'Halls Gap VIC', 'The Pinnacle Lookout, Grampians VIC', 'Ballarat VIC'],
    null,
    '约 5 小时车程：经 Horsham 到格兰扁 Halls Gap，上午走 Pinnacle 步道（往返约 4 km，带孩子约 2 小时），Ballarat 午餐后回家。不去格兰扁直接回家约 4.4 小时。',
    [], [...pick('Halls Gap', 'dining'), ...pick('Ballarat', 'dining', '午餐')],
  );
  const aDays = [a1, a2, city, toKI, a5, a6, a7];
  const idMap = new Map(b.days.slice(3, 5).map((d, i) => [d.id, [city, toKI][i].id]));
  const a: Trip = {
    ...structuredClone(b),
    id: b.id,
    days: aDays,
    budget: b.budget - 600,
    expenses: b.expenses.map((e) => ({ ...e, id: newId(), dayId: e.dayId ? idMap.get(e.dayId) ?? null : null })),
  };

  // C：去程住 Apollo Bay 和甘比尔山（蓝湖），第 3 天经汉多夫到阿德莱德；之后和 B 一样
  const c1 = day(
    '大洋路前半段 → Apollo Bay', 'Point Cook VIC', 'Apollo Bay VIC', 174, 2.8,
    ['Torquay VIC', 'Bells Beach VIC', 'Split Point Lighthouse, Aireys Inlet VIC', 'Lorne VIC'],
    stay('Apollo Bay 住宿', 260),
    '第一天轻松：Torquay → Bells Beach → Split Point 灯塔 → Lorne（午餐、海滩）→ Apollo Bay。纯开车约 2.8 小时，下午就能到，孩子可以在海滩玩，傍晚去 Marriners Lookout 看海湾；野生动物出来前就到住处。Lorne 之后沿海弯道多，注意晕车。',
    pick('Apollo Bay', 'stay'), [...pick('Lorne', 'dining', '午餐'), ...pick('Apollo Bay', 'dining', '晚餐')],
  );
  const c2 = day(
    '十二门徒岩 · Port Fairy → 甘比尔山蓝湖', 'Apollo Bay VIC', 'Mount Gambier SA', 353, 5.1,
    ['Twelve Apostles VIC', 'Loch Ard Gorge VIC', 'London Bridge, Port Campbell VIC', 'Warrnambool VIC', 'Port Fairy VIC', 'Blue Lake, Mount Gambier SA'],
    stay('Mount Gambier 住宿（蓝湖边）', 200),
    '纯开车约 5.1 小时，是去程最长的一天。早上穿过 Otway 雨林段（弯多，慢慢开），上午看十二门徒岩、Loch Ard Gorge 和伦敦拱门，Warrnambool 或 Port Fairy 午餐，傍晚到甘比尔山，天黑前去看蓝湖。进入南澳前处理掉新鲜水果蔬菜（果蝇检疫）；南澳慢 30 分钟。',
    pick('Mount Gambier', 'stay'), [...pick('Port Fairy', 'dining', '午餐'), ...pick('Mount Gambier', 'dining', '晚餐')],
  );
  const c3 = clone(a2);
  c3.accommodation = stay('Adelaide 住宿（第 1 晚）', 380);
  const cRest = b.days.slice(3).map(clone);
  const cIdMap = new Map(b.days.slice(3).map((d, i) => [d.id, cRest[i].id]));
  const c: Trip = {
    ...structuredClone(b),
    id: b.id,
    days: [c1, c2, c3, ...cRest],
    expenses: b.expenses.map((e) => ({ ...e, id: newId(), dayId: e.dayId ? cIdMap.get(e.dayId) ?? null : null })),
  };

  /*
   * D：按家里的需求定制（12/12 周六 – 12/20 周日，9 天）
   * - 只有第 1 天是长途（大洋路全程 + 十二门徒岩直达蓝湖，约 7.9 小时），换来其他日子轻松
   * - 阿德莱德 2 晚（一整天看熊猫、博物馆），袋鼠岛 2 晚，回程经格兰扁并住 2 晚
   * - 住宿都选带厨房的公寓 / 整套房
   */
  const d1 = clone(a1);
  d1.notes =
    '全程唯一的长途日：12/12 周六早上 7 点出发，纯开车约 7.9 小时，加上停 Torquay、Lorne（午餐）和十二门徒岩，路上 10–11 小时。孩子在车上的时间长，带好零食、耳机和晕车药；十二门徒岩和 Loch Ard Gorge 是这一天的重点，其他点可以少停。十二门徒岩现在要提前在网上预约到访时段（大约下午 2–3 点到），停车后步行约 1 km 到观景台。Port Fairy 之后正是黄昏，注意路上的袋鼠。进入南澳前处理掉新鲜水果蔬菜；南澳慢 30 分钟。';
  const d2 = clone(a2);
  d2.notes = '12/13 周日：早上再看一眼蓝湖（12 月是最蓝的时候），走内陆约 5.4 小时，Hahndorf 德国村晚饭后进阿德莱德。';
  const [dCity, dToKI, dKiDay, dLeaveKI, dToGrampians] = b.days.slice(3, 8).map(clone);
  dCity.notes =
    '12/14 周一，全天不开车：9:30 动物园开门先看熊猫（家庭约 3 小时）→ 穿过植物园吃午饭 → 下午南澳博物馆（免费，恐龙和鲸鱼骨架）→ 体力够再去隔壁美术馆。中央市场周一不开。傍晚可坐电车去 Glenelg 海边。';
  dToGrampians.accommodation = stay('Halls Gap 住宿（连住 2 晚）', 260);
  const dGrampians = day(
    '格兰扁一整天：Pinnacle · MacKenzie Falls', 'Halls Gap VIC', 'Halls Gap VIC', 50, 1,
    ['The Pinnacle Lookout, Grampians VIC', 'MacKenzie Falls VIC'],
    stay('Halls Gap 住宿（第 2 晚）', 260),
    '12/19 周六，不赶路：上午从 Sundial 停车场走 Pinnacle 步道（往返约 4 km，10 岁、8 岁的孩子约 2 小时），回镇上午饭；下午去 MacKenzie Falls（2026 年在改建，瀑布底部步道可能不开放，出发前查 Parks Victoria；不开的话改去 The Balconies 观景台，平路往返 2 km）。傍晚 Halls Gap 镇中心的草地上常有成群袋鼠。夏天高温或山火警告时步道可能关闭，出发前看 Parks Victoria 网站。',
    pick('Halls Gap', 'stay'), pick('Halls Gap', 'dining', '晚餐'),
  );
  const dHome = day(
    '格兰扁 → Ballarat → 回家', 'Halls Gap VIC', 'Point Cook VIC', 248, 3.3,
    ['Ballarat VIC'],
    null,
    '12/20 周日回家，约 3.3 小时。时间够的话在 Ballarat 停半天去 Sovereign Hill 淘金镇（孩子可以淘金、看旧时小镇，门票较贵，需半天），晚饭前到家。',
    [], pick('Ballarat', 'dining', '午餐'),
  );
  const dDays = [d1, d2, dCity, dToKI, dKiDay, dLeaveKI, dToGrampians, dGrampians, dHome];
  const dIdMap = new Map(b.days.slice(3, 8).map((x, i) => [x.id, [dCity, dToKI, dKiDay, dLeaveKI, dToGrampians][i].id]));
  const dPlaces = [...b.places];
  for (const p of [
    { name: 'MacKenzie Falls VIC', label: 'MacKenzie Falls 瀑布', lat: -37.1092, lng: 142.4183, wiki: 'MacKenzie Falls', desc: '格兰扁最有名的瀑布，下到瀑布底的步道陡、台阶多；不想走可以到上方观景台。' },
  ]) if (!dPlaces.some((x) => x.name === p.name)) dPlaces.push(p);
  const dTrip: Trip = {
    ...structuredClone(b),
    id: b.id,
    startDate: TRIP_START,
    days: dDays,
    places: dPlaces,
    expenses: b.expenses.map((e) => ({ ...e, id: newId(), dayId: e.dayId ? dIdMap.get(e.dayId) ?? null : null })),
  };
  // 住宿：都选带厨房的公寓 / 整套房（可以在「住宿」里换）
  for (const x of dTrip.days) applyVerifiedStaysToDay(x);
  const kitchen: Record<string, string> = {
    'Mount Gambier SA': 'The Barn Accommodation',
    'Adelaide SA': 'Majestic Old Lion Apartments',
    'Vivonne Bay SA': 'Island Time at Vivonne Bay',
    'Tailem Bend SA': 'Motel River Bend',
    'Halls Gap VIC': 'Halls Gap Valley Lodges',
  };
  for (const x of dTrip.days) if (kitchen[x.to]) choose(x, kitchen[x.to]);
  reviseD(dTrip);

  const snapA = snapshot(a);
  const snapB = snapshot(b);
  const snapC = snapshot(c);
  const snapD = snapshot(dTrip);
  b.versions = [];
  // 列表里新的在上：先加 B 再加 A，对比表里 A 在左、B 在右
  const vb = addVersion(b, COMPARE_B, 'proposal', snapB);
  addVersion(b, COMPARE_A, 'proposal', snapA);
  addVersion(b, COMPARE_C, 'proposal', snapC);
  const vd = addVersion(b, COMPARE_D, 'proposal', snapD);
  b.activePlan = vb.id;
  b.name = COMPARE_NAME;
  // 新设备直接打开按需求定制的 D，日期用家里定的 12/12
  const out = addAlerts(switchPlan(applyVerifiedStays(b), vd.id));
  out.startDate = TRIP_START;
  for (const v of out.versions ?? []) v.snapshot.startDate = TRIP_START;
  return addPlanF(addPlanE(out));
}

/**
 * 已经打开过 A/B 对比的设备：把旧的 A 换成最新的 A（旧 A 改成历史版本保留，不再出现在方案按钮里）。
 * 正在看旧 A 时，当前内容会先存回旧 A，再换成新 A。
 */
export function upgradeComparison(trip: Trip): Trip {
  return addPlanF(addPlanE(addAlerts(reviseDOnDevice(addPlanD(addPlanC(upgradeA(trip)))))));
}

const KI_STOP = /Vivonne Bay|Kangaroo Island|Penneshaw|Kingscote|Seal Bay|Little Sahara|Remarkable Rocks|Admirals Arch|Flinders Chase/i;
const KI_EXPENSE = /袋鼠岛|SeaLink|渡轮|海狮湾|滑沙|弗林德斯|Flinders|Kangaroo Island/i;

/**
 * 方案 E：以 D 现在的内容为底（正在用 D 就用当前内容，含已选的住宿、餐厅、记账），
 * 去掉袋鼠岛那几天，看完阿德莱德后一天直接开回 Point Cook，中途不过夜。
 * 只新增方案，不切换，也不改 D。
 */
export function buildPlanE(d: Omit<Trip, 'versions'>): Omit<Trip, 'versions'> | null {
  const t = structuredClone(d);
  const kiStart = t.days.findIndex((x) => KI_STOP.test(x.to) || x.stops.some((s) => KI_STOP.test(s)));
  if (kiStart < 1) return null;
  const kept = t.days.slice(0, kiStart);
  const last = kept[kept.length - 1];
  const home = t.days[t.days.length - 1]?.to || 'Point Cook VIC';
  const removed = new Set(t.days.slice(kiStart).map((x) => x.id));
  const back: Day = {
    id: newId(),
    title: '阿德莱德 → 直接开回 Point Cook（中途不过夜）',
    from: last.to,
    to: home,
    km: 725,
    driveHours: 7.9,
    stops: [],
    accommodation: null,
    stayOptions: [],
    dining: [],
    notes:
      '回程一天开完：走 M1 South Eastern Fwy → Dukes Hwy（Tailem Bend、Bordertown）→ Western Hwy（Horsham、Ballarat）回家，约 725 km、纯开车约 7.9 小时，加上休息一般 9–10 小时。建议早上 7 点前出发；每 2 小时停一次（Tailem Bend、Bordertown、Horsham、Ballarat 都有加油站和快餐）。过州界时间快 30 分钟（维州比南澳快半小时），到家会比手表上晚。',
    routeKey: 'estimate', // 先按经验估，联网后自动按真实道路重算
  };
  t.days = [...kept, back];
  t.expenses = t.expenses.filter((e) => !(e.dayId && removed.has(e.dayId)) && !(e.dayId === null && KI_EXPENSE.test(e.title)));
  return t;
}

export function addPlanE(trip: Trip): Trip {
  if (trip.name !== COMPARE_NAME || trip.offered?.includes('E') || trip.versions?.some((v) => v.label === COMPARE_E)) return trip;
  const dv = trip.versions?.find((v) => v.label === COMPARE_D && v.id === trip.activePlan) ?? trip.versions?.find((v) => v.label === COMPARE_D);
  if (!dv) return trip;
  const base = trip.activePlan === dv.id ? snapshot(trip) : dv.snapshot;
  const e = buildPlanE(base);
  if (!e) return trip;
  const t = structuredClone(trip);
  addVersion(t, COMPARE_E, 'proposal', e);
  t.offered = [...(t.offered ?? []), 'E'];
  return t;
}

/** 2026 年 11 月核实到的景点变化：加进准备清单（每条只加一次） */
export const ALERTS: { group: string; text: string; when: string }[] = [
  {
    when: 'Twelve Apostles VIC',
    group: '出发前',
    text: '预约十二门徒岩到访时段：2026/10/16 新游客中心启用后，进入观景区要提前在线预约（Great Ocean Road Authority 网站），停车后步行约 1 km 到观景台',
  },
  {
    when: 'MacKenzie Falls VIC',
    group: '路上注意',
    text: 'MacKenzie Falls 瀑布 2026 年在改建，瀑布底部步道曾关闭；出发前查 Parks Victoria「Change of Conditions」，关闭的话改去 The Balconies 或 Silverband Falls',
  },
];
/*
 * D 的第二版（2026/11 按核实结果调整）：
 * - 十二门徒岩不进预约区，大洋路沿途看风景（Loch Ard Gorge、伦敦拱门观景台不用预约）
 * - 海狮湾沙滩暂停：只走木栈道；离岛那天早上加袋鼠岛野生动物园（喂袋鼠、抱考拉）
 * - MacKenzie Falls 改建：格兰扁那天改为 The Balconies + Halls Gap 动物园
 */
const D_PLACES: Place[] = [
  { name: 'Kangaroo Island Wildlife Park SA', label: '袋鼠岛野生动物园', lat: -35.7835, lng: 137.2312, desc: '岛中部 Parndana 附近（有消息说已搬到海狮湾附近，出发前查官网地址）。可以喂袋鼠、抱考拉，150 多种澳洲动物，每天 9:30–17:00。' },
  { name: 'The Balconies, Grampians VIC', label: 'The Balconies 观景台', lat: -37.1256, lng: 142.4583, desc: '格兰扁最经典的悬崖观景台，从 Reed Lookout 停车场走平路往返约 2 km，孩子轻松。' },
  { name: 'Halls Gap Zoo VIC', label: 'Halls Gap 动物园', lat: -37.1735, lng: 142.5268, desc: '镇南几公里的家庭动物园，有犀牛、长颈鹿和很多澳洲动物，每天 10:00–17:00；下午 2:30 犀牛见面会。' },
];
const APOSTLES_ALERT = ALERTS[0].text;

export function reviseD(t: Trip): boolean {
  if (t.days.some((d) => d.stops.includes('Halls Gap Zoo VIC'))) return false;
  const d1 = t.days.find((d) => d.to === 'Mount Gambier SA' && d.stops.includes('Twelve Apostles VIC'));
  const d4 = t.days.find((d) => d.to === 'Vivonne Bay SA' && d.stops.includes('Seal Bay Conservation Park SA'));
  const d6 = t.days.find((d) => d.from === 'Vivonne Bay SA' && d.to === 'Tailem Bend SA');
  const d8 = t.days.find((d) => d.from === 'Halls Gap VIC' && d.to === 'Halls Gap VIC');
  if (!d1 || !d4 || !d6 || !d8) return false;
  for (const p of D_PLACES) if (!t.places.some((x) => x.name === p.name)) t.places.push(p);

  d1.title = '大洋路沿途看风景 → 甘比尔山 · 住蓝湖';
  d1.stops = d1.stops.filter((x) => x !== 'Twelve Apostles VIC');
  d1.notes =
    '全程唯一的长途日，纯开车约 7.9 小时。不进十二门徒岩预约区，沿大洋路看风景：Torquay、Split Point 灯塔、Lorne（午餐）、Apollo Bay 之后是 Otway 雨林弯道；海岸段停 Loch Ard Gorge 和伦敦拱门的观景台（不用预约，Loch Ard 下沙滩的路因悬崖滑动暂时关闭），十二门徒岩从路边远远看一眼即可。少停一个大景点，大约傍晚 5–6 点（南澳时间）到甘比尔山，天黑前还能去看蓝湖。进入南澳前处理掉新鲜水果蔬菜；南澳慢 30 分钟。';
  d4.notes = `${d4.notes} 海狮湾 2026 年 8 月起因禽流感预防暂停下沙滩，只能在木栈道上看海狮（有讲解员，仍能看到沙滩上的海狮）；出发前一周查 Parks SA 公告。`;
  d6.title = '野生动物园 → 渡轮 → Tailem Bend';
  d6.stops = ['Kangaroo Island Wildlife Park SA', ...d6.stops.filter((x) => x !== 'Kangaroo Island Wildlife Park SA')];
  d6.km = 309;
  d6.driveHours = 4.5; // 按真实道路，含绕去野生动物园（约多 40 分钟）
  d6.notes =
    '早上去袋鼠岛野生动物园（9:30 开门，喂袋鼠、抱考拉，孩子最喜欢，约 1.5 小时；出发前查官网确认地址），Kingscote 午餐吃海鲜，Penneshaw 坐下午的渡轮（开船前 30 分钟到码头），回大陆后往东开到 Tailem Bend 过夜。';
  d8.title = '格兰扁一整天：Pinnacle · The Balconies · 动物园';
  d8.stops = ['The Pinnacle Lookout, Grampians VIC', 'The Balconies, Grampians VIC', 'Halls Gap Zoo VIC'];
  d8.notes =
    '12/19 周六，不赶路：上午从 Sundial 停车场走 Pinnacle 步道（往返约 4 km，约 2 小时）；回程顺路到 Reed Lookout 停车场，平路走到 The Balconies 悬崖观景台（往返 2 km）。午饭后去 Halls Gap 动物园（每天 10:00–17:00，2:30 有犀牛见面会）。MacKenzie Falls 在改建，这次不去。傍晚镇中心草地看袋鼠。夏天高温或山火警告时步道可能关闭，出发前看 Parks Victoria。';

  t.expenses = t.expenses.filter((e) => !/十二门徒岩/.test(e.title));
  for (const e of t.expenses) {
    if (/^海狮湾/.test(e.title)) e.title = '海狮湾门票（沙滩暂停开放，只走木栈道；价格以现场为准）';
  }
  t.expenses.push(
    { id: newId(), title: '袋鼠岛野生动物园家庭票（约 $100，以官网为准）', category: 'activity', amount: 100, dayId: d6.id, paid: false, url: 'https://www.kiwildlifepark.com' },
    { id: newId(), title: 'Halls Gap 动物园家庭票（约 $100，2 大 2 小）', category: 'activity', amount: 100, dayId: d8.id, paid: false, url: 'https://hallsgapzoo.com.au/shop/entry-tickets' },
  );
  t.checklist = t.checklist.filter((c) => c.text !== APOSTLES_ALERT && !c.text.startsWith('MacKenzie Falls 瀑布 2026'));
  return true;
}

/** 已经在用 D 的设备：D 方案和当前内容都按第二版调整（只调整一次） */
function reviseDOnDevice(trip: Trip): Trip {
  if (trip.name !== COMPARE_NAME) return trip;
  const v = trip.versions?.find((x) => x.label === COMPARE_D);
  if (!v) return trip;
  const t = structuredClone(trip);
  const vv = t.versions!.find((x) => x.id === v.id)!;
  const changedSnap = reviseD(vv.snapshot);
  const changedNow = t.activePlan === v.id ? reviseD(t) : false;
  return changedSnap || changedNow ? t : trip;
}

function addAlerts(trip: Trip): Trip {
  if (trip.name !== COMPARE_NAME) return trip;
  const visits = new Set(trip.days.flatMap((d) => d.stops));
  const missing = ALERTS.filter((a) => visits.has(a.when) && !trip.checklist.some((c) => c.text === a.text));
  const apostlesDay = trip.days.find((d) => d.stops.includes('Twelve Apostles VIC'));
  const needBooking = !!apostlesDay && !trip.expenses.some((e) => /十二门徒岩/.test(e.title));
  if (!missing.length && !needBooking) return trip;
  const t = structuredClone(trip);
  for (const a of missing) t.checklist.unshift({ id: newId(), text: a.text, group: a.group, done: false });
  // 「预订」页「要订的」里多一项：预约十二门徒岩到访时段
  if (needBooking) {
    t.expenses.push({
      id: newId(),
      title: '预约十二门徒岩到访时段（2026/10 起必须提前预约）',
      category: 'activity',
      amount: 0,
      dayId: apostlesDay!.id,
      paid: false,
      url: 'https://www.greatoceanroadauthority.vic.gov.au/Projects/Twelve-Apostles-Visitor-Centre',
    });
  }
  return t;
}

/**
 * 按家里确认的需求补上方案 D，并切换到 D；日期统一改成 12/12 出发（家里定的）。
 * 切换前当前内容会存回原来的方案，随时可以切回。
 */
function addPlanD(trip: Trip): Trip {
  if (trip.name !== COMPARE_NAME || trip.versions?.some((v) => v.label === COMPARE_D)) return trip;
  const freshD = createRouteComparisonTrip().versions!.find((v) => v.label === COMPARE_D)!;
  let t: Trip = structuredClone(trip);
  const added = addVersion(t, COMPARE_D, 'proposal', structuredClone(freshD.snapshot));
  t = switchPlan(t, added.id);
  t.startDate = TRIP_START;
  for (const v of t.versions ?? []) if (v.kind === 'proposal') v.snapshot.startDate = TRIP_START;
  return t;
}

/** 已经打开过对比的设备：补上方案 C（不切换当前方案） */
function addPlanC(trip: Trip): Trip {
  if (trip.name !== COMPARE_NAME || trip.versions?.some((v) => v.label === COMPARE_C)) return trip;
  const freshC = createRouteComparisonTrip().versions!.find((v) => v.label === COMPARE_C)!;
  const t: Trip = structuredClone(trip);
  addVersion(t, COMPARE_C, 'proposal', { ...freshC.snapshot, startDate: trip.startDate });
  return t;
}

function upgradeA(trip: Trip): Trip {
  if (trip.name !== COMPARE_NAME || trip.versions?.some((v) => v.label === COMPARE_A)) return trip;
  const fresh = createRouteComparisonTrip();
  const freshA = fresh.versions!.find((v) => v.label === COMPARE_A)!;
  const t: Trip = structuredClone(trip);
  const oldA = t.versions?.filter((v) => v.kind === 'proposal' && v.label.startsWith('A：')) ?? [];
  const wasActive = oldA.find((v) => v.id === t.activePlan);
  if (wasActive) wasActive.snapshot = { ...snapshot(trip), name: wasActive.snapshot.name };
  for (const v of oldA) {
    v.kind = 'manual';
    v.label = `${v.label}（旧版）`;
  }
  const newA = addVersion(t, COMPARE_A, 'proposal', { ...freshA.snapshot, startDate: trip.startDate });
  if (wasActive) {
    return { ...structuredClone(newA.snapshot), id: t.id, name: t.name, versions: t.versions, activePlan: newA.id };
  }
  return t;
}

const F_PLACES: Place[] = [
  { name: 'Mount Lofty Summit SA', label: 'Mount Lofty 山顶观景台', lat: -34.9776, lng: 138.7088, wiki: 'Mount Lofty', desc: '阿德莱德最高点，俯瞰整个城市和海湾；山顶有咖啡馆，停车收费。' },
];

/**
 * 方案 F：在 E 的基础上，阿德莱德多住两晚（看完动物园后加海边一天、袋鼠考拉一天），再一天开回家。
 * 用 E 现在的内容为底（E 被删了就从 D 重新生成），只新增方案，不切换。
 */
export function buildPlanF(e: Omit<Trip, 'versions'>): Omit<Trip, 'versions'> | null {
  const t = structuredClone(e);
  const back = t.days[t.days.length - 1];
  const city = t.days[t.days.length - 2];
  if (!back || !city || !/Adelaide/i.test(city.to) || !/Adelaide/i.test(back.from)) return null;
  const stay = city.accommodation;
  const moreNights = (): Day['accommodation'] =>
    stay
      ? { name: stay.name, cost: stay.cost, booked: false, paid: false, notes: stay.booked ? '和前两晚同一家：记得把预订改成连住 4 晚' : '和前两晚同一家，连住 4 晚' }
      : null;
  const day = (title: string, stops: string[], km: number, hours: number, notes: string, mode?: Day['mode']): Day => ({
    id: newId(),
    title,
    from: city.to,
    to: city.to,
    km,
    driveHours: hours,
    stops,
    ...(mode ? { mode } : {}),
    accommodation: moreNights(),
    stayOptions: structuredClone(city.stayOptions ?? []),
    dining: [],
    notes,
    routeKey: 'estimate',
  });
  const beach = day(
    '阿德莱德：坐电车去 Glenelg 海边玩一天',
    ['Glenelg SA'],
    22,
    1,
    '不开车：市中心 King William St 坐电车到 Glenelg（约 30 分钟，市区段免费）。上午海滩玩水、走 Jetty 栈桥；海边的 The Beachouse 有水滑梯、碰碰车等（夏季营业，时间票价以官网为准）。下午可以坐从 Glenelg 出发的海豚观赏船（约 1.5–2 小时，旺季要提前订）。傍晚在 Jetty Road 吃饭，看海上日落再坐电车回去。',
    'transit',
  );
  const animals = day(
    'Cleland 喂袋鼠抱考拉 + Mount Lofty 山顶',
    ['Cleland Wildlife Park SA', 'Mount Lofty Summit SA'],
    36,
    1.1,
    '不去袋鼠岛，就在这里喂袋鼠、看考拉：上午开车约 25 分钟到 Cleland 野生动物园，袋鼠、小袋鼠可以直接喂，考拉合影要在官网提前订时段。之后上 Mount Lofty 山顶观景台看全城和海湾，山顶咖啡馆吃午饭。下午回城休息，或去中央市场买水果零食，为第二天的长途做准备（市场营业时间出发前查）。想看狮子、长颈鹿的话，可以改去 Monarto Safari Park（单程约 1 小时）。',
  );
  t.days = [...t.days.slice(0, -1), beach, animals, back];
  for (const p of [...DEFAULT_PLACES.filter((x) => x.name === 'Glenelg SA' || x.name === 'Cleland Wildlife Park SA'), ...F_PLACES]) {
    if (!t.places.some((x) => x.name === p.name)) t.places.push(p);
  }
  for (const x of t.expenses) {
    const m = x.title.match(/^阿德莱德停车（(\d+) 晚）$/);
    if (m) {
      const n = Number(m[1]);
      x.amount = Math.round((x.amount / n) * (n + 2));
      x.title = `阿德莱德停车（${n + 2} 晚）`;
    }
  }
  t.expenses.push(
    { id: newId(), title: 'Cleland 野生动物园家庭票（考拉合影另收费，以官网为准）', category: 'activity', amount: 110, dayId: animals.id, paid: false, url: 'https://www.clelandwildlifepark.sa.gov.au/' },
    { id: newId(), title: 'Glenelg 电车 + The Beachouse 游玩', category: 'activity', amount: 120, dayId: beach.id, paid: false, quick: true },
  );
  return t;
}

export function addPlanF(trip: Trip): Trip {
  if (trip.name !== COMPARE_NAME || trip.offered?.includes('F') || trip.versions?.some((v) => v.label === COMPARE_F)) return trip;
  const ev = trip.versions?.find((v) => v.label === COMPARE_E && v.id === trip.activePlan) ?? trip.versions?.find((v) => v.label === COMPARE_E);
  let base: Omit<Trip, 'versions'> | null = ev ? (trip.activePlan === ev.id ? snapshot(trip) : ev.snapshot) : null;
  if (!base) {
    const dv = trip.versions?.find((v) => v.label === COMPARE_D);
    if (!dv) return trip;
    base = buildPlanE(trip.activePlan === dv.id ? snapshot(trip) : dv.snapshot);
  }
  const f = base && buildPlanF(base);
  if (!f) return trip;
  const t = structuredClone(trip);
  addVersion(t, COMPARE_F, 'proposal', f);
  t.offered = [...(t.offered ?? []), 'F'];
  return t;
}
