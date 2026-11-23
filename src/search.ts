/*
 * 各大平台的搜索页（按评分 / 口碑排序，带上日期和人数），以及从平台链接里认出平台和名字。
 */

export interface SearchLink {
  key: string;
  label: string;
  /** 一句话说明这个链接怎么筛的 */
  hint: string;
  href: string;
}

export interface StayQuery {
  /** 地名，如 "Robe SA" */
  place: string;
  checkin: string;
  checkout: string;
  adults: number;
  childAges: number[];
}

const qs = (o: Record<string, string | string[]>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) for (const x of Array.isArray(v) ? v : [v]) p.append(k, x);
  return p.toString();
};

/** 地名转成平台更容易认的写法：Robe SA → Robe, South Australia */
const STATES: Record<string, string> = {
  VIC: 'Victoria',
  SA: 'South Australia',
  NSW: 'New South Wales',
  QLD: 'Queensland',
  WA: 'Western Australia',
  TAS: 'Tasmania',
  NT: 'Northern Territory',
  ACT: 'Australian Capital Territory',
};
export function placeQuery(place: string): string {
  const m = place.trim().match(/^(.*?),?\s+(VIC|SA|NSW|QLD|WA|TAS|NT|ACT)$/i);
  return m ? `${m[1]}, ${STATES[m[2].toUpperCase()]}, Australia` : place.trim();
}

export function staySearchLinks(q: StayQuery): SearchLink[] {
  const where = placeQuery(q.place);
  const kids = q.childAges.length;
  const people = `${q.adults} 大${kids ? ` ${kids} 小` : ''}`;
  return [
    {
      key: 'booking',
      label: 'Booking.com',
      hint: `8 分以上 · 按好评排序 · ${people}`,
      href:
        'https://www.booking.com/searchresults.html?' +
        qs({
          ss: where,
          checkin: q.checkin,
          checkout: q.checkout,
          group_adults: String(q.adults),
          group_children: String(kids),
          age: q.childAges.map(String),
          no_rooms: '1',
          order: 'bayesian_review_score',
          nflt: 'review_score=80',
        }),
    },
    {
      key: 'airbnb',
      label: 'Airbnb',
      hint: '「房客推荐」整套房源',
      href:
        `https://www.airbnb.com.au/s/${encodeURIComponent(where)}/homes?` +
        qs({
          checkin: q.checkin,
          checkout: q.checkout,
          adults: String(q.adults),
          children: String(kids),
          guest_favorite: 'true',
          room_types: 'Entire home/apt',
        }),
    },
    {
      key: 'wotif',
      label: 'Wotif',
      hint: '按住客评分排序',
      href:
        'https://www.wotif.com/Hotel-Search?' +
        qs({
          destination: where,
          startDate: q.checkin,
          endDate: q.checkout,
          adults: String(q.adults),
          ...(kids ? { children: q.childAges.map((a) => `1_${a}`).join(',') } : {}),
          sort: 'REVIEW',
        }),
    },
    {
      key: 'tripadvisor',
      label: 'Tripadvisor',
      hint: '看真实点评和排名',
      href: 'https://www.tripadvisor.com.au/Search?' + qs({ q: `hotels ${where}`, ssrc: 'h' }),
    },
    {
      key: 'google',
      label: 'Google 地图',
      hint: '附近评分高的家庭住宿',
      href: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(`family accommodation ${where}`),
    },
    ...moreStayLinks(q, where, kids),
  ];
}

/** 一个平台的说明（「更多平台」里显示，帮你判断靠不靠谱、适合订什么） */
export interface PlatformInfo {
  key: string;
  label: string;
  /** 归属 / 特点 */
  about: string;
}

/**
 * 「更多平台」：都是在澳洲正规经营、退改有保障的大平台或连锁。
 * Expedia 系（Expedia、Wotif、Hotels.com、Stayz）账号和评价互通；Booking 系（Booking.com、Agoda）；
 * Kayak 一次比各家价格；连锁度假营地直接在官网订通常最划算。
 */
