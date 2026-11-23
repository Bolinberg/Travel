/*
 * 识别粘贴的门票 / 渡轮确认：SeaLink 渡轮、动物园电子票、景点和国家公园门票等。
 */
import { findDates } from './bookingParse';

export interface ParsedTicket {
  /** 显示用的标题，如「SeaLink 渡轮往返」「阿德莱德动物园门票」 */
  title: string;
  kind: 'ferry' | 'ticket';
  /** 第一个日期（去程 / 入园日），YYYY-MM-DD */
  date: string;
  /** 往返的回程日期 */
  returnDate: string;
  /** 时间说明，如「去程 10:00 Cape Jervis → Penneshaw；回程 16:30」 */
  times: string;
  people: string; // 如「2 大 2 小」
  vehicle: string;
  total: number;
  confirmation: string;
  paid: boolean;
  confirmed: boolean;
  url: string;
}

/** 认识的景点 / 交通：标题、类别，以及用来对上「要订的」里已有项目的关键词 */
export const KNOWN_TICKETS: { re: RegExp; title: string; kind: 'ferry' | 'ticket'; match: RegExp; en: string }[] = [
  { re: /sealink|kangaroo island ferr|ki ferr|cape jervis.*penneshaw|penneshaw.*cape jervis/i, title: 'SeaLink 渡轮往返', kind: 'ferry', match: /sealink|渡轮/i, en: 'SeaLink Kangaroo Island ferry' },
  { re: /halls gap zoo/i, title: 'Halls Gap 动物园家庭票', kind: 'ticket', match: /halls gap 动物园|halls gap zoo/i, en: 'Halls Gap Zoo' },
  { re: /adelaide zoo|zoos sa|giant panda/i, title: '阿德莱德动物园家庭票', kind: 'ticket', match: /阿德莱德动物园|adelaide zoo/i, en: 'Adelaide Zoo' },
  { re: /seal bay/i, title: '海狮湾门票', kind: 'ticket', match: /海狮湾|seal bay/i, en: 'Seal Bay Conservation Park' },
  { re: /kangaroo island wildlife park|ki wildlife park/i, title: '袋鼠岛野生动物园家庭票', kind: 'ticket', match: /野生动物园|wildlife park/i, en: 'Kangaroo Island Wildlife Park' },
  { re: /flinders chase|park pass|parks sa|national parks? (?:entry|pass)/i, title: '弗林德斯蔡斯国家公园门票', kind: 'ticket', match: /国家公园|flinders chase|park pass/i, en: 'Flinders Chase National Park' },
  { re: /little sahara|sandboard/i, title: '小撒哈拉滑沙板租用', kind: 'ticket', match: /滑沙|sandboard|little sahara/i, en: 'Little Sahara sandboarding Kangaroo Island' },
  { re: /sovereign hill/i, title: 'Sovereign Hill 淘金镇门票', kind: 'ticket', match: /sovereign hill/i, en: 'Sovereign Hill Ballarat' },
];

const pad = (n: number) => String(n).padStart(2, '0');

function times(text: string): string[] {
  const out: string[] = [];
  const re = /\b(\d{1,2})[:.](\d{2})\s*(am|pm)?\b|\b(\d{1,2})\s*(am|pm)\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    let h = +(m[1] ?? m[4]);
    const min = m[2] ? +m[2] : 0;
    const ap = (m[3] ?? m[5])?.toLowerCase();
    if (ap === 'pm' && h < 12) h += 12;
    if (ap === 'am' && h === 12) h = 0;
    if (h < 24 && min < 60) out.push(`${pad(h)}:${pad(min)}`);
  }
  return out;
}

