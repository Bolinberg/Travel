/*
 * 从粘贴的预订确认 / 房源页面文字里认出：名称、入住退房日期、晚数、总价、确认号、地址、链接。
 * 先用规则（离线、即时），能用 Claude 时再让 Claude 核对一遍。
 */

export interface ParsedBooking {
  name: string;
  checkin: string; // YYYY-MM-DD，认不出为空
  checkout: string;
  nights: number; // 0 = 认不出
  total: number; // 总价（AUD），0 = 认不出
  perNight: number; // 每晚价格，0 = 认不出
  confirmation: string;
  /** 看起来是「已确认的预订」而不是房源页面 */
  confirmed: boolean;
  paid: boolean;
  address: string;
  url: string;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};
const pad = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number) => (m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${y}-${pad(m)}-${pad(d)}` : '');

/** 文字里所有日期（按出现顺序），没写年份的按 defaultYear */
export function findDates(text: string, defaultYear: number): { date: string; index: number }[] {
  const out: { date: string; index: number }[] = [];
  const add = (date: string, index: number) => date && out.push({ date, index });
  let m: RegExpExecArray | null;
  // 2026-12-12 / 2026/12/12
  const r1 = /\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/g;
  while ((m = r1.exec(text))) add(iso(+m[1], +m[2], +m[3]), m.index);
  // 12/12/2026（澳洲习惯：日/月/年）
  const r2 = /\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/g;
  while ((m = r2.exec(text))) add(iso(+m[3], +m[2], +m[1]), m.index);
  // 12 December 2026 / Sat 12 Dec / 12 Dec
  const r3 = /\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\.?,?\s*(20\d{2})?/gi;
  while ((m = r3.exec(text))) add(iso(m[3] ? +m[3] : defaultYear, MONTHS[m[2].toLowerCase()], +m[1]), m.index);
  // December 12, 2026 / Dec 12
  // 日子后面不能紧跟数字，免得把「Dec 2026」认成 12 月 20 日
  const r4 = /\b(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?!\d)(?:st|nd|rd|th)?,?\s*(20\d{2})?/gi;
  while ((m = r4.exec(text))) add(iso(m[3] ? +m[3] : defaultYear, MONTHS[m[1].toLowerCase()], +m[2]), m.index);
  // 2026年12月12日 / 12月12日
  const r5 = /(?:(20\d{2})\s*年\s*)?(\d{1,2})\s*月\s*(\d{1,2})\s*日/g;
  while ((m = r5.exec(text))) add(iso(m[1] ? +m[1] : defaultYear, +m[2], +m[3]), m.index);
  // 同一个位置被两条规则认到时只留一个
  return out
    .sort((a, b) => a.index - b.index)
    .filter((x, i, arr) => i === 0 || Math.abs(x.index - arr[i - 1].index) > 3 || x.date !== arr[i - 1].date);
}

const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

/** 「Check-in」「入住」等标签后面最近的日期 */
function dateAfter(text: string, label: RegExp, dates: { date: string; index: number }[]): string {
  const m = label.exec(text);
  if (!m) return '';
  return dates.find((d) => d.index >= m.index && d.index - m.index < 80)?.date ?? '';
}

const money = (s: string) => Number(s.replace(/,/g, ''));

function findTotal(text: string): { total: number; perNight: number } {
  const amount = String.raw`(?:AUD|AU\$|A\$|\$|US\$)\s?([\d,]+(?:\.\d{1,2})?)|([\d,]+(?:\.\d{1,2})?)\s?(?:AUD|澳元)`;
  const labelled = new RegExp(
    String.raw`(?:total(?:\s*price|\s*cost|\s*\(AUD\))?|grand total|amount (?:paid|due|charged)|you(?:'ll)? pay|price|总价|总计|合计|实付|支付金额|订单金额)[^\d$A]{0,30}(?:${amount})`,
    'gi',
  );
  let total = 0;
  let m: RegExpExecArray | null;
  while ((m = labelled.exec(text))) total = Math.max(total, money(m[1] ?? m[2]));
  const perRe = new RegExp(String.raw`(?:${amount})\s*(?:\/|per|每)\s*(?:night|晚)`, 'i');
  const pm = perRe.exec(text);
  const perNight = pm ? money(pm[1] ?? pm[2]) : 0;
  if (!total) {
    // 没有「Total」之类的标签：取文字里最大的金额
    const any = new RegExp(amount, 'gi');
    while ((m = any.exec(text))) total = Math.max(total, money(m[1] ?? m[2]));
    if (total && total === perNight) total = 0;
  }
  return { total, perNight };
}

const LABEL_LINE = /^(check[- ]?in|check[- ]?out|入住|退房|total|price|guests?|adults?|children|rooms?|confirmation|booking|reservation|pin|address|地址|电话|phone|dates?|nights?|cancell?ation|payment|你的|您的|订单|预订|确认)/i;

function findName(text: string, url: string): string {
  const pats = [
    /(?:property|hotel|accommodation|stay|住宿|酒店|房源|民宿)\s*(?:name|名称|名字)?\s*[:：]\s*(.+)/i,
    /(?:your (?:booking|reservation|stay) (?:at|for|with)|booked at|staying at)\s+(.+?)(?:\s+(?:is|has been|in|on|from)\b|[.!,\n]|$)/i,
    /(?:预订了|入住了)\s*[「“"]?([^：:\s].+?)[」”"]?(?:\s|，|。|$)/,
  ];
  for (const p of pats) {
    const m = p.exec(text);
    if (m && m[1].trim().length > 2 && m[1].trim().length < 80) return m[1].trim().replace(/[.。]$/, '');
  }
  // 第一行像名字的文字（不是标签、不是日期金额）
  for (const raw of text.split(/\n+/)) {
    const line = raw.trim();
    if (line.length < 4 || line.length > 70) continue;
    if (LABEL_LINE.test(line) || /https?:|@|\d{4}|\$/.test(line)) continue;
    if (/^(thanks|thank you|hi|dear|hello|谢谢|感谢|您好|你好)/i.test(line)) continue;
    if (/^(your|you're|you are|we're|we are|great news|good news|congrat|all set|it's booked|order|receipt|itinerary)\b|\b(is|has been) (confirmed|booked)\b|booking (confirmed|confirmation)/i.test(line)) continue;
    if (/[A-Za-z]/.test(line) && /^[A-Z0-9]/.test(line)) return line;
  }
  return url ? '' : '';
}

/** 规则识别（不联网、即时） */
export function parseBookingText(text: string, defaultYear = new Date().getFullYear()): ParsedBooking {
  const url = text.match(/https?:\/\/\S+/)?.[0].replace(/[)\]。，,]+$/, '') ?? '';
  const dates = findDates(text, defaultYear);
  let checkin = dateAfter(text, /check[- ]?in|arriv|入住|到店/i, dates);
  let checkout = dateAfter(text, /check[- ]?out|depart|退房|离店/i, dates);
  if (!checkin && dates.length) checkin = dates[0].date;
  if (!checkout) checkout = dates.map((d) => d.date).find((d) => checkin && d > checkin) ?? '';
  const nightsM = text.match(/(\d{1,2})\s*(?:-|\s)?(?:nights?|晚)/i);
  let nights = nightsM ? +nightsM[1] : 0;
  if (!nights && checkin && checkout) nights = Math.max(0, daysBetween(checkin, checkout));
  if (checkin && !checkout && nights) {
    const d = new Date(checkin + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + nights);
    checkout = d.toISOString().slice(0, 10);
  }
  const { total, perNight: per } = findTotal(text);
  const perNight = per || (total && nights ? Math.round(total / nights) : 0);
  const conf =
    text.match(/(?:confirmation|booking|reservation|itinerary)\s*(?:number|no\.?|code|reference|ref|id|#)\s*[:：#]?\s*([A-Z0-9][A-Z0-9-]{4,})/i)?.[1] ??
    text.match(/(?:确认号|订单号|预订号|确认码)\s*[:：#]?\s*([A-Z0-9-]{5,})/i)?.[1] ??
    '';
  const confirmed = !!conf || /\b(confirmed|is booked|reservation complete)\b|已确认|预订成功|预订已确认/i.test(text);
  const paid = /\b(paid|payment (?:received|taken|complete))\b|已付款|已支付|付款成功/i.test(text) && !/pay at (?:the )?property|到店付款/i.test(text);
  const address =
    text.match(/\d+[A-Za-z]?\s+[A-Za-z .'-]+(?:Road|Rd|Street|St|Avenue|Ave|Highway|Hwy|Drive|Dr|Terrace|Tce|Parade|Pde|Lane|Ln)\b[^\n]{0,60}?\b(?:VIC|SA|NSW|QLD|TAS|WA|NT|ACT)\b\s*\d{4}/i)?.[0] ?? '';
  return { name: findName(text, url), checkin, checkout, nights, total, perNight, confirmation: conf, confirmed, paid, address, url };
}

/** 粘贴的是不是一段预订 / 房源文字（而不只是一个链接） */
export const looksLikeBookingText = (text: string) => text.replace(/https?:\/\/\S+/g, '').trim().length > 30;