export const MORE_PLATFORMS: PlatformInfo[] = [
  { key: 'expedia', label: 'Expedia', about: 'Expedia 集团（和 Wotif、Hotels.com 同一家），常有「机票 / 租车 + 酒店」套餐价' },
  { key: 'hotelscom', label: 'Hotels.com', about: 'Expedia 集团，住 10 晚左右攒一晚奖励（One Key 会员通用）' },
  { key: 'stayz', label: 'Stayz', about: 'Expedia 集团的澳洲本土度假屋平台（Vrbo 在澳洲的名字），整栋房子带厨房' },
  { key: 'agoda', label: 'Agoda', about: 'Booking 集团，亚洲背景，有中文客服，偶尔比 Booking.com 便宜' },
  { key: 'tripcom', label: 'Trip.com（携程）', about: '携程国际站，中文界面和客服，可用中国的银行卡' },
  { key: 'kayak', label: 'Kayak 比价', about: '一次比 Booking、Expedia、Agoda 等各家价格（Booking 集团旗下），比完再去最便宜的那家订' },
  { key: 'parks', label: '连锁度假营地', about: 'BIG4、Discovery Parks、NRMA、Tasman 等，两卧小木屋、泳池游乐场，官网直订常有会员价' },
];

function moreStayLinks(q: StayQuery, where: string, kids: number): SearchLink[] {
  const town = where.split(',')[0].trim();
  const nights = Math.max(1, Math.round((Date.parse(q.checkout) - Date.parse(q.checkin)) / 86_400_000));
  const expediaKids: Record<string, string> = kids ? { children: q.childAges.map((a) => `1_${a}`).join(',') } : {};
  const expediaQuery = qs({ destination: where, startDate: q.checkin, endDate: q.checkout, adults: String(q.adults), ...expediaKids, sort: 'REVIEW' });
  const kayakPlace = where.replace(/,\s*/g, ',').replace(/\s+/g, '-');
  return [
    { key: 'expedia', label: 'Expedia', hint: '按住客评分排序', href: `https://www.expedia.com.au/Hotel-Search?${expediaQuery}` },
    { key: 'hotelscom', label: 'Hotels.com', hint: '按住客评分排序', href: `https://au.hotels.com/Hotel-Search?${expediaQuery}` },
    {
      key: 'stayz',
      label: 'Stayz',
      hint: '整栋度假屋',
      href: 'https://www.stayz.com.au/search?' + qs({ destination: where, startDate: q.checkin, endDate: q.checkout, adults: String(q.adults), ...expediaKids }),
    },
    {
      key: 'agoda',
      label: 'Agoda',
      hint: '中文客服',
      href:
        'https://www.agoda.com/search?' +
        qs({ textToSearch: town, checkIn: q.checkin, los: String(nights), rooms: '1', adults: String(q.adults), children: String(kids), childages: q.childAges.join(','), sort: 'reviewAll' }),
    },
    {
      key: 'tripcom',
      label: 'Trip.com',
      hint: '中文界面',
      href:
        'https://au.trip.com/hotels/list?' +
        qs({ keyword: town, checkin: q.checkin.replace(/-/g, '/'), checkout: q.checkout.replace(/-/g, '/'), adult: String(q.adults), children: String(kids), ages: q.childAges.join(','), crn: '1' }),
    },
    {
      key: 'kayak',
      label: 'Kayak 比价',
      hint: '一次比各家价格',
      href: `https://www.kayak.com.au/hotels/${kayakPlace.split(",").map(encodeURIComponent).join(",")}/${q.checkin}/${q.checkout}/${q.adults}adults${kids ? `/${kids}children-${q.childAges.join('-')}` : ''}?sort=userrating_b`,
    },
    {
      key: 'parks',
      label: '连锁度假营地',
      hint: 'BIG4 / Discovery / NRMA',
      href: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(`BIG4 Discovery Parks NRMA holiday park ${where}`),
    },
  ];
}

/* ---------------- 门票 / 活动 ---------------- */

/** 门票平台的说明（「更多平台」里显示） */
export const MORE_TICKET_PLATFORMS: PlatformInfo[] = [
  { key: 'official', label: '官网', about: '景点官网直接买最稳：价格一样或更便宜，改期退票直接找景点，不经第三方' },
  { key: 'tripadvisor', label: 'Tripadvisor 玩乐', about: '看当地活动排名和点评，决定去哪个再去订' },
  { key: 'gyg', label: 'GetYourGuide', about: '大型活动 / 门票平台，大多可提前 24 小时免费取消' },
  { key: 'viator', label: 'Viator', about: 'Tripadvisor 旗下的活动预订平台，一日游和导览团多，评价和 Tripadvisor 通用' },
  { key: 'klook', label: 'Klook（客路）', about: '中文界面和客服，门票、一日游、交通卡，常有优惠码' },
  { key: 'experienceoz', label: 'Experience Oz', about: '澳洲本土的门票平台，动物园、水族馆、游船等常有组合优惠' },
  { key: 'tripcom', label: 'Trip.com 玩乐', about: '携程国际站的门票 / 一日游，中文客服' },
  { key: 'parks', label: '国家公园通票', about: 'Parks SA（南澳，含袋鼠岛弗林德斯蔡斯）/ Parks Victoria 官方门票和通票，只在官网买' },
  { key: 'club', label: 'RAA / RACV 会员折扣', about: '有道路救援会员的话，很多景点、动物园、渡轮有会员价，先查再买' },
];
export const DEFAULT_TICKET_PLATFORMS = ['official', 'tripadvisor', 'gyg', 'klook'];

