import Anthropic from '@anthropic-ai/sdk';
import type { Category, Day, Place, Rec, Trip } from './types';
import { addDays } from './calc';
import { findPlace } from './geo';
import { insertStop } from './route';
import { newId } from './id';
import type { ParsedBooking } from './bookingParse';
import type { ParsedDining } from './diningParse';
import type { ParsedTicket } from './ticketParse';
import type { ParsedExpense } from './expenseParse';
import type { ParsedItem } from './checklistParse';

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
  /** 方案的短名（自然语言调整时给出） */
  title?: string;
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

export function validateReplan(input: unknown, origDays: number, target: number | null): AiReplan {
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
  if (target !== null && days.length !== target) throw new AiError(`AI 给出了 ${days.length} 天，而不是 ${target} 天，请重试`);
  if (!days.length || days.length > 40) throw new AiError('AI 给出的天数不合理，请换个说法再试');
  const places = o.places.filter(
    (p: any) => isStr(p?.name) && p.name.trim() && isNum(p.lat) && isNum(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180,
  );
  const title = isStr(o.title) ? o.title.trim().slice(0, 24) : '';
  return { title, summary: o.summary, days, places };
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


/* ---------- 用自然语言调整行程 ---------- */

const EDIT_RULES = `你是经验丰富的家庭自驾行程规划师，正在帮一家人修改行程。按用户这句话修改下面的行程，给出修改后的完整逐日行程。

规则：
- 只改用户要求的部分；没有提到的日子原样保留（from、to、stops、km、driveHours、notes 都照抄），kind 填 "same"。
- 天数可以增减；除非用户要求，第一天的出发地和最后一天的终点保持不变。
- 有孩子同行：每天驾车尽量不超过 5 小时；超过时在 reason 里说明。
- 同一地点必须使用原行程或「已知地点」里完全相同的名称；新出现的地点在 places 里给出准确坐标（纬度、经度 4 位小数）。
- km、driveHours 按实际道路估算；sources 写明每一天由原行程第几天变来（从 1 开始，全新的一天为空数组）。
- 用户的话含糊时做最小的合理改动，并在 summary 里说明你的理解。
- 所有说明用简体中文。`;

const EDIT_FORMAT = `只回复一个 JSON 对象，不要其他文字，格式：
{"title":"不超过 12 个字的方案名","summary":"2–4 句：改了什么、为什么、要注意什么",
 "days":[{"title":"","from":"","to":"","stops":["途经点"],"km":0,"driveHours":0,"overnight":true,
   "sources":[1],"kind":"same|merged|split|added|edited","reason":"一句话","notes":""}],
 "places":[{"name":"新地点名称","label":"中文名","lat":0,"lng":0,"desc":"一句介绍"}]}`;

function editPrompt(trip: Trip, instruction: string, prefs: string): string {
  const days = trip.days.map((d, i) => ({
    day: i + 1,
    date: addDays(trip.startDate, i),
    title: d.title,
    from: d.from,
    to: d.to,
    stops: d.stops.filter((x) => x.trim()),
    km: d.km,
    driveHours: d.driveHours,
    ...(d.mode && d.mode !== 'drive' ? { mode: d.mode } : {}),
    overnight: d.accommodation ? d.accommodation.name : false,
    notes: d.notes.slice(0, 160),
  }));
  return [
    `行程：${trip.name}，出发日期 ${trip.startDate}，${trip.adults} 大 ${trip.children} 小，总预算 $${trip.budget}`,
    prefs.trim() ? `家庭偏好：${prefs.trim()}` : '',
    `已知地点（有坐标）：${trip.places.map((p) => p.name).join('；')}`,
    `当前行程：\n${JSON.stringify(days)}`,
    `用户要求：${instruction.trim()}`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

const EDIT_TOOL: Anthropic.Beta.BetaTool = {
  ...REPLAN_TOOL,
  description: '提交按用户要求修改后的完整逐日行程。完成后调用一次。',
  input_schema: {
    ...REPLAN_TOOL.input_schema,
    required: ['title', 'summary', 'days', 'places'],
    properties: {
      title: { ...str, description: '不超过 12 个字的方案名' },
      ...(REPLAN_TOOL.input_schema as { properties: Record<string, unknown> }).properties,
    },
  } as Anthropic.Beta.BetaTool['input_schema'],
};

type SampleFn = ((input: string, opts?: object) => Promise<{ text: string }>) & {
  json: <T = unknown>(input: string, opts?: object) => Promise<T>;
};
let samplePromise: Promise<SampleFn | null> | null = null;

/** 在 Claude 里打开时，页面可以直接请 Claude 帮忙（sample 能力）；网页版没有 */
export function claudeSample(): Promise<SampleFn | null> {
  if (!samplePromise) {
    const c = (globalThis as { claude?: { use?: (n: string) => Promise<unknown> } }).claude;
    samplePromise = c?.use ? (c.use('sample') as Promise<SampleFn | null>).catch(() => null) : Promise.resolve(null);
  }
  return samplePromise;
}

/** 自然语言调整能用哪种方式：Claude 页面里的 Claude / 网页版的 API Key / 不可用 */
export async function editEngine(): Promise<'claude' | 'api' | null> {
  if (await claudeSample()) return 'claude';
  return loadAiSettings().apiKey.trim() ? 'api' : null;
}

const SAMPLE_ERRORS: Record<string, string> = {
  not_granted: '没有允许这个页面使用 Claude。可以在页面的权限设置里打开。',
  sampling_disabled: '这个账号暂时不能在页面里使用 Claude。',
  rate_limited: '请求太频繁或已达到使用上限，请稍后再试。',
  refused: 'Claude 没有处理这条要求，换个说法试试。',
  invalid_json: 'Claude 返回的格式不对，请再试一次。',
  empty_completion: 'Claude 没有给出结果，请换个说法再试。',
  session_expired: '登录已过期，请重新登录 Claude。',
};

export async function editPlanWithAi(
  trip: Trip,
  instruction: string,
  onStatus: (s: string) => void,
  signal?: AbortSignal,
): Promise<{ plan: AiReplan; engine: 'claude' | 'api'; costUsd?: number }> {
  const settings = loadAiSettings();
  const sample = await claudeSample();
  const prompt = editPrompt(trip, instruction, settings.preferences);
  if (sample) {
    onStatus('Claude 正在思考…');
    try {
      const data = await sample.json(`${EDIT_RULES}\n\n${prompt}\n\n${EDIT_FORMAT}`, {
        cache: false,
        signal,
        onText: () => onStatus('Claude 正在写新的行程…'),
      });
      return { plan: validateReplan(data, trip.days.length, null), engine: 'claude' };
    } catch (e) {
      if (e instanceof AiError) throw e;
      const code = (e as { code?: string })?.code ?? '';
      if (code === 'cancelled') throw new AiError('已取消');
      throw new AiError(SAMPLE_ERRORS[code] ?? '暂时连不上 Claude，请稍后再试。');
    }
  }
  if (!settings.apiKey.trim()) {
    throw new AiError('在 Claude 里打开这个页面就能直接用；网页版需要先在「设置 → AI 推荐」填写 API Key。');
  }
  const r = await callWithSubmitTool(settings, {
    system: EDIT_RULES,
    prompt,
    tool: EDIT_TOOL,
    webSearch: false,
    onStatus,
    busyText: 'AI 正在改行程…',
  });
  return { plan: validateReplan(r.input, trip.days.length, null), engine: 'api', costUsd: r.costUsd };
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
      day.stops = insertStop(trip, day, s.name.trim());
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

/* ---------------- 识别粘贴的预订确认 ---------------- */

const BOOKING_PROMPT = `下面是用户从邮件或网页复制来的一段住宿预订确认（也可能只是房源页面）。只根据文字内容提取信息，不要猜测或编造；文字里没有的字段用空字符串或 0。
只回复一个 JSON 对象，不要其他文字：
{"name":"住宿名称（酒店/房源的名字，不是客人姓名）","checkin":"YYYY-MM-DD","checkout":"YYYY-MM-DD","nights":整数,"total":总价数字（含清洁费等的最终合计，澳元）,"confirmation":"确认号/订单号","confirmed":是否是已确认的预订(true/false),"paid":是否已付款(true/false),"address":"地址"}
没写年份的日期按 {YEAR} 年。`;

/** 让 Claude 核对规则识别的结果；没有可用的 Claude 或出错时返回 null（静默，不打扰用户） */
export async function aiParseBooking(text: string, year: number): Promise<Partial<ParsedBooking> | null> {
  const prompt = `${BOOKING_PROMPT.replace('{YEAR}', String(year))}\n\n<pasted>\n${text.slice(0, 6000)}\n</pasted>`;
  const clean = (o: Record<string, unknown> | null): Partial<ParsedBooking> | null => {
    if (!o || typeof o !== 'object') return null;
    const str = (k: string) => (typeof o[k] === 'string' ? (o[k] as string).trim() : '');
    const num = (k: string) => (typeof o[k] === 'number' && Number.isFinite(o[k]) ? (o[k] as number) : 0);
    const date = (k: string) => (/^\d{4}-\d{2}-\d{2}$/.test(str(k)) ? str(k) : '');
    return {
      name: str('name'),
      checkin: date('checkin'),
      checkout: date('checkout'),
      nights: Math.round(num('nights')),
      total: num('total'),
      confirmation: str('confirmation'),
      confirmed: o.confirmed === true,
      paid: o.paid === true,
      address: str('address'),
    };
  };
  try {
    const sample = await claudeSample();
    if (sample) return clean(await sample.json<Record<string, unknown>>(prompt, { cache: false, modelTier: 'quick' }));
    const settings = loadAiSettings();
    if (!settings.apiKey.trim()) return null;
    const client = new Anthropic({ apiKey: settings.apiKey.trim(), dangerouslyAllowBrowser: true });
    const res = await client.messages.create({
      model: (AI_MODELS.find((m) => m.id === settings.model) ?? AI_MODELS[0]).id,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });
    const out = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
    const json = out.match(/\{[\s\S]*\}/)?.[0];
    return json ? clean(JSON.parse(json)) : null;
  } catch {
    return null;
  }
}

/** 通用：请 Claude 从一段文字里提取 JSON；没有可用的 Claude 或出错时返回 null */
async function askJson(prompt: string): Promise<Record<string, unknown> | null> {
  try {
    const sample = await claudeSample();
    if (sample) return await sample.json<Record<string, unknown>>(prompt, { cache: false, modelTier: 'quick' });
    const settings = loadAiSettings();
    if (!settings.apiKey.trim()) return null;
    const client = new Anthropic({ apiKey: settings.apiKey.trim(), dangerouslyAllowBrowser: true });
    const res = await client.messages.create({
      model: (AI_MODELS.find((m) => m.id === settings.model) ?? AI_MODELS[0]).id,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });
    const out = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
    const json = out.match(/\{[\s\S]*\}/)?.[0];
    return json ? JSON.parse(json) : null;
  } catch {
    return null;
  }
}

const DINING_PROMPT = `下面是用户从网页或邮件复制来的一段餐厅信息（Google 地图 / Tripadvisor 餐厅页，或 OpenTable 等订位确认）。只根据文字内容提取，不要猜测或编造；没有的字段用空字符串或 0。
只回复一个 JSON 对象，不要其他文字：
{"name":"餐厅名称（不是客人姓名）","date":"订位日期 YYYY-MM-DD，没有订位就空","time":"HH:MM","party":人数,"rating":"评分和来源，如 Google 4.5（1,284 条）","perPerson":每人大致花费（澳元，按价位或价格区间估）,"total":明确写出的总价或订金,"cuisine":"菜系","address":"地址","confirmation":"订位确认号","confirmed":是否是已确认的订位(true/false)}
没写年份的日期按 {YEAR} 年。`;

/** 让 Claude 核对餐厅识别结果 */
export async function aiParseDining(text: string, year: number): Promise<Partial<ParsedDining> | null> {
  const o = await askJson(`${DINING_PROMPT.replace('{YEAR}', String(year))}\n\n<pasted>\n${text.slice(0, 6000)}\n</pasted>`);
  if (!o || typeof o !== 'object') return null;
  const str = (k: string) => (typeof o[k] === 'string' ? (o[k] as string).trim() : '');
  const num = (k: string) => (typeof o[k] === 'number' && Number.isFinite(o[k]) ? (o[k] as number) : 0);
  return {
    name: str('name'),
    date: /^\d{4}-\d{2}-\d{2}$/.test(str('date')) ? str('date') : '',
    time: /^\d{2}:\d{2}$/.test(str('time')) ? str('time') : '',
    party: Math.round(num('party')),
    rating: str('rating'),
    perPerson: num('perPerson'),
    total: num('total'),
    cuisine: str('cuisine'),
    address: str('address'),
    confirmation: str('confirmation'),
    confirmed: o.confirmed === true,
  };
}

const TICKET_PROMPT = `下面是用户从邮件或网页复制来的一段门票或渡轮预订确认。只根据文字内容提取，不要猜测或编造；没有的字段用空字符串或 0。
只回复一个 JSON 对象，不要其他文字：
{"date":"第一个日期（去程 / 入场日）YYYY-MM-DD","returnDate":"往返的回程日期 YYYY-MM-DD，没有就空","people":"人数，如 2 大 2 小 或 家庭票","total":实付总额（澳元）,"confirmation":"订单号/预订号","paid":是否已付款(true/false),"confirmed":是否已确认(true/false)}
没写年份的日期按 {YEAR} 年。`;

/** 让 Claude 核对门票 / 渡轮识别结果 */
export async function aiParseTicket(text: string, year: number): Promise<Partial<ParsedTicket> | null> {
  const o = await askJson(`${TICKET_PROMPT.replace('{YEAR}', String(year))}\n\n<pasted>\n${text.slice(0, 6000)}\n</pasted>`);
  if (!o || typeof o !== 'object') return null;
  const str = (k: string) => (typeof o[k] === 'string' ? (o[k] as string).trim() : '');
  const date = (k: string) => (/^\d{4}-\d{2}-\d{2}$/.test(str(k)) ? str(k) : '');
  return {
    date: date('date'),
    returnDate: date('returnDate'),
    people: str('people'),
    total: typeof o.total === 'number' && Number.isFinite(o.total) ? o.total : 0,
    confirmation: str('confirmation'),
    paid: o.paid === true,
    confirmed: o.confirmed === true,
  };
}

const EXPENSE_PROMPT = `下面是用户从收据、银行 / 信用卡消费通知或对账单复制来的一段文字，可能是一笔，也可能是好几笔。只根据文字内容提取，不要猜测或编造。
一张收据只算一笔（取最终合计，不要把明细行拆开）；对账单的每一行是一笔。
类别只能是：fuel（加油）、food（超市、餐饮、咖啡）、transport（停车、过路费、渡轮、公交）、activity（门票、景点、游船）、shopping（购物、纪念品、药店）、other。
只回复一个 JSON 对象，不要其他文字：
{"items":[{"title":"商户名","amount":金额数字（澳元，正数）,"date":"YYYY-MM-DD 或空","category":"上面的类别之一"}]}
没写年份的日期按 {YEAR} 年。`;

/** 让 Claude 核对「记一笔」的识别结果 */
export async function aiParseExpenses(text: string, year: number): Promise<ParsedExpense[] | null> {
  const o = await askJson(`${EXPENSE_PROMPT.replace('{YEAR}', String(year))}\n\n<pasted>\n${text.slice(0, 6000)}\n</pasted>`);
  const items = o && Array.isArray(o.items) ? (o.items as Record<string, unknown>[]) : null;
  if (!items) return null;
  const cats: Category[] = ['fuel', 'food', 'transport', 'activity', 'shopping', 'other'];
  return items
    .map((it) => ({
      title: typeof it.title === 'string' && it.title.trim() ? it.title.trim().slice(0, 50) : '一笔开销',
      amount: typeof it.amount === 'number' && Number.isFinite(it.amount) ? Math.abs(it.amount) : 0,
      date: typeof it.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(it.date) ? it.date : '',
      category: cats.includes(it.category as Category) ? (it.category as Category) : 'other',
    }))
    .filter((e) => e.amount > 0);
}

const CHECKLIST_PROMPT = `下面是用户为一次家庭自驾游复制来的一段文字（行李清单、备忘、聊天记录等）。把其中要做的事 / 要带的东西整理成一条条清单项：去掉序号和符号，一样东西或一件事一条，说明性的长段落和无关内容不要。
每条放进最合适的分组，优先用这些已有分组：{GROUPS}；实在都不合适再用新的简短分组名。
已经完成的（打了勾、划掉、写了已完成）done 为 true。
只回复一个 JSON 对象，不要其他文字：
{"items":[{"text":"清单项","group":"分组","done":false}]}`;

/** 让 Claude 整理粘贴的清单 */
export async function aiParseChecklist(text: string, groups: string[]): Promise<ParsedItem[] | null> {
  const o = await askJson(`${CHECKLIST_PROMPT.replace('{GROUPS}', groups.join('、'))}\n\n<pasted>\n${text.slice(0, 6000)}\n</pasted>`);
  const items = o && Array.isArray(o.items) ? (o.items as Record<string, unknown>[]) : null;
  if (!items) return null;
  return items
    .map((it) => ({
      text: typeof it.text === 'string' ? it.text.trim().slice(0, 120) : '',
      group: typeof it.group === 'string' && it.group.trim() ? it.group.trim().slice(0, 16) : groups[0] ?? '其他',
      done: it.done === true,
    }))
    .filter((x) => x.text.length >= 2);
}
