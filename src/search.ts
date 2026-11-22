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
  ];
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
  if (/booking\.com$/.test(host) && (m = path.match(/\/hotel\/[a-z]{2}\/([^/.]+)/))) return titleCase(m[1].replace(/-/g, ' '));
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