/** 门票 / 活动搜索。query：景点名（英文更准）或地名 */
export function ticketSearchLinks(query: string, place = ''): SearchLink[] {
  const where = place ? placeQuery(place) : '';
  const sa = /South Australia|\bSA\b/.test(where || query);
  const q = query.trim();
  const g = (s: string) => 'https://www.google.com/search?' + qs({ q: s });
  return [
    { key: 'official', label: '官网', hint: '找官方购票页', href: g(`${q} official tickets`) },
    { key: 'tripadvisor', label: 'Tripadvisor 玩乐', hint: '活动排名和点评', href: 'https://www.tripadvisor.com.au/Search?' + qs({ q: `things to do ${q}`, ssrc: 'A' }) },
    { key: 'gyg', label: 'GetYourGuide', hint: '可免费取消的多', href: 'https://www.getyourguide.com/s/?' + qs({ q }) },
    { key: 'viator', label: 'Viator', hint: '一日游和导览', href: 'https://www.viator.com/searchResults/all?' + qs({ text: q }) },
    { key: 'klook', label: 'Klook', hint: '中文', href: g(`site:klook.com ${q}`) },
    { key: 'experienceoz', label: 'Experience Oz', hint: '澳洲本土', href: g(`site:experienceoz.com.au ${q}`) },
    { key: 'tripcom', label: 'Trip.com 玩乐', hint: '中文客服', href: g(`site:trip.com things to do ${q}`) },
    { key: 'parks', label: '国家公园通票', hint: '官方', href: sa ? 'https://www.parks.sa.gov.au/park-passes' : g(`site:parks.vic.gov.au ${q}`) },
    { key: 'club', label: 'RAA / RACV 会员', hint: '会员折扣', href: g(`${sa ? 'site:raa.com.au' : 'site:racv.com.au'} member discount ${q}`) },
  ];
}

/* ---------------- 渡轮 / 交通 ---------------- */

export const MORE_TRANSPORT_PLATFORMS: PlatformInfo[] = [
  { key: 'ferry', label: 'SeaLink 官网', about: '去袋鼠岛唯一的汽车渡轮，只有官网能订带车的船票；12 月旺季早订' },
  { key: 'ferry-deal', label: '渡轮套餐', about: 'Experience Oz 等平台有「渡轮 + 住宿 / 一日游」组合，偶尔比单买便宜' },
  { key: 'fly-ki', label: '飞袋鼠岛', about: '阿德莱德 → Kingscote 约 30 分钟（Qantas / Rex），不带车时可以考虑，到岛上再租车' },
  { key: 'rome2rio', label: 'Rome2rio', about: '两地之间开车、坐车、飞机、渡轮的方式和时间一次比完' },
  { key: 'roads', label: '路况', about: '州政府实时路况：封路、施工、山火和洪水；出发当天看一眼（维州 VicTraffic / 南澳 Traffic SA）' },
  { key: 'fuel', label: '油价', about: 'PetrolSpy 地图查附近油价，偏远路段加油站少，见到便宜的就加满' },
  { key: 'rest', label: '休息区', about: '公路休息区和厕所位置，带孩子每 2 小时停一次' },
  { key: 'parking', label: '停车', about: 'Wilson / Secure Parking 网上预订市区停车场，比现场便宜' },
  { key: 'metro', label: '公交电车', about: 'Adelaide Metro：市中心电车免费，坐电车去 Glenelg 海边；墨尔本用 PTV' },
  { key: 'ride', label: '打车', about: 'Uber、DiDi、13cabs 都在澳洲正规运营，市区里短途方便' },
  { key: 'club', label: 'RAA / RACV 会员', about: '道路救援会员：渡轮、加油、停车常有会员价，路上车坏了也靠它' },
];
export const DEFAULT_TRANSPORT_PLATFORMS = ['ferry', 'fly-ki', 'roads', 'roads-sa', 'fuel', 'rest', 'parking', 'metro'];

