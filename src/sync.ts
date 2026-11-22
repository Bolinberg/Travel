import type { Trip } from './types';
import type { Store } from './storage';
import { addVersion, snapshot } from './versions';

/*
 * 家庭同步（客户端）
 *
 * 每个行程记住「上次与服务器一致时」的版本号和内容哈希：
 *   - 本地哈希 ≠ 记录的哈希 → 本地有未上传的修改（dirty）
 *   - 拉取到别人的新版本时，本地没改 → 直接替换；本地也改了 → 冲突
 * 冲突处理：以服务器版本为准，把本机未上传的内容存进「方案」历史（不会丢），再上传合并结果。
 */

export interface SyncConfig {
  server: string;
  key: string;
  spaceId: string;
  spaceName: string;
  member: string;
  cursor: number;
  meta: Record<string, { version: number; hash: string }>;
}

const KEY = 'travel-planner.sync';

export function loadSyncConfig(): SyncConfig | null {
  try {
    const c = JSON.parse(localStorage.getItem(KEY) || 'null');
    return c && c.server && c.key ? c : null;
  } catch {
    return null;
  }
}

export function saveSyncConfig(c: SyncConfig | null): void {
  try {
    if (c) localStorage.setItem(KEY, JSON.stringify(c));
    else localStorage.removeItem(KEY);
  } catch {
    /* 忽略 */
  }
}

