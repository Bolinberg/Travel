import Anthropic from '@anthropic-ai/sdk';
import type { Day, Place, Rec, Trip } from './types';
import { addDays } from './calc';
import { findPlace } from './geo';
import { newId } from './id';

/*
 * AI 推荐：在浏览器里直接调用 Claude（Anthropic API），
 * 让它用网络搜索核实当前仍在营业的景点 / 住宿 / 餐厅，再通过 submit_recommendations 工具返回结构化结果。
 * API Key 只保存在本设备浏览器（localStorage），不会随行程导出。
 */

export const AI_MODELS = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5（质量最好）', inPerM: 4, outPerM: 20, fallback: true },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5（更快更省）', inPerM: 2, outPerM: 10, fallback: true },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5（最便宜）', inPerM: 0.1, outPerM: 0.5, fallback: false },
] as const;

const SEARCH_PRICE = 10 / 1000; // 每次网络搜索 US$

export interface AiSettings {
  apiKey: string;
  model: string;
  preferences: string;
}

const KEY = 'travel-planner.ai';

export function loadAiSettings(): AiSettings {
  const d: AiSettings = { apiKey: '', model: AI_MODELS[0].id, preferences: '' };
  try {
    return { ...d, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return d;
  }
}

export function saveAiSettings(s: AiSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* 忽略 */
  }
}

/* ---------- 结构化输出 ---------- */

export interface AiSight {
  name: string;
  label: string;
  desc: string;
  lat: number;
  lng: number;
  wiki: string;
}
export interface AiRec {
  name: string;
  where: string;
  type: string;
  price: string;
  note: string;
}
export interface AiResult {
  sights: AiSight[];
  stays: (AiRec & { cost: number })[];
  dining: (AiRec & { meal: string })[];
}

const str = { type: 'string' } as const;
const num = { type: 'number' } as const;
const obj = (properties: Record<string, unknown>) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

const SUBMIT_TOOL: Anthropic.Beta.BetaTool = {
  name: 'submit_recommendations',
  description: '提交这一天经过核实的景点、住宿和餐饮推荐。研究完成后调用一次。',
  strict: true,
  eager_input_streaming: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['sights', 'stays', 'dining'],
    properties: {
      sights: {
        type: 'array',
        description: '当天值得停留的景点，按行车顺序排列',
        items: obj({
          name: { ...str, description: '可被地图搜索的英文名，带州/国家，如 "Twelve Apostles VIC"' },
          label: { ...str, description: '中文显示名，可附英文' },
          desc: { ...str, description: '1–2 句中文介绍，含亲子游玩建议和建议停留时间' },
          lat: { ...num, description: '纬度，4 位小数' },
          lng: { ...num, description: '经度，4 位小数' },
          wiki: { ...str, description: '对应的英文维基百科条目标题；没有就填空字符串' },
        }),
      },
      stays: {
        type: 'array',
        description: '当晚目的地的住宿；当天不过夜则为空数组',
        items: obj({
          name: { ...str, description: '准确的商家名称' },
          where: { ...str, description: '所在城镇' },
          type: { ...str, description: '中文类型，如 度假村小木屋 / 汽车旅馆 / 公寓' },
          price: { ...str, description: '中文价格说明，如 "约 $200–300/晚"' },
          cost: { ...num, description: '一家人当晚估算总价（当地货币，取区间中值）' },
          note: { ...str, description: '一句中文：为什么适合这家人' },
        }),
      },
      dining: {
        type: 'array',
        description: '当天午餐（途中）和晚餐（目的地）的餐厅',
        items: obj({
          name: { ...str, description: '准确的商家名称' },
          where: { ...str, description: '所在城镇' },
          meal: { ...str, description: '早餐 / 午餐 / 晚餐' },
          type: { ...str, description: '中文菜系/类型' },
          price: { ...str, description: '$ / $$ / $$$' },
          note: { ...str, description: '一句中文：招牌菜或适合家庭的理由，含营业时间提醒' },
        }),
      },
    },
  },
};