/** 某一天的交通平台：自驾日看路况油价休息区，渡轮日看渡轮和飞机，城市日看公交停车打车 */
export function transportLinks(from: string, to: string, opts: { ferry?: boolean; city?: boolean; date?: string } = {}): SearchLink[] {
  const a = placeQuery(from);
  const b = placeQuery(to);
  const sa = /South Australia/.test(b) || /South Australia/.test(a);
  const vic = /Victoria/.test(a) || /Victoria/.test(b);
  const town = (s: string) => s.split(',')[0].trim();
  const g = (s: string) => 'https://www.google.com/search?' + qs({ q: s });
  const links: SearchLink[] = [];
  if (opts.ferry) {
    links.push(
      { key: 'ferry', label: 'SeaLink 官网', hint: '带车渡轮', href: 'https://www.sealink.com.au/kangaroo-island/' },
      { key: 'ferry-deal', label: '渡轮套餐', hint: '组合优惠', href: g('site:experienceoz.com.au SeaLink Kangaroo Island') },
      {
        key: 'fly-ki',
        label: '飞袋鼠岛',
        hint: 'Qantas / Rex',
        href: 'https://www.google.com/travel/flights?' + qs({ q: `Flights from Adelaide to Kingscote${opts.date ? ` on ${opts.date}` : ''}` }),
      },
    );
  }
  if (!opts.city && a !== b) {
    links.push(
      { key: 'roads', label: '路况', hint: '封路施工', href: sa && !vic ? 'https://traffic.sa.gov.au/' : vic && !sa ? 'https://traffic.vicroads.vic.gov.au/' : 'https://traffic.vicroads.vic.gov.au/' },
      ...(sa && vic ? [{ key: 'roads-sa', label: '南澳路况', hint: '封路施工', href: 'https://traffic.sa.gov.au/' }] : []),
      { key: 'fuel', label: '油价', hint: 'PetrolSpy', href: 'https://petrolspy.com.au/' },
      { key: 'rest', label: '休息区', hint: '沿途', href: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(`rest area between ${town(a)} and ${town(b)}`) },
      { key: 'rome2rio', label: 'Rome2rio', hint: '各种走法', href: `https://www.rome2rio.com/map/${encodeURIComponent(town(a))}/${encodeURIComponent(town(b))}` },
    );
  }
  if (opts.city || a === b) {
    const t = town(b);
    links.push(
      ...(/Adelaide/.test(t) ? [{ key: 'metro', label: 'Adelaide Metro', hint: '电车免费区', href: 'https://www.adelaidemetro.com.au/' }] : []),
      ...(/Melbourne|Point Cook/.test(t) ? [{ key: 'metro', label: 'PTV', hint: '墨尔本公交', href: 'https://www.ptv.vic.gov.au/' }] : []),
      { key: 'parking', label: '停车', hint: 'Wilson / Secure', href: g(`${t} parking booking Wilson Secure Parking`) },
      { key: 'ride', label: '打车', hint: 'Uber / DiDi / 13cabs', href: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(`taxi ${t}`) },
    );
  }
  links.push({ key: 'club', label: sa ? 'RAA 会员' : 'RACV 会员', hint: '会员价', href: g(`${sa ? 'site:raa.com.au' : 'site:racv.com.au'} member discount ${opts.ferry ? 'SeaLink' : 'fuel parking'}`) });
  return links;
}

/** 默认显示的平台（其余在「更多平台」里，可以设为常用） */
export const DEFAULT_STAY_PLATFORMS = ['booking', 'airbnb', 'wotif', 'tripadvisor', 'google'];
export const DEFAULT_DINING_PLATFORMS = ['tripadvisor', 'google', 'google-family', 'opentable'];
const PREF_KEYS = { stay: 'travel-planner.platforms', dining: 'travel-planner.platforms.dining', ticket: 'travel-planner.platforms.ticket', transport: 'travel-planner.platforms.transport' };
export type PlatformKind = keyof typeof PREF_KEYS;
export function loadPlatformPrefs(kind: PlatformKind = 'stay'): string[] {
  const def =
    kind === 'stay' ? DEFAULT_STAY_PLATFORMS : kind === 'dining' ? DEFAULT_DINING_PLATFORMS : kind === 'ticket' ? DEFAULT_TICKET_PLATFORMS : DEFAULT_TRANSPORT_PLATFORMS;
  try {
    const v = JSON.parse(localStorage.getItem(PREF_KEYS[kind]) ?? 'null');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : def;
  } catch {
    return def;
  }
}
export function savePlatformPrefs(keys: string[], kind: PlatformKind = 'stay') {
  try {
    localStorage.setItem(PREF_KEYS[kind], JSON.stringify(keys));
  } catch {
    /* 存不了就只在这次有效 */
  }
}

