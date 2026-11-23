/*
 * 清单粘贴识别：行李清单、备忘录、聊天里的待办……拆成一条条，分到合适的分组，去掉已有的。
 */

export interface ParsedItem {
  text: string;
  group: string;
  done: boolean;
}

/** 地名别名：分组名是地名时，用来认出条目属于哪个地方 */
const PLACE_ALIASES: Record<string, RegExp> = {
  阿德莱德: /阿德莱德|adelaide|动物园|熊猫|博物馆|美术馆|植物园|glenelg|中央市场/i,
  袋鼠岛: /袋鼠岛|kangaroo island|\bki\b|渡轮|sealink|海狮湾|seal bay|弗林德斯|flinders|滑沙|penneshaw|kingscote/i,
  格兰扁: /格兰扁|grampians|halls gap|pinnacle/i,
  大洋路: /大洋路|great ocean road|十二门徒|apostles|lorne|apollo bay/i,
  甘比尔山: /甘比尔|mount gambier|蓝湖|blue lake/i,
};

/** 不在任何地名分组时，按内容分到通用分组 */
const TOPICS: [string, RegExp][] = [
  ['行李', /衣|裤|鞋|袜|帽|外套|泳|毛巾|防晒|太阳镜|墨镜|驱蚊|药|急救|创可贴|充电|数据线|充电宝|插头|转换|相机|望远镜|水杯|水壶|零食|纸巾|湿巾|牙刷|洗漱|睡衣|玩具|书|平板|ipad|耳机|安全座椅|垃圾袋|雨伞|jacket|hat|sunscreen|sunglasses|swim|towel|charger|cable|power ?bank|adapter|camera|snacks|water bottle|medicine|first aid|toothbrush|pyjamas|toys|headphones|insect repellent|umbrella/i],
  ['出发前', /订|预约|预订|确认|检查|保养|下载|保险|驾照|证件|护照|签证|兑换|换钱|通知|办理|打印|充值|续|book|reserve|confirm|check|service|download|insurance|licen[cs]e|passport|print|renew|top up|cancel/i],
  ['路上注意', /开车|驾驶|休息|限速|袋鼠|野生动物|黄昏|夜间|加油|时差|慢 ?30|检疫|水果|疲劳|天黑|drive|driving|rest|speed|kangaroos?|wildlife|dusk|fuel|fruit|quarantine|fatigue/i],
];

const BULLET = /^\s*(?:[-*•·◦▪▫‣⁃–—>]+|\d{1,3}[.)、]|[a-z][.)]|[（(]?\d{1,3}[）)]|[①-⑳]|☐|□|◻|⬜|🔲|\[\s?[xX✓✔ ]?\s?\])\s*/;
const DONE = /^\s*(?:[-*•]?\s*)?(?:\[\s?[xX✓✔]\s?\]|[✓✔✅☑]|~~)|~~\s*$|（已完成）|\(done\)|已完成$|已买$|已订$/i;

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[\s,，。.、;；:：!！?？()（）[\]"“”'‘’~～/\\-]/g, '')
    .replace(/[✓✔✅☑]/g, '');

/** 是否和已有条目重复（标准化后包含关系） */
export function isDuplicate(text: string, existing: string[]): boolean {
  return norm(text).length < 2 || findDuplicate(text, existing) >= 0;
}

/** 和哪一条已有条目重复（下标），没有返回 -1 */
export function findDuplicate(text: string, existing: string[]): number {
  const n = norm(text);
  if (n.length < 2) return -1;
  return existing.findIndex((e) => {
    const m = norm(e);
    if (m === n || (n.length >= 4 && m.includes(n)) || (m.length >= 4 && n.includes(m))) return true;
    // 已有条目里用顿号等列了好几样（如「防晒霜、帽子、太阳镜」），逐样比
    return e.split(/[、，,;；/]/).some((part) => norm(part) === n);
  });
}

/** 去掉开头的符号（可能有好几层，如「- [x] 」） */
const stripBullets = (l: string) => {
  let s = l;
  for (let k = 0; k < 3; k++) s = s.replace(BULLET, '');
  return s;
};

/** 选分组：标题行 > 地名分组 > 内容关键词 > 默认 */
export function pickGroup(text: string, groups: string[], heading = ''): string {
  if (heading) {
    const hit = groups.find((g) => norm(heading).includes(norm(g)) || norm(g).includes(norm(heading)));
    if (hit) return hit;
  }
  for (const g of groups) {
    const re = PLACE_ALIASES[g];
    if ((re && re.test(text)) || text.includes(g)) return g;
  }
  for (const [g, re] of TOPICS) if (re.test(text)) return groups.includes(g) ? g : g;
  return heading || groups[0] || '其他';
}

/** 一段文字 → 若干条清单 */
export function parseChecklistText(text: string, groups: string[]): ParsedItem[] {
  const out: ParsedItem[] = [];
  let heading = '';
  const lines = text
    .replace(/\r/g, '')
    .split('\n')
    .flatMap((l) => {
      // 一行里用「、；;」或「，」分隔的短条目（如「防晒霜、帽子、泳衣」）也拆开
      const stripped = stripBullets(l);
      const parts = stripped.split(/[、；;]|，(?=\S{1,8}(?:，|$))/).map((x) => x.trim()).filter(Boolean);
      return parts.length > 1 && parts.every((p) => p.length <= 14) ? parts.map((p) => (BULLET.test(l) ? `- ${p}` : p)) : [l];
    });

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    // 标题行：Markdown 标题、以冒号结尾、或不带符号的短行后面紧跟条目
    const md = line.match(/^#{1,6}\s*(.+)$/);
    const colon = line.match(/^([^:：]{1,16})[:：]\s*$/);
    if (md || colon) {
      heading = (md?.[1] ?? colon![1]).replace(/[*_]/g, '').trim();
      continue;
    }
    const done = DONE.test(line) || DONE.test(stripBullets(line));
    const textOnly = stripBullets(line)
      .replace(/^[✓✔✅☑]\s*/, '')
      .replace(/~~/g, '')
      .replace(/（已完成）|\(done\)|已完成$/i, '')
      .replace(/\*\*/g, '')
      .trim();
    if (textOnly.length < 2 || /^(清单|checklist|to ?do|packing list|行李清单)$/i.test(textOnly)) continue;
    if (textOnly.length > 120) continue; // 一大段说明文字不当作清单项
    out.push({ text: textOnly, group: pickGroup(textOnly, groups, heading), done });
  }
  return out;
}
