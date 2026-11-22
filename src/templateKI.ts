import type { Accommodation, ChecklistItem, Day, Expense, Mode, Place, Rec, Trip } from './types';
import { newId } from './id';
import { DEFAULT_PLACES } from './places';
import { GUIDES } from './guides';
import { genericChecklist } from './defaultTrip';
import { addVersion, snapshot } from './versions';

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
 *   A：第 1 天大洋路一路开到甘比尔山住蓝湖，第 2 天直达阿德莱德（8 天）
 *   B：第 1 天大洋路住 Port Campbell，第 2 天住 Robe，第 3 天到阿德莱德（9 天）
 * 两个方案作为「备选方案」放进行程的版本列表，在「方案」页并排对比。
 * 车程（OSRM，从 Point Cook）：A 7.9 / 5.4 …；B 4.4 / 5.3 / 4.3 …
 * ------------------------------------------------------------------ */

export const COMPARE_NAME = 'Point Cook 出发 · 两条大洋路路线对比';
export const COMPARE_A = 'A：第 1 天直达蓝湖（8 天）';
export const COMPARE_B = 'B：住 Port Campbell、Robe（9 天）';

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
  const rest = b.days.slice(3).map(clone);
  const aDays = [a1, a2, ...rest];
  const idMap = new Map(b.days.slice(3).map((d, i) => [d.id, rest[i].id]));
  const a: Trip = {
    ...structuredClone(b),
    id: b.id,
    days: aDays,
    budget: b.budget - 300,
    expenses: b.expenses.map((e) => ({ ...e, id: newId(), dayId: e.dayId ? idMap.get(e.dayId) ?? null : null })),
  };

  const snapA = snapshot(a);
  const snapB = snapshot(b);
  b.versions = [];
  // 列表里新的在上：先加 B 再加 A，对比表里 A 在左、B 在右
  addVersion(b, COMPARE_B, 'proposal', snapB);
  addVersion(b, COMPARE_A, 'proposal', snapA);
  b.name = COMPARE_NAME;
  return b;
}
