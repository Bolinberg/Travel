import type { Accommodation, ChecklistItem, Day, Expense, Trip } from './types';
import { newId } from './id';

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
  return { id: newId(), title, from, to, km, driveHours, stops, accommodation, notes };
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
      stay('Apollo Bay 住宿', 280),
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
      stay('Adelaide 住宿（第 1 晚）', 250),
      '最长的一天，中途在 Kingston SE / Meningie 休息；Hahndorf 德国小镇晚餐。',
    ),
    day(
      '阿德莱德市区',
      'Adelaide SA',
      'Adelaide SA',
      30,
      0.5,
      ['Adelaide Central Market SA', 'Adelaide Botanic Garden SA', 'Glenelg SA'],
      stay('Adelaide 住宿（第 2 晚）', 250),
      'Glenelg 海滩看日落，可坐电车。',
    ),
    day(
      '巴罗萨 / 动物园一日游',
      'Adelaide SA',
      'Adelaide SA',
      150,
      2,
      ['Cleland Wildlife Park SA', 'Barossa Valley SA'],
      stay('Adelaide 住宿（第 3 晚）', 250),
      '若遇圣诞节当天（12/25）多数商店和景点关门，请调整。',
    ),
    day(
      '返程 · 格兰扁',
      'Adelaide SA',
      'Halls Gap VIC',
      500,
      5.5,
      ['Tailem Bend SA', 'Bordertown SA', 'Horsham VIC'],
      stay('Halls Gap 住宿', 230),
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

  const expenses: Expense[] = [
    { id: newId(), title: 'Cleland 野生动物园门票', category: 'activity', amount: 110, dayId: days[6].id, paid: false },
    { id: newId(), title: 'Otway Fly 树顶步道（可选）', category: 'activity', amount: 120, dayId: days[1].id, paid: false },
    { id: newId(), title: '阿德莱德市区停车', category: 'transport', amount: 80, dayId: days[5].id, paid: false },
    { id: newId(), title: '零食 / 饮用水 / 路上补给', category: 'food', amount: 120, dayId: null, paid: false },
    { id: newId(), title: '纪念品', category: 'shopping', amount: 150, dayId: null, paid: false },
    { id: newId(), title: '出发前汽车保养检查', category: 'other', amount: 200, dayId: null, paid: false },
  ];

  return {
    version: 1,
    name: '墨尔本 → 阿德莱德 家庭自驾',
    startDate: '2026-12-19',
    adults: 2,
    children: 2,
    budget: 5000,
    vehicle: { name: '家用 SUV', litresPer100km: 9, fuelPrice: 2.05 },
    food: { adultPerDay: 60, childPerDay: 35 },
    days,
    expenses,
    checklist: [
      ...checklist('出发前', [
        '预订全部住宿（12 月旺季，尽早）',
        '汽车保养：轮胎、机油、雨刷、冷却液',
        '确认道路救援（RACV / RAA）有效',
        '驾照、车辆注册、保险资料',
        '下载离线地图（大洋路、库隆部分路段无信号）',
        '安装 VicEmergency 和 Alerts SA（夏季山火预警）',
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
        '进入南澳前处理掉新鲜水果蔬菜（检疫规定，违者罚款）',
        '南澳比维州慢 30 分钟，注意入住/预约时间',
        '黄昏和夜间注意袋鼠，尽量不在天黑后开长途',
        '偏远路段加满油再走（库隆、Western Hwy）',
      ]),
    ],
  };
}