export function diningSearchLinks(place: string, date: string, covers: number): SearchLink[] {
  const where = placeQuery(place);
  return [
    {
      key: 'tripadvisor',
      label: 'Tripadvisor',
      hint: '当地餐厅排名',
      href: 'https://www.tripadvisor.com.au/Search?' + qs({ q: `restaurants ${where}`, ssrc: 'e' }),
    },
    {
      key: 'google',
      label: 'Google 地图',
      hint: '高分餐厅（看评分和评论数）',
      href: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(`best restaurants ${where}`),
    },
    {
      key: 'google-family',
      label: 'Google 地图',
      hint: '适合带孩子的餐厅',
      href: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(`family friendly restaurants ${where}`),
    },
    {
      key: 'opentable',
      label: 'OpenTable',
      hint: `订位 · ${covers} 人`,
      href: 'https://www.opentable.com.au/s?' + qs({ term: where, covers: String(covers), dateTime: `${date}T18:00` }),
    },
    ...moreDiningLinks(where),
  ];
}

/** 餐厅「更多平台」：都是澳洲公认的美食指南 / 订位平台，外加中文用户常看的小红书 */
export const MORE_DINING_PLATFORMS: PlatformInfo[] = [
  { key: 'goodfood', label: 'Good Food Guide', about: '澳洲最权威的餐厅指南（《The Age》《悉尼先驱晨报》出品），「厨师帽」相当于米其林星' },
  { key: 'gourmet', label: 'Gourmet Traveller', about: '老牌美食旅行杂志，地区特色餐厅和酒庄推荐多' },
  { key: 'broadsheet', label: 'Broadsheet', about: '本地人常看的城市指南，阿德莱德、墨尔本的咖啡馆和新店最全' },
  { key: 'quandoo', label: 'Quandoo', about: '和 OpenTable 一样的在线订位平台，有的餐厅只在这里能订' },
  { key: 'tourism', label: '州旅游局', about: 'South Australia / Visit Victoria 官方网站，当地特色餐厅、酒庄和农场直营店' },
  { key: 'xhs', label: '小红书', about: '中文游客的真实笔记，找适合带孩子的店、看实拍菜品方便（个人体验，看多几篇再定）' },
];

function moreDiningLinks(where: string): SearchLink[] {
  const town = where.split(',')[0].trim();
  const site = (domain: string, extra = '') => 'https://www.google.com/search?' + qs({ q: `site:${domain} ${town}${extra}` });
  const sa = /South Australia/.test(where);
  return [
    { key: 'goodfood', label: 'Good Food Guide', hint: '获奖餐厅', href: site('goodfood.com.au') },
    { key: 'gourmet', label: 'Gourmet Traveller', hint: '地区特色', href: site('gourmettraveller.com.au') },
    { key: 'broadsheet', label: 'Broadsheet', hint: '咖啡馆和新店', href: site('broadsheet.com.au') },
    { key: 'quandoo', label: 'Quandoo', hint: '订位', href: site('quandoo.com.au') },
    { key: 'tourism', label: '州旅游局', hint: '当地特色', href: site(sa ? 'southaustralia.com' : 'visitvictoria.com', ' eat drink') },
    { key: 'xhs', label: '小红书', hint: '中文笔记', href: 'https://www.xiaohongshu.com/search_result?' + qs({ keyword: `${town} 美食 亲子` }) },
  ];
}

