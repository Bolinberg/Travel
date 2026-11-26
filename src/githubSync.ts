/*
 * 网站版（GitHub Pages）的家庭同步：行程存进一个 GitHub 私有仓库。
 *
 * 每个行程一个文件 trips/<行程 id>.json（含方案 / 历史版本）。
 * 每台设备记住每个行程上次同步时的文件 sha 和内容（base）：
 *   - 共享里变了、本机没改 → 直接用共享的
 *   - 共享里变了、本机也改了 → 以本机为准，把别人新加的补进来（merge.ts，只加不删）
 *   - 本机有、共享里没有、这台设备从没同步过 → 同名就合并进共享那份，否则传上去
 * 写入带 sha，别人刚好也写了会被 GitHub 拒绝（409），下一轮先合并再写。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Trip } from './types';
import type { Store } from './storage';
import { changesSince, mergeTrip, sameTrip } from './merge';
import { backup } from './familyShare';

export interface GhConfig {
  owner: string;
  repo: string;
  token: string;
}

export type GhState =
  | { mode: 'off' }
  | { mode: 'syncing' }
  | { mode: 'ok'; at: number }
  | { mode: 'error'; message: string };

const CFG_KEY = 'travel-planner.gh-sync';
const META_KEY = 'travel-planner.gh-meta'; // id → { sha, base }
const API = 'https://api.github.com';
const DIR = 'trips';

type Meta = Record<string, { sha: string; base: string }>;

export function loadGhConfig(): GhConfig | null {
  try {
    const c = JSON.parse(localStorage.getItem(CFG_KEY) || 'null') as GhConfig | null;
    return c && c.owner && c.repo && c.token ? c : null;
  } catch {
    return null;
  }
}
export function saveGhConfig(c: GhConfig | null) {
  try {
    if (c) localStorage.setItem(CFG_KEY, JSON.stringify(c));
    else {
      localStorage.removeItem(CFG_KEY);
      localStorage.removeItem(META_KEY);
    }
  } catch {
    /* 忽略 */
  }
}
function loadMeta(): Meta {
  try {
    return JSON.parse(localStorage.getItem(META_KEY) || '{}') as Meta;
  } catch {
    return {};
  }
}
function saveMeta(m: Meta) {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(m));
  } catch {
    // 空间不够：只存 sha，下次按“本机改过”处理（合并只加不删，不会丢）
    const slim: Meta = {};
    for (const [k, v] of Object.entries(m)) slim[k] = { sha: v.sha, base: '' };
    try {
      localStorage.setItem(META_KEY, JSON.stringify(slim));
    } catch {
      /* 算了 */
    }
  }
}

/* ---------- 邀请链接：#gh=<base64> ---------- */

const b64 = (s: string) => {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};
const unb64 = (s: string) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\s/g, '')), (c) => c.charCodeAt(0)));

