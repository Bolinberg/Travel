/*
 * 识别粘贴的餐厅信息：Google 地图 / Tripadvisor 餐厅页，或 OpenTable 等订位确认。
 */
import { findDates } from './bookingParse';

export interface ParsedDining {
  name: string;
  /** 订位日期 YYYY-MM-DD（没有订位为空） */
  date: string;
  time: string; // 如 18:30
  party: number;
  rating: string; // 如「Google 4.6（1,234 条）」
  priceLevel: string; // 如「$$」「$20–40/人」
  /** 每人估价（澳元），0 = 认不出 */
  perPerson: number;
  /** 明确写出的总价 / 订金（澳元），0 = 没写 */
  total: number;
  cuisine: string;
  address: string;
  confirmation: string;
  /** 是已确认的订位 */
  confirmed: boolean;
  url: string;
}

/** 价位符号对应的每人大致花费（澳元） */
const LEVEL_PER_PERSON: Record<number, number> = { 1: 18, 2: 35, 3: 60, 4: 95 };
const pad = (n: number) => String(n).padStart(2, '0');

function findTime(text: string): string {
  const m =
    text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i) ??
    text.match(/(?:at|@|时间[:：]?)\s*(\d{1,2}):(\d{2})/i) ??
    text.match(/(\d{1,2})[:：](\d{2})/);
  if (!m) return '';
  let h = +m[1];
  const min = m[2] ? +m[2] : 0;
  const ap = m[3]?.toLowerCase();
  if (ap === 'pm' && h < 12) h += 12;
  if (ap === 'am' && h === 12) h = 0;
  return h < 24 && min < 60 ? `${pad(h)}:${pad(min)}` : '';
}

const SKIP_LINE =
  /https?:|@|\$|★|\d[.,]\d|reviews?|open|closed|closes|opens|hours|reservation|confirmed|party|table|people|guests|directions|website|call|share|save|thanks|thank you|营业|评论|订位|谢谢/i;

