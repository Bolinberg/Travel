/*
 * 「记一笔」粘贴识别：收据、银行 / 信用卡消费通知、对账单里复制的几行。
 * 一段文字可能是一笔（收据，有 TOTAL），也可能是几笔（对账单每行一笔）。
 */
import type { Category } from './types';
import { findDates } from './bookingParse';

export interface ParsedExpense {
  title: string;
  amount: number;
  /** YYYY-MM-DD，认不出为空 */
  date: string;
  category: Category;
}

/** 按商户 / 文字猜类别（加油站 → 油费，超市和餐饮 → 餐饮，停车过路 → 交通 …） */
export function categorize(text: string): Category {
  const t = text.toLowerCase();
  if (/\b(bp|shell|ampol|caltex|7-?eleven|united petroleum|liberty|puma|mobil|metro petroleum)\b|unleaded|diesel|petrol|\bfuel\b|litres?\b|加油|汽油|柴油/.test(t)) return 'fuel';
  if (/motel|hotel|apartment|airbnb|holiday park|caravan park|lodge|cabin|booking\.com|住宿|酒店/.test(t)) return 'accommodation';
  if (/parking|wilson|secure park|care park|\btoll\b|linkt|citylink|eastlink|sealink|ferry|\bbus\b|tram|train|adelaide metro|myki|停车|过路费|渡轮|车费|洗车|car wash/.test(t)) return 'transport';
  // 礼品店要在「动物园 / 博物馆」之前判断（Adelaide Zoo Gift Shop 是购物）
  if (/kmart|\btarget\b|big w|souvenir|gift shop|newsagent|chemist|pharmacy|纪念品|购物|药/.test(t)) return 'shopping';
  if (/ticket|admission|zoo|museum|gallery|park pass|national park|tour|cruise|sandboard|wildlife|sovereign hill|门票|动物园|博物馆|游船|滑沙/.test(t)) return 'activity';
  if (/coles|woolworths|\baldi\b|\biga\b|foodland|drakes|supermarket|cafe|café|coffee|restaurant|bakery|bistro|pub|hotel bar|mcdonald|kfc|hungry jack|subway|pizza|fish ?& ?chips|ice ?cream|gelato|\bfood\b|超市|咖啡|餐|饭|面包|冰淇淋|零食|早餐|午餐|晚餐/.test(t)) return 'food';
  return 'other';
}

const AMOUNT = /(?:-\s*)?(?:AUD|AU\$|A\$|\$)\s?([\d,]+\.\d{2}|[\d,]+)(?!\d)|([\d,]+\.\d{2})\s*(?:AUD|澳元)?(?=\s|$)/g;
const num = (s: string) => Number(s.replace(/,/g, ''));

/** 去掉金额、日期、卡号等，剩下的当商户名 */
function cleanTitle(line: string): string {
  return line
    .replace(AMOUNT, ' ')
    .replace(/\b\d{1,2}[/.-]\d{1,2}(?:[/.-]\d{2,4})?\b/g, ' ')
    .replace(/\b\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\.?(?:\s+20\d{2})?/gi, ' ')
    .replace(/\b(mon|tue|wed|thu|fri|sat|sun)[a-z]*\b,?/gi, ' ')
    .replace(/\b(visa|mastercard|eftpos|debit|credit|card|purchase|pos|tap|contactless|aus|au|australia|ref\S*|x{2,}\d+|\*{2,}\d+|\d{4,})\b/gi, ' ')
    .replace(/(you(?:'ve)? (?:spent|paid|made a purchase of)|spent|paid|purchase of|at|on|消费|支付|在)\s/gi, ' ')
    .replace(/[|•·:：]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 50);
}

/** 一段文字 → 若干笔开销 */
export function parseExpenseText(text: string, defaultYear = new Date().getFullYear()): ParsedExpense[] {
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const withAmount = lines.filter((l) => new RegExp(AMOUNT.source).test(l));
  const hasTotal = /\b(total|amount due|amount paid|balance due)\b|合计|总计|实付|应付/i.test(text);
  const notification = /you(?:'ve)? (?:spent|paid|made a purchase)|purchase (?:of|at)|消费|支付了/i.test(text);

  // 对账单：好几行各有金额、没有合计 → 每行一笔
  if (withAmount.length >= 2 && !hasTotal && !notification) {
    return withAmount
      .map((l) => {
        const m = new RegExp(AMOUNT.source).exec(l)!;
        const date = findDates(l, defaultYear)[0]?.date ?? '';
        const title = cleanTitle(l) || '一笔开销';
        return { title, amount: num(m[1] ?? m[2]), date, category: categorize(l) };
      })
      .filter((e) => e.amount > 0);
  }

  // 收据 / 通知：一笔
  let amount = 0;
  const totalM = text.match(/(?:total|amount (?:due|paid)|balance due|合计|总计|实付|应付)[^\d$A]{0,20}(?:AUD|AU\$|A\$|\$)?\s?([\d,]+\.\d{2}|[\d,]+)(?!\d)/i);
  if (totalM) amount = num(totalM[1]);
  if (!amount) {
    const all = [...text.matchAll(AMOUNT)].map((m) => num(m[1] ?? m[2]));
    amount = notification ? all[0] ?? 0 : all.length ? Math.max(...all) : 0;
  }
  const date = findDates(text, defaultYear)[0]?.date ?? '';
  const merchant =
    text.match(/(?:at|merchant|商户|在)\s*[:：]?\s*([A-Za-z0-9&'’ .-]{3,40}?)(?:\s+(?:on|for|using|with)\b|[,.]\s|\n|$)/i)?.[1]?.trim() ??
    cleanTitle(lines.find((l) => /[A-Za-z一-龥]{3,}/.test(cleanTitle(l))) ?? '');
  return amount > 0 ? [{ title: merchant || '一笔开销', amount, date, category: categorize(text) }] : [];
}