/** 链接属于哪个平台（显示在按钮上） */
export function platformOf(url: string): string {
  let host = '';
  try {
    host = new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '链接';
  }
  if (/booking\.com$/.test(host)) return 'Booking.com';
  if (/airbnb\./.test(host)) return 'Airbnb';
  if (/wotif\./.test(host)) return 'Wotif';
  if (/expedia\./.test(host)) return 'Expedia';
  if (/stayz\./.test(host)) return 'Stayz';
  if (/vrbo\./.test(host)) return 'Vrbo';
  if (/hotels\.com$/.test(host)) return 'Hotels.com';
  if (/agoda\./.test(host)) return 'Agoda';
  if (/trip\.com$/.test(host)) return 'Trip.com';
  if (/kayak\./.test(host)) return 'Kayak';
  if (/goodfood\.com\.au$/.test(host)) return 'Good Food Guide';
  if (/getyourguide\./.test(host)) return 'GetYourGuide';
  if (/sealink\.com\.au$/.test(host)) return 'SeaLink';
  if (/rome2rio\.com$/.test(host)) return 'Rome2rio';
  if (/petrolspy\.com\.au$/.test(host)) return 'PetrolSpy';
  if (/wilsonparking\.com\.au$/.test(host)) return 'Wilson Parking';
  if (/secureparking\.com\.au$/.test(host)) return 'Secure Parking';
  if (/adelaidemetro\.com\.au$/.test(host)) return 'Adelaide Metro';
  if (/viator\.com$/.test(host)) return 'Viator';
  if (/klook\.com$/.test(host)) return 'Klook';
  if (/experienceoz\.com\.au$/.test(host)) return 'Experience Oz';
  if (/parks\.sa\.gov\.au$/.test(host)) return 'Parks SA';
  if (/parks\.vic\.gov\.au$/.test(host)) return 'Parks Victoria';
  if (/gourmettraveller\.com\.au$/.test(host)) return 'Gourmet Traveller';
  if (/broadsheet\.com\.au$/.test(host)) return 'Broadsheet';
  if (/quandoo\./.test(host)) return 'Quandoo';
  if (/xiaohongshu\.com$|xhslink\.com$/.test(host)) return '小红书';
  if (/trivago\./.test(host)) return 'trivago';
  if (/big4\.com\.au$/.test(host)) return 'BIG4';
  if (/discoveryholidayparks\.com\.au$/.test(host)) return 'Discovery Parks';
  if (/nrmaparksandresorts\.com\.au$/.test(host)) return 'NRMA Parks';
  if (/tripadvisor\./.test(host)) return 'Tripadvisor';
  if (/opentable\./.test(host)) return 'OpenTable';
  if (/google\.|goo\.gl$|maps\.app\.goo\.gl$/.test(host)) return 'Google 地图';
  return '官网';
}

/** 订房平台（不是官网，也不是点评网站） */
export const isBookingPlatform = (url: string) =>
  ['Booking.com', 'Airbnb', 'Wotif', 'Expedia', 'Stayz', 'Vrbo', 'Hotels.com', 'Agoda', 'Trip.com'].includes(platformOf(url));

const titleCase = (s: string) =>
  s
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (/^(and|of|the|at|on|by)$/i.test(w) ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1)))
    .join(' ')
    .replace(/^./, (c) => c.toUpperCase());

/** 尽量从平台链接里读出名字；读不出返回空字符串 */
export function nameFromUrl(url: string): string {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return '';
  }
  const path = decodeURIComponent(u.pathname);
  const host = u.hostname;
  let m: RegExpMatchArray | null;
  if (/booking\.com$/.test(host) && (m = path.match(/\/hotel\/[a-z]{2}\/([^/.]+)/))) return titleCase(m[1].replace(/-amp-/g, ' & ').replace(/-/g, ' '));
  if (/tripadvisor\./.test(host) && (m = path.match(/-Reviews-([^-]+)-/))) return m[1].replace(/_/g, ' ');
  if (/(expedia|wotif)\./.test(host) && (m = path.match(/Hotels-(.+?)\.h\d+/))) return m[1].replace(/-/g, ' ');
  if (/hotels\.com$/.test(host) && (m = path.match(/\/ho\d+\/([^/]+)/))) return titleCase(m[1].replace(/-/g, ' '));
  if (/opentable\./.test(host) && (m = path.match(/\/r\/([^/]+)/))) return titleCase(m[1].replace(/-/g, ' ').replace(/\s+\d+$/, ''));
  if (/google\./.test(host) && (m = path.match(/\/maps\/place\/([^/]+)/))) return m[1].replace(/\+/g, ' ');
  return '';
}

/** 从一段粘贴的文字里找出第一个链接（App 分享出来的文字常带标题） */
export function extractUrl(text: string): { url: string; title: string } {
  const m = text.match(/https?:\/\/\S+/);
  if (!m) return { url: '', title: '' };
  const title = text.replace(m[0], '').replace(/\s+/g, ' ').trim();
  return { url: m[0].replace(/[)\]。，,]+$/, ''), title };
}