export function parseDiningText(text: string, defaultYear = new Date().getFullYear()): ParsedDining {
  const url = text.match(/https?:\/\/\S+/)?.[0].replace(/[)\]。，,]+$/, '') ?? '';
  const confirmation =
    text.match(/(?:confirmation|booking|reservation)\s*(?:number|no\.?|code|reference|ref|id|#)\s*[:：#]?\s*([A-Z0-9][A-Z0-9-]{3,})/i)?.[1] ??
    text.match(/(?:确认号|订单号|订位号)\s*[:：#]?\s*([A-Z0-9-]{4,})/i)?.[1] ??
    '';
  const confirmed =
    !!confirmation ||
    /\b(reservation (?:is )?confirmed|you'?re (?:all )?set|booking confirmed|table (?:is )?booked)\b|订位成功|预订成功|已确认/i.test(text);
  const dates = findDates(text, defaultYear);
  const isReservation = confirmed || /reservation|booking|table for|party of|订位|预订/i.test(text);
  const date = isReservation ? dates[0]?.date ?? '' : '';
  const party = +(
    text.match(/(?:party of|table for)\s*(\d{1,2})/i)?.[1] ??
    text.match(/(\d{1,2})\s*(?:people|guests|persons|pax|diners|人|位)/i)?.[1] ??
    0
  );

  // 评分：Google「4.5」下一行「(1,284)」或「4.6 ★ (1,234)」；Tripadvisor「4.5 of 5 bubbles 312 reviews」
  let rating = '';
  const ta = text.match(/\b([1-5](?:\.\d)?)\s*of\s*5\s*(?:bubbles|stars)?[^\n]{0,30}?([\d,]+)\s*reviews/i);
  const g = text.match(/(?:^|\s)([1-5][.,]\d)\s*(?:★|stars?)?\s*\n?\s*\(\s*([\d,]{2,})\s*\)/m);
  if (ta) rating = `Tripadvisor ${ta[1]}/5（${ta[2]} 条）`;
  else if (g) rating = `${/tripadvisor/i.test(url + text) ? 'Tripadvisor' : 'Google'} ${g[1].replace(',', '.')}（${g[2]} 条）`;

  // 价位：「$20–40」「A$30-50」或「$$」
  let perPerson = 0;
  let priceLevel = '';
  const range = text.match(/(?:A\$|AU\$|\$)\s?(\d{1,3})\s*[–\-~至到]\s*(?:A\$|AU\$|\$)?\s?(\d{1,3})(?!\d)/);
  if (range) {
    perPerson = Math.round((+range[1] + +range[2]) / 2);
    priceLevel = `$${range[1]}–${range[2]}/人`;
  } else {
    const lv = text.match(/(?:^|[\s·•|,])(\${1,4})(?=$|[\s·•|,-])/m);
    if (lv) {
      priceLevel = lv[1];
      perPerson = LEVEL_PER_PERSON[lv[1].length];
    }
  }
  const totalM = text.match(/(?:total|deposit|prepaid|合计|总价|实付|订金)[^\d$]{0,20}(?:A\$|AU\$|\$|AUD)\s?([\d,]+(?:\.\d{1,2})?)/i);
  const total = totalM ? Number(totalM[1].replace(/,/g, '')) : 0;

  const cuisine =
    text.match(/\b(Modern Australian|Fish (?:&|and) chips|Seafood|Italian|Pizza|Thai|Chinese|Japanese|Indian|Mexican|Burgers?|Cafe|Café|Bakery|Pub|Steakhouse|Australian|Vietnamese|Greek|German|Korean)\b/i)?.[0] ??
    text.match(/(海鲜|意大利菜|披萨|泰国菜|中餐|日料|印度菜|汉堡|咖啡馆|面包店|酒馆|牛排|炸鱼薯条|德国菜|韩国菜)/)?.[0] ??
    '';
  const address =
    text.match(/\d+[A-Za-z]?\s+[A-Za-z .'-]+(?:Road|Rd|Street|St|Avenue|Ave|Highway|Hwy|Drive|Dr|Terrace|Tce|Parade|Pde|Lane|Ln|Esplanade)\b[^\n]{0,60}?\b(?:VIC|SA|NSW|QLD|TAS|WA|NT|ACT)\b(?:\s*\d{4})?/i)?.[0] ??
    text.match(/[A-Za-z .'-]+(?:Road|Rd|Street|St|Parade|Pde|Esplanade)\b[^\n]{0,40}?\b(?:VIC|SA|NSW|QLD|TAS|WA|NT|ACT)\b(?:\s*\d{4})?/)?.[0]?.trim() ??
    '';

  // 名字：「table at X」「Restaurant: X」，否则第一行像名字的文字
  let name =
    text.match(/(?:reservation|booking|table)\s+(?:at|with)\s+(.+?)(?:\s+(?:is|on|for)\b|[.!,\n]|$)/i)?.[1]?.trim() ??
    text.match(/(?:restaurant|餐厅|店名)\s*(?:name|名称)?\s*[:：]\s*(.+)/i)?.[1]?.trim() ??
    '';
  if (!name) {
    for (const raw of text.split(/\n+/)) {
      const line = raw.trim();
      if (line.length < 3 || line.length > 60 || SKIP_LINE.test(line) || /^#\d/.test(line)) continue;
      if (/^[\d\s.,()]+$/.test(line)) continue;
      if (/[A-Za-z一-龥]/.test(line)) {
        name = line;
        break;
      }
    }
  }
  return { name, date, time: findTime(text), party, rating, priceLevel, perPerson, total, cuisine, address, confirmation, confirmed, url };
}

/** 粘贴的是餐厅（而不是住宿）吗 */
export const looksLikeDining = (text: string) =>
  /restaurant|opentable|table for|party of|covers|dine|dinner|lunch|brunch|cafe|café|bistro|pizzeria|menu|cuisine|seafood|餐厅|订位|餐馆|午餐|晚餐|菜单/i.test(text) &&
  !/check[- ]?in|check[- ]?out|入住|退房|\bnights?\b/i.test(text);