const SYSTEM = `你是熟悉当地的家庭自驾旅行规划师，为一个家庭的某一天行程推荐景点、住宿和餐厅。

做法：
- 用 web_search 查 Tripadvisor、Google、Wanderlog、OpenTable、官方旅游局网站等最新信息，只推荐能确认目前仍在营业的商家；查不到或已关门的不要写，宁缺毋滥，绝不编造名称。
- 景点 3–5 个，沿当天路线按行车顺序排列，适合带孩子；坐标要准确（4 位小数）。不要重复用户已列出的景点。
- 当晚需要过夜时，在目的地推荐 3 家适合家庭的住宿（价位混合，如度假村木屋、汽车旅馆、公寓），价格按出行日期的季节估算。
- 餐厅 3–5 家，覆盖途中午餐和目的地晚餐，偏家庭友好；有特别的营业时间限制要写在 note 里。
- 所有说明文字用简体中文，商家和景点名称保留英文原名。
- 研究完成后调用 submit_recommendations 提交一次，不需要再写别的文字。`;

function dayPrompt(trip: Trip, day: Day, index: number, prefs: string): string {
  const date = addDays(trip.startDate, index);
  const stops = day.stops.filter((s) => s.trim());
  const nightly = day.accommodation?.cost ? `当前住宿预算约 $${day.accommodation.cost}/晚。` : '';
  const known = [...day.stayOptions, ...day.dining].map((r) => r.name);
  return [
    `行程：${trip.name}`,
    `第 ${index + 1} 天，日期 ${date}（共 ${trip.days.length} 天）`,
    `路线：${day.from} → ${day.to}${stops.length ? `，已安排途经：${stops.join('、')}` : ''}`,
    `当天标题/备注：${day.title}${day.notes ? ` / ${day.notes}` : ''}`,
    `出行人员：${trip.adults} 位大人，${trip.children} 位小孩`,
    day.accommodation ? `当晚在 ${day.to} 过夜。${nightly}` : '当天结束行程，不需要住宿。',
    known.length ? `已有推荐（不要重复）：${known.join('、')}` : '',
    prefs.trim() ? `家庭偏好：${prefs.trim()}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

/* ---------- 校验（流式工具输入不保证完整，必须自己检查） ---------- */

const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function validateResult(input: unknown): AiResult {
  const o = input as Record<string, unknown>;
  if (!o || !Array.isArray(o.sights) || !Array.isArray(o.stays) || !Array.isArray(o.dining)) {
    throw new Error('AI 返回的数据不完整，请重试');
  }
  const rec = (r: any) => isStr(r?.name) && r.name.trim() && isStr(r.where) && isStr(r.type) && isStr(r.price) && isStr(r.note);
  return {
    sights: o.sights.filter(
      (s: any) =>
        isStr(s?.name) && s.name.trim() && isStr(s.label) && isStr(s.desc) && isNum(s.lat) && isNum(s.lng) &&
        Math.abs(s.lat) <= 90 && Math.abs(s.lng) <= 180,
    ) as AiSight[],
    stays: o.stays.filter((r: any) => rec(r) && isNum(r.cost)) as AiResult['stays'],
    dining: o.dining.filter((r: any) => rec(r) && isStr(r.meal)) as AiResult['dining'],
  };
}

/* ---------- 调用 ---------- */

export interface AiRun {
  result: AiResult;
  costUsd: number;
  searches: number;
}

export class AiError extends Error {}

/**
 * 通用调用：让 Claude（可选联网搜索）完成任务后调用指定的提交工具，返回该工具的原始输入。
 * 处理 pause_turn、忘记提交、拒绝和各类 API 错误。
 */
async function callWithSubmitTool(
  settings: AiSettings,
  opts: {
    system: string;
    prompt: string;
    tool: Anthropic.Beta.BetaTool;
    webSearch: boolean;
    onStatus: (s: string) => void;
    busyText: string;
  },
): Promise<{ input: unknown; costUsd: number; searches: number }> {
  if (!settings.apiKey.trim()) throw new AiError('请先在「设置 → AI 推荐」里填写 Anthropic API Key');
  const model = AI_MODELS.find((m) => m.id === settings.model) ?? AI_MODELS[0];
  const client = new Anthropic({ apiKey: settings.apiKey.trim(), dangerouslyAllowBrowser: true });
  const tools: Anthropic.Beta.BetaToolUnion[] = opts.webSearch
    ? [{ type: 'web_search_20260209', name: 'web_search', max_uses: 6 }, opts.tool]
    : [opts.tool];

  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: 'user', content: opts.prompt }];
  let costUsd = 0;
  let searches = 0;

  try {
    for (let attempt = 0; attempt < 6; attempt++) {
      opts.onStatus(attempt === 0 ? opts.busyText : `${opts.busyText}（继续）`);
      const stream = client.beta.messages.stream({
        model: model.id,
        max_tokens: 16000,
        output_config: { effort: 'medium' },
        system: opts.system,
        tools,
        tool_choice: { type: 'auto' },
        messages,
        // 被安全分类器拒绝时，服务端自动换模型重试
        ...(model.fallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
      });
      stream.on('contentBlock', (b) => {
        if (b.type === 'server_tool_use' && b.name === 'web_search') {
          const q = (b.input as { query?: string })?.query;
          if (q) opts.onStatus(`正在搜索：${q}`);
        }
      });
      const msg = await stream.finalMessage();

      const u = msg.usage;
      const ws = u.server_tool_use?.web_search_requests ?? 0;
      searches += ws;
      costUsd +=
        ((u.input_tokens + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0)) * model.inPerM +
          u.output_tokens * model.outPerM) / 1e6 +
        ws * SEARCH_PRICE;

      if (msg.stop_reason === 'refusal') throw new AiError('AI 拒绝了这个请求，请修改行程描述后重试');

      const submit = msg.content.find(
        (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use' && b.name === opts.tool.name,
      );
      if (submit) return { input: submit.input, costUsd, searches };

      if (msg.stop_reason === 'max_tokens') throw new AiError('AI 输出过长被截断，请重试');
      messages.push({ role: 'assistant', content: msg.content as Anthropic.Beta.BetaContentBlockParam[] });
      // pause_turn：服务端搜索循环暂停，原样续传即可；否则提醒它提交结果
      if (msg.stop_reason !== 'pause_turn') {
        messages.push({ role: 'user', content: `请调用 ${opts.tool.name} 提交结果。` });
      }
    }
    throw new AiError('AI 没有返回结果，请重试');
  } catch (e) {
    if (e instanceof AiError) throw e;
    if (e instanceof Anthropic.AuthenticationError) throw new AiError('API Key 无效，请在设置里检查');
    if (e instanceof Anthropic.PermissionDeniedError) throw new AiError('这个 API Key 没有权限使用该模型或网络搜索');
    if (e instanceof Anthropic.RateLimitError) throw new AiError('请求太频繁或额度不足，请稍后再试');
    if (e instanceof Anthropic.APIConnectionError) throw new AiError('无法连接 Anthropic，请检查网络');
    if (e instanceof Anthropic.APIError) throw new AiError(`AI 服务出错（${e.status ?? '?'}）：${e.message}`);
    throw new AiError(e instanceof Error ? e.message : String(e));
  }
}

export async function generateDayRecs(
  settings: AiSettings,
  trip: Trip,
  index: number,
  onStatus: (s: string) => void,
): Promise<AiRun> {
  const r = await callWithSubmitTool(settings, {
    system: SYSTEM,
    prompt: dayPrompt(trip, trip.days[index], index, settings.preferences),
    tool: SUBMIT_TOOL,
    webSearch: true,
    onStatus,
    busyText: 'AI 正在研究…',
  });
  return { result: validateResult(r.input), costUsd: r.costUsd, searches: r.searches };
}

/* ---------- 调整天数 ---------- */

export interface AiReplanDay {
  title: string;
  from: string;
  to: string;
  stops: string[];
  km: number;
  driveHours: number;
  overnight: boolean;
  sources: number[];
  kind: 'same' | 'merged' | 'split' | 'added' | 'edited';
  reason: string;
  notes: string;
}
export interface AiReplan {
  summary: string;
  days: AiReplanDay[];
  places: { name: string; label: string; lat: number; lng: number; desc: string }[];
}

const REPLAN_TOOL: Anthropic.Beta.BetaTool = {
  name: 'submit_itinerary',
  description: '提交调整后的逐日行程。完成规划后调用一次。',
  strict: true,
  eager_input_streaming: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['summary', 'days', 'places'],
    properties: {
      summary: { ...str, description: '2–4 句中文：调整思路、取舍了什么、需要注意什么' },
      days: {
        type: 'array',
        description: '调整后的每一天，按顺序，数量必须等于目标天数',
        items: obj({
          title: { ...str, description: '中文标题' },
          from: { ...str, description: '出发地；与原行程同一地点时必须原样使用原名称' },
          to: { ...str, description: '当天终点/过夜地；同上' },
          stops: { type: 'array', items: str, description: '途经点/景点，按顺序；尽量使用原名称' },
          km: { ...num, description: '估算驾车里程' },
          driveHours: { ...num, description: '估算驾车小时数，保留 1 位小数' },
          overnight: { type: 'boolean', description: '当晚是否需要住宿（最后一天回家为 false）' },
          sources: { type: 'array', items: { type: 'integer' }, description: '这一天的内容来自原行程第几天（从 1 开始）；全新的一天为空数组' },
          kind: { type: 'string', enum: ['same', 'merged', 'split', 'added', 'edited'], description: '与原行程相比的变化类型' },
          reason: { ...str, description: '一句中文：这一天为什么这样安排' },
          notes: { ...str, description: '中文备注/提醒，可沿用原备注' },
        }),
      },
      places: {
        type: 'array',
        description: '新方案里出现、但不在「已知地点」列表中的地点及坐标；没有则为空数组',
        items: obj({
          name: { ...str, description: '与 days 中使用的名称完全一致' },
          label: { ...str, description: '中文显示名' },
          lat: num,
          lng: num,
          desc: { ...str, description: '一句中文介绍' },
        }),
      },
    },
  },
};

const REPLAN_SYSTEM = `你是经验丰富的家庭自驾行程规划师。用户想把现有行程改成新的天数，请给出调整后的完整逐日行程。

原则：
- 第一天的出发地、最后一天的终点保持不变（通常是从家出发、回到家）。
- 有孩子同行：每天驾车尽量不超过 5–6 小时，长途日要安排休息点；缩短行程时优先删减次要景点和重复的同城日，保留最有代表性的景点；延长行程时优先拆分长途日、增加核心目的地的停留。
- 与原行程同一地点时，地名必须与原行程中的写法完全一致（系统靠名称对应坐标和住宿）；新出现的地点在 places 里给出准确坐标。
- sources 写明每一天由原行程哪几天变来，用来沿用原来的住宿和推荐。
- 说明文字用简体中文。规划完成后调用 submit_itinerary 提交一次。`;

function replanPrompt(trip: Trip, target: number, request: string, prefs: string): string {
  const days = trip.days.map((d, i) => ({
    day: i + 1,
    date: addDays(trip.startDate, i),
    title: d.title,
    from: d.from,
    to: d.to,
    stops: d.stops.filter((s) => s.trim()),
    km: d.km,
    driveHours: d.driveHours,
    overnight: d.accommodation ? `${d.accommodation.name}（$${d.accommodation.cost}${d.accommodation.booked ? '，已预订' : ''}）` : false,
    notes: d.notes,
  }));
  return [
    `行程：${trip.name}，出发日期 ${trip.startDate}，${trip.adults} 大 ${trip.children} 小，总预算 $${trip.budget}`,
    `目标：把 ${trip.days.length} 天改为 ${target} 天。`,
    request.trim() ? `用户的额外要求：${request.trim()}` : '',
    prefs.trim() ? `家庭偏好：${prefs.trim()}` : '',
    `已知地点（有坐标）：${trip.places.map((p) => p.name).join('；')}`,
    `原行程：\n${JSON.stringify(days, null, 1)}`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

export function validateReplan(input: unknown, origDays: number, target: number): AiReplan {
  const o = input as Record<string, any>;
  if (!o || !isStr(o.summary) || !Array.isArray(o.days) || !Array.isArray(o.places)) {
    throw new AiError('AI 返回的方案不完整，请重试');
  }
  const kinds = ['same', 'merged', 'split', 'added', 'edited'];
  const days: AiReplanDay[] = o.days.map((d: any, i: number) => {
    if (!d || !isStr(d.from) || !isStr(d.to) || !d.from.trim() || !d.to.trim()) {
      throw new AiError(`AI 方案第 ${i + 1} 天缺少出发地或目的地，请重试`);
    }
    return {
      title: isStr(d.title) && d.title.trim() ? d.title : `第 ${i + 1} 天`,
      from: d.from.trim(),
      to: d.to.trim(),
      stops: Array.isArray(d.stops) ? d.stops.filter(isStr).map((s: string) => s.trim()).filter(Boolean) : [],
      km: isNum(d.km) && d.km >= 0 ? Math.round(d.km) : 0,
      driveHours: isNum(d.driveHours) && d.driveHours >= 0 ? Math.round(d.driveHours * 10) / 10 : 0,
      overnight: d.overnight === true,
      sources: Array.isArray(d.sources)
        ? d.sources.filter((n: unknown) => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= origDays)
        : [],
      kind: kinds.includes(d.kind) ? d.kind : 'edited',
      reason: isStr(d.reason) ? d.reason : '',
      notes: isStr(d.notes) ? d.notes : '',
    };
  });
  if (days.length !== target) throw new AiError(`AI 给出了 ${days.length} 天，而不是 ${target} 天，请重试`);
  const places = o.places.filter(
    (p: any) => isStr(p?.name) && p.name.trim() && isNum(p.lat) && isNum(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180,
  );
  return { summary: o.summary, days, places };
}

export async function replanWithAi(
  settings: AiSettings,
  trip: Trip,
  target: number,
  request: string,
  onStatus: (s: string) => void,
): Promise<{ plan: AiReplan; costUsd: number }> {
  const r = await callWithSubmitTool(settings, {
    system: REPLAN_SYSTEM,
    prompt: replanPrompt(trip, target, request, settings.preferences),
    tool: REPLAN_TOOL,
    webSearch: false,
    onStatus,
    busyText: 'AI 正在重新规划…',
  });
  return { plan: validateReplan(r.input, trip.days.length, target), costUsd: r.costUsd };
}


/* ---------- 写回行程 ---------- */

const norm = (s: string) => s.trim().toLowerCase();

/** 把 AI 结果合并进某天：新景点加入地点库和途经点，推荐去重后追加。返回新增数量。 */
export function applyResult(trip: Trip, dayId: string, r: AiResult): { sights: number; stays: number; dining: number } {
  const day = trip.days.find((d) => d.id === dayId);
  if (!day) return { sights: 0, stays: 0, dining: 0 };
  let sights = 0;
  const onRoute = new Set([day.from, day.to, ...day.stops].map(norm));
  for (const s of r.sights) {
    const existing = findPlace(trip, s.name);
    if (existing) {
      if (!existing.desc) existing.desc = s.desc;
    } else {
      const p: Place = { name: s.name.trim(), label: s.label || s.name, lat: s.lat, lng: s.lng, desc: s.desc };
      if (s.wiki.trim()) p.wiki = s.wiki.trim();
      trip.places.push(p);
    }
    if (!onRoute.has(norm(s.name))) {
      day.stops = [...day.stops.filter((x) => x.trim()), s.name.trim()];
      onRoute.add(norm(s.name));
      sights++;
    }
  }

  const add = (list: Rec[], items: (AiRec & { cost?: number; meal?: string })[]) => {
    const have = new Set(list.map((x) => norm(x.name)));
    let n = 0;
    for (const it of items) {
      if (have.has(norm(it.name))) continue;
      have.add(norm(it.name));
      list.push({
        id: newId(),
        name: it.name.trim(),
        where: it.where,
        type: it.meal ? `${it.type} · ${it.meal}` : it.type,
        price: it.price,
        cost: it.cost && it.cost > 0 ? Math.round(it.cost) : undefined,
        note: it.note,
        picked: false,
      });
      n++;
    }
    return n;
  };

  return {
    sights,
    stays: day.accommodation ? add(day.stayOptions, r.stays) : 0,
    dining: add(day.dining, r.dining),
  };
}
