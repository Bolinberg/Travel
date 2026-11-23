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

/** 默认显示的平台（其余在「更多平台」里，可以设为常用） */
export const DEFAULT_STAY_PLATFORMS = ['booking', 'airbnb', 'wotif', 'tripadvisor', 'google'];
const PREF_KEY = 'travel-planner.platforms';
export function loadPlatformPrefs(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(PREF_KEY) ?? 'null');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : DEFAULT_STAY_PLATFORMS;
  } catch {
    return DEFAULT_STAY_PLATFORMS;
  }
}
export function savePlatformPrefs(keys: string[]) {
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify(keys));
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