export function parseTicketText(text: string, defaultYear = new Date().getFullYear()): ParsedTicket {
  const url = text.match(/https?:\/\/\S+/)?.[0].replace(/[)\]。，,]+$/, '') ?? '';
  const known = KNOWN_TICKETS.find((k) => k.re.test(text));
  const isFerry = known?.kind === 'ferry' || /\bferry\b|sailing|vessel|渡轮|船票/i.test(text);
  const dates = [...new Set(findDates(text, defaultYear).map((d) => d.date))];
  const ts = times(text);
  const ret = /\breturn\b|往返|回程/i.test(text) && dates.length > 1 ? dates[1] : '';
  let timeText = '';
  if (isFerry) {
    const from = text.match(/(?:depart(?:ing|s)?|from)\s*[:：]?\s*(Cape Jervis|Penneshaw)/i)?.[1];
    const to = text.match(/(?:arriv(?:ing|es)?|to)\s*[:：]?\s*(Cape Jervis|Penneshaw)/i)?.[1];
    // 回程时间：「Return / 回程」之后出现的第一个时间
    const retAt = text.search(/\breturn\b|回程/i);
    const retTime = ret && retAt >= 0 ? times(text.slice(retAt))[0] : '';
    timeText = [
      ts[0] && `去程 ${ts[0]}${from && to ? ` ${from} → ${to}` : ''}`,
      retTime && `回程 ${retTime}`,
    ]
      .filter(Boolean)
      .join('；');
  } else if (ts[0]) {
    timeText = `${ts[0]} 入场`;
  }
  const a = text.match(/(\d+)\s*(?:x\s*)?adults?/i)?.[1] ?? text.match(/(?:adults?|成人|大人)\s*[:：x×]?\s*(\d+)/i)?.[1];
  const c = text.match(/(\d+)\s*(?:x\s*)?(?:child(?:ren)?|kids?)/i)?.[1] ?? text.match(/(?:child(?:ren)?|儿童|小孩)\s*[:：x×]?\s*(\d+)/i)?.[1];
  const family = /family/i.test(text) ? '家庭票' : '';
  const people = [a && `${a} 大`, c && `${c} 小`].filter(Boolean).join(' ') || family;
  const vehicle = isFerry ? (text.match(/\b(car|vehicle|sedan|suv|4wd)\b[^\n]{0,30}/i)?.[0]?.trim() ?? '') : '';
  const labelled = [...text.matchAll(/(?:total(?: paid| price| amount| cost)?|amount (?:paid|charged)|grand total|you paid|order total|合计|总价|实付|支付金额)[^\d$A]{0,25}(?:AUD|AU\$|A\$|\$)\s?([\d,]+(?:\.\d{1,2})?)/gi)].map((m) =>
    Number(m[1].replace(/,/g, '')),
  );
  let total = labelled.length ? Math.max(...labelled) : 0;
  if (!total) {
    const any = [...text.matchAll(/(?:AUD|AU\$|A\$|\$)\s?([\d,]+(?:\.\d{1,2})?)/g)].map((m) => Number(m[1].replace(/,/g, '')));
    total = any.length ? Math.max(...any) : 0;
  }
  const confirmation =
    text.match(/(?:booking|confirmation|order|reservation|reference|ticket|transaction)\s*(?:number|no\.?|code|reference|ref|id|#)?\s*[:：#]\s*([A-Z0-9][A-Z0-9-]{3,})/i)?.[1] ??
    text.match(/(?:booking|order|confirmation|reference)\s*#\s*([A-Z0-9][A-Z0-9-]{3,})/i)?.[1] ??
    text.match(/(?:订单号|确认号|预订号|票号)\s*[:：#]?\s*([A-Z0-9-]{4,})/)?.[1] ??
    '';
  const paid =
    /\b(paid|payment (?:received|successful|complete)|tax invoice|receipt)\b|已付款|已支付|支付成功/i.test(text) && !/(?:pay|payment) (?:on arrival|at the gate|due)|到场付款/i.test(text);
  const confirmed = !!confirmation || /\bconfirm(?:ed|ation)\b|your tickets?|e-?tickets?|已确认|预订成功|出票成功/i.test(text);
  let title = known?.title ?? '';
  if (!title) {
    for (const raw of text.split(/\n+/)) {
      const line = raw.trim();
      if (line.length < 4 || line.length > 60) continue;
      if (/https?:|@|\$|\d{4}|^(thanks|thank you|hi|dear|hello|your|order|booking|confirmation|total|date|time)/i.test(line)) continue;
      title = line;
      break;
    }
    title = title || (isFerry ? '渡轮' : '门票');
  }
  return { title, kind: isFerry ? 'ferry' : 'ticket', date: dates[0] ?? '', returnDate: ret, times: timeText, people, vehicle, total, confirmation, paid, confirmed, url };
}

/** 粘贴的是门票 / 渡轮确认吗（住宿和餐厅之外） */
export const looksLikeTicket = (text: string) =>
  KNOWN_TICKETS.some((k) => k.re.test(text)) ||
  /\b(ferry|sailing|e-?tickets?|tickets?|admission|entry pass|park pass|tour)\b|渡轮|船票|门票|入场券|电子票/i.test(text);