/** 53 位字符串哈希（cyrb53） */
export function hashTrip(t: Trip): string {
  const str = JSON.stringify(t);
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

export const normalizeServer = (s: string) => s.trim().replace(/\/+$/, '');

/* ---------- API ---------- */

export class SyncError extends Error {
  constructor(
    message: string,
    public status = 0,
  ) {
    super(message);
  }
}

export interface RemoteTrip {
  id: string;
  version: number;
  seq: number;
  deleted: boolean;
  updatedAt: string;
  updatedBy: string;
  data?: Trip;
}

type Fetch = typeof fetch;

async function api<T>(
  f: Fetch,
  server: string,
  path: string,
  opts: { key?: string; member?: string; method?: string; body?: unknown } = {},
): Promise<{ status: number; json: T }> {
  let r: Response;
  try {
    r = await f(normalizeServer(server) + path, {
      method: opts.method ?? 'GET',
      headers: {
        ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(opts.key ? { Authorization: `Bearer ${opts.key}` } : {}),
        ...(opts.member ? { 'X-Member': encodeURIComponent(opts.member) } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new SyncError('连不上同步服务器（离线或地址不对）');
  }
  const json = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (r.status === 401) throw new SyncError((json as { error?: string }).error ?? '同步密钥无效', 401);
  if (!r.ok && r.status !== 409) throw new SyncError((json as { error?: string }).error ?? `服务器错误 ${r.status}`, r.status);
  return { status: r.status, json };
}

export async function createSpace(server: string, name: string, f: Fetch = fetch) {
  const { json } = await api<{ spaceId: string; name: string; key: string }>(f, server, '/api/spaces', {
    method: 'POST',
    body: { name },
  });
  return json;
}

export async function getSpace(server: string, key: string, f: Fetch = fetch) {
  const { json } = await api<{ spaceId: string; name: string; trips: number }>(f, server, '/api/space', { key });
  return json;
}

export async function rotateKey(cfg: SyncConfig, f: Fetch = fetch) {
  const { json } = await api<{ key: string }>(f, cfg.server, '/api/space/rotate', { key: cfg.key, method: 'POST' });
  return json.key;
}

/* ---------- 邀请链接 ---------- */

export function inviteLink(appUrl: string, cfg: Pick<SyncConfig, 'server' | 'key' | 'spaceName'>): string {
  const p = new URLSearchParams({ join: cfg.key, server: cfg.server, space: cfg.spaceName });
  return `${appUrl.split('#')[0]}#${p.toString()}`;
}

export function parseInvite(text: string): { key: string; server: string; space: string } | null {
  const i = text.indexOf('#');
  const p = new URLSearchParams(i >= 0 ? text.slice(i + 1) : text);
  const key = p.get('join');
  const server = p.get('server');
  return key && server ? { key, server, space: p.get('space') ?? '' } : null;
}

/* ---------- 同步一轮 ---------- */

export interface SyncResult {
  /** 应用到最新 store 上的变化 */
  apply: (s: Store) => Store;
  cfg: SyncConfig;
  conflicts: string[];
  pulled: number;
  pushed: number;
}

function conflictMerge(server: Trip, local: Trip, who: string): Trip {
  const merged = structuredClone(server);
  merged.versions = structuredClone(server.versions ?? []);
  addVersion(merged, `同步冲突：本机未上传的修改（${who || '本机'}）`, 'auto', snapshot(local));
  return merged;
}

/**
 * 与服务器同步一次。不直接修改 store，而是返回 apply 函数，
 * 由调用方用 setStore(apply) 应用到「最新」的 store 上（同步期间用户可能还在编辑）。
 */
export async function syncOnce(cfg0: SyncConfig, store: Store, f: Fetch = fetch): Promise<SyncResult> {
  const cfg: SyncConfig = structuredClone(cfg0);
  const opts = { key: cfg.key, member: cfg.member };
  const conflicts: string[] = [];
  // 对每个行程的最终操作：替换为某个版本 / 删除；expectHash = 同步开始时本地的哈希
  const ops = new Map<string, { trip: Trip | null; expectHash: string | null }>();
  const local = new Map(store.trips.map((t) => [t.id, t]));
  const localHash = new Map(store.trips.map((t) => [t.id, hashTrip(t)]));
  const working = new Map(local); // 本轮计算用的「当前」内容
  const isDirty = (id: string) => {
    const t = working.get(id);
    return !!t && hashTrip(t) !== cfg.meta[id]?.hash;
  };
  let pulled = 0;
  let pushed = 0;

  // 1) 拉取
  const { json: pull } = await api<{ trips: RemoteTrip[]; cursor: number }>(
    f,
    cfg.server,
    `/api/trips?since=${cfg.cursor}`,
    opts,
  );
  for (const r of pull.trips) {
    const mine = working.get(r.id);
    if (r.deleted) {
      if (mine && !isDirty(r.id)) {
        working.delete(r.id);
        ops.set(r.id, { trip: null, expectHash: localHash.get(r.id) ?? null });
        delete cfg.meta[r.id];
        pulled++;
      } else if (mine) {
        // 别人删了，但本机还在改：保留本机内容，稍后重新上传
        cfg.meta[r.id] = { version: r.version, hash: '' };
      } else {
        delete cfg.meta[r.id];
      }
      continue;
    }
    if (!r.data) continue;
    // 本机已删除、尚未通知服务器：别人没再改过就跳过（稍后在第 3 步删除）；改过则以对方修改为准
    if (!mine && cfg.meta[r.id] && cfg.meta[r.id].version >= r.version) continue;
    if (!mine || !isDirty(r.id)) {
      if (mine && hashTrip(mine) === hashTrip(r.data)) {
        cfg.meta[r.id] = { version: r.version, hash: hashTrip(r.data) };
        continue;
      }
      working.set(r.id, r.data);
      ops.set(r.id, { trip: r.data, expectHash: localHash.get(r.id) ?? null });
      cfg.meta[r.id] = { version: r.version, hash: hashTrip(r.data) };
      pulled++;
    } else if (cfg.meta[r.id]?.version !== r.version) {
      // 双方都改了：服务器为准 + 本机内容存为历史版本
      const merged = conflictMerge(r.data, mine, cfg.member);
      working.set(r.id, merged);
      ops.set(r.id, { trip: merged, expectHash: localHash.get(r.id) ?? null });
      cfg.meta[r.id] = { version: r.version, hash: hashTrip(r.data) };
      conflicts.push(mine.name);
    }
  }
  cfg.cursor = pull.cursor;

  // 2) 上传本地修改
  for (const [id, t] of working) {
    if (!isDirty(id)) continue;
    const base = cfg.meta[id]?.version ?? 0;
    const { status, json } = await api<{ version: number; current?: RemoteTrip | null }>(f, cfg.server, `/api/trips/${encodeURIComponent(id)}`, {
      ...opts,
      method: 'PUT',
      body: { baseVersion: base, data: t },
    });
    if (status === 409) {
      const cur = json.current;
      if (cur?.data) {
        const merged = conflictMerge(cur.data, t, cfg.member);
        working.set(id, merged);
        ops.set(id, { trip: merged, expectHash: localHash.get(id) ?? null });
        cfg.meta[id] = { version: cur.version, hash: hashTrip(cur.data) };
        conflicts.push(t.name);
      } else {
        // 服务器上已删除或不存在：按最新版本号重新上传（下一轮）
        cfg.meta[id] = { version: cur?.version ?? 0, hash: '' };
      }
      continue;
    }
    cfg.meta[id] = { version: json.version, hash: hashTrip(t) };
    pushed++;
  }

  // 3) 本机删除的行程 → 服务器删除
  for (const id of Object.keys(cfg.meta)) {
    if (working.has(id)) continue;
    const { status, json } = await api<{ current?: RemoteTrip | null }>(f, cfg.server, `/api/trips/${encodeURIComponent(id)}`, {
      ...opts,
      method: 'DELETE',
      body: { baseVersion: cfg.meta[id].version },
    });
    if (status === 409 && json.current?.data) {
      // 有人在你删除前改过它：保留对方的版本
      working.set(id, json.current.data);
      ops.set(id, { trip: json.current.data, expectHash: null });
      cfg.meta[id] = { version: json.current.version, hash: hashTrip(json.current.data) };
      conflicts.push(json.current.data.name);
    } else {
      delete cfg.meta[id];
    }
  }

  const apply = (s: Store): Store => {
    if (!ops.size) return s;
    let trips = [...s.trips];
    for (const [id, op] of ops) {
      const i = trips.findIndex((t) => t.id === id);
      const cur = i >= 0 ? trips[i] : undefined;
      // 同步期间用户又改了这个行程：先不覆盖，下一轮再处理（会按冲突流程保存，不丢修改）
      if (cur && op.expectHash !== null && hashTrip(cur) !== op.expectHash) {
        delete cfg.meta[id];
        continue;
      }
      if (op.trip === null) {
        if (i >= 0) trips.splice(i, 1);
      } else if (i >= 0) {
        trips[i] = op.trip;
      } else {
        trips = [...trips, op.trip];
      }
    }
    if (!trips.length) return s; // 至少保留一个行程
    const activeId = trips.some((t) => t.id === s.activeId) ? s.activeId : trips[0].id;
    return { activeId, trips };
  };

  return { apply, cfg, conflicts, pulled, pushed };
}