export function ghInviteLink(appUrl: string, c: GhConfig): string {
  const payload = b64(JSON.stringify({ o: c.owner, r: c.repo, t: c.token })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${appUrl.split('#')[0]}#gh=${payload}`;
}
export function parseGhInvite(text: string): GhConfig | null {
  const m = text.match(/[#&]gh=([A-Za-z0-9_-]+)/);
  if (!m) return null;
  try {
    const x = JSON.parse(unb64(m[1].replace(/-/g, '+').replace(/_/g, '/'))) as { o?: string; r?: string; t?: string };
    return x.o && x.r && x.t ? { owner: x.o, repo: x.r, token: x.t } : null;
  } catch {
    return null;
  }
}

/* ---------- GitHub API ---------- */

export class GhError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
type Fetch = typeof fetch;

async function gh(c: GhConfig, path: string, init: RequestInit = {}, f: Fetch = fetch): Promise<Response> {
  const res = await f(`${API}/repos/${c.owner}/${c.repo}${path}`, {
    ...init,
    cache: 'no-store',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${c.token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  if (res.ok || res.status === 404) return res;
  const msg =
    res.status === 401
      ? '令牌无效或已过期：请重新生成令牌'
      : res.status === 403
        ? '令牌没有这个仓库的读写权限（Contents: Read and write），或请求太频繁'
        : res.status === 409 || res.status === 422
          ? '别人刚好也在改'
          : `GitHub 返回 ${res.status}`;
  throw new GhError(msg, res.status);
}

/** 检查令牌能不能读写这个仓库 */
export async function checkGh(c: GhConfig, f: Fetch = fetch): Promise<void> {
  const res = await gh(c, '', {}, f);
  if (res.status === 404) throw new GhError(`找不到仓库 ${c.owner}/${c.repo}，或令牌没有它的权限`, 404);
  const j = (await res.json()) as { permissions?: { push?: boolean } };
  if (j.permissions && j.permissions.push === false) throw new GhError('令牌只能读、不能写：权限里 Contents 要选 Read and write', 403);
}

async function listRemote(c: GhConfig, f: Fetch): Promise<Map<string, string>> {
  const res = await gh(c, `/contents/${DIR}?ref=HEAD`, {}, f);
  const m = new Map<string, string>();
  if (res.status === 404) return m; // 还没有任何行程
  const list = (await res.json()) as { name: string; sha: string; type: string }[];
  for (const x of Array.isArray(list) ? list : []) {
    if (x.type === 'file' && x.name.endsWith('.json')) m.set(x.name.slice(0, -5), x.sha);
  }
  return m;
}
async function readBlob(c: GhConfig, sha: string, f: Fetch): Promise<Trip> {
  const res = await gh(c, `/git/blobs/${sha}`, {}, f);
  const j = (await res.json()) as { content: string };
  return JSON.parse(unb64(j.content)) as Trip;
}
async function writeTrip(c: GhConfig, t: Trip, sha: string | undefined, f: Fetch): Promise<string> {
  const res = await gh(
    c,
    `/contents/${DIR}/${encodeURIComponent(t.id)}.json`,
    { method: 'PUT', body: JSON.stringify({ message: `更新行程：${t.name}`, content: b64(JSON.stringify(t)), ...(sha ? { sha } : {}) }) },
    f,
  );
  if (res.status === 404) throw new GhError(`找不到仓库 ${c.owner}/${c.repo}`, 404);
  const j = (await res.json()) as { content: { sha: string } };
  return j.content.sha;
}
async function deleteTrip(c: GhConfig, id: string, sha: string, f: Fetch): Promise<void> {
  await gh(c, `/contents/${DIR}/${encodeURIComponent(id)}.json`, { method: 'DELETE', body: JSON.stringify({ message: `删除行程 ${id}`, sha }) }, f);
}

const json = (x: unknown) => JSON.stringify(x);

/**
 * 同步一轮。getStore 取当前本机数据，apply 把合并结果交给页面（用函数，避免覆盖同步期间的新改动）。
 */
export async function ghSyncOnce(
  c: GhConfig,
  getStore: () => Store,
  apply: (f: (s: Store) => Store) => void,
  f: Fetch = fetch,
): Promise<void> {
  const meta = loadMeta();
  const remote = await listRemote(c, f);
  const fetched = new Map<string, Trip>();
  for (const [id, sha] of remote) {
    if (meta[id]?.sha !== sha) fetched.set(id, await readBlob(c, sha, f));
  }

  // 1. 合并进本机
  let snapshot: Store | null = null;
  const m0 = { ...meta }; // apply 可能被调用两次：判断都看同步前的记录
  apply((s) => {
    const out: Trip[] = [];
    const used = new Set<string>();
    let changed = false;
    for (const [id] of remote) {
      const local = s.trips.find((t) => t.id === id);
      const got = fetched.get(id);
      if (!got) {
        if (local) {
          out.push(local);
          used.add(id);
        } else if (m0[id]) {
          // 本机删掉了，后面会删共享里的
        } else out.push(local!);
        continue;
      }
      const base = m0[id]?.base ? (JSON.parse(m0[id].base) as Trip) : null;
      let merged: Trip = got;
      if (local) {
        used.add(id);
        if (base && json(local) === json(base)) merged = got; // 本机没改
        else if (base) merged = mergeTrip(local, changesSince(got, base)); // 两边都改了
        else merged = mergeTrip(got, local); // 第一次对齐
      } else if (m0[id] && !local) {
        continue; // 本机刚删的，不加回来
      }
      // 同名、只在本机的行程（另一台设备上 id 不同）：合并进来
      for (const x of s.trips) {
        if (x.id === id || remote.has(x.id) || m0[x.id] || !sameTrip(x, got)) continue;
        merged = mergeTrip(merged, x);
        used.add(x.id);
      }
      meta[id] = { sha: remote.get(id)!, base: json(got) };
      if (!local || json(local) !== json(merged)) changed = true;
      out.push(merged);
    }
    for (const t of s.trips) {
      if (used.has(t.id) || remote.has(t.id)) continue;
      if (m0[t.id]) {
        // 别人在共享里删掉了
        delete meta[t.id];
        changed = true;
        continue;
      }
      out.push(t); // 本机新建的：下面传上去
    }
    const clean = out.filter(Boolean);
    const next = changed && clean.length ? { activeId: clean.some((t) => t.id === s.activeId) ? s.activeId : clean[0].id, trips: clean } : s;
    if (next !== s) backup(s.trips);
    snapshot = next;
    return next;
  });
  // 等 React 把 apply 跑完
  for (let i = 0; i < 50 && !snapshot; i++) await new Promise((r) => setTimeout(r, 20));
  const s: Store = snapshot ?? getStore();

  // 2. 本机改过 / 新建的，写上去
  let conflict = false;
  for (const t of s.trips) {
    const m = meta[t.id];
    if (m && m.base && json(t) === m.base) continue;
    try {
      const sha = await writeTrip(c, t, m?.sha ?? remote.get(t.id), f);
      meta[t.id] = { sha, base: json(t) };
    } catch (e) {
      if (e instanceof GhError && (e.status === 409 || e.status === 422)) conflict = true;
      else {
        saveMeta(meta);
        throw e;
      }
    }
  }
  // 3. 本机删掉的，从共享里删
  for (const id of Object.keys(meta)) {
    if (s.trips.some((t) => t.id === id)) continue;
    const sha = remote.get(id);
    if (sha && sha === meta[id].sha) await deleteTrip(c, id, sha, f).catch(() => undefined);
    delete meta[id];
  }
  saveMeta(meta);
  if (conflict) throw new GhError('别人刚好也在改，稍后自动再同步一次', 409);
}

/** 页面里用：连上后每 20 秒、切回页面、改动 2 秒后同步一次 */
export function useGitHubSync(store: Store, setStore: (f: (s: Store) => Store) => void) {
  const [cfg, setCfgState] = useState<GhConfig | null>(() => loadGhConfig());
  const [state, setState] = useState<GhState>(() => (loadGhConfig() ? { mode: 'syncing' } : { mode: 'off' }));
  const storeRef = useRef(store);
  storeRef.current = store;
  const running = useRef<Promise<void> | null>(null);
  const again = useRef(false);

  const run = useCallback(async () => {
    const c = loadGhConfig();
    if (!c) return;
    if (running.current) {
      again.current = true;
      return running.current;
    }
    setState({ mode: 'syncing' });
    running.current = (async () => {
      try {
        await ghSyncOnce(c, () => storeRef.current, setStore);
        setState({ mode: 'ok', at: Date.now() });
      } catch (e) {
        const msg = e instanceof Error ? e.message : '同步失败';
        setState({ mode: 'error', message: navigator.onLine === false ? '没有网络，联网后自动同步' : msg });
        if (e instanceof GhError && e.status === 409) setTimeout(run, 3000);
      } finally {
        running.current = null;
        if (again.current) {
          again.current = false;
          setTimeout(run, 500);
        }
      }
    })();
    return running.current;
  }, [setStore]);

  const setCfg = useCallback(
    (c: GhConfig | null) => {
      saveGhConfig(c);
      setCfgState(c);
      setState(c ? { mode: 'syncing' } : { mode: 'off' });
      if (c) setTimeout(run, 0);
    },
    [run],
  );

  // 打开邀请链接：记下配置，从地址栏去掉令牌
  useEffect(() => {
    const check = () => {
      const inv = parseGhInvite(location.hash);
      if (!inv) return;
      history.replaceState(null, '', location.pathname + location.search);
      setCfg(inv);
    };
    check();
    window.addEventListener('hashchange', check); // 页面已经开着时点邀请链接
    return () => window.removeEventListener('hashchange', check);
  }, [setCfg]);

  useEffect(() => {
    if (!cfg) return;
    run();
    const timer = setInterval(run, 20_000);
    const onFocus = () => document.visibilityState === 'visible' && run();
    document.addEventListener('visibilitychange', onFocus);
    window.addEventListener('online', onFocus);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onFocus);
      window.removeEventListener('online', onFocus);
    };
  }, [cfg, run]);

  // 本机改了：停 2 秒后上传
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (!cfg) return;
    const t = setTimeout(run, 2000);
    return () => clearTimeout(t);
  }, [store, cfg, run]);

  return { cfg, state, setCfg, run };
}
