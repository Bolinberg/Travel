/*
 * 在 Claude 里打开时，全家共用同一份行程（artifact 的 db 能力）。
 *
 * 存法：每个行程一份文档 trips/<行程 id>（不含历史版本），
 *       每个历史版本 / 方案一份 trips/<行程 id>/versions/<版本 id>
 *       （分开存，避免单份文档超过 256 KB）。
 * 同步：订阅这些文档，别人改了马上合并进来；自己改了停 1.2 秒后写上去，
 *       同一份文档一次只写一个。最后写的为准。
 * 第一次：共享里还没有内容时，由页面的主人把自己设备上的行程放上去；
 *         其他人（比如家人）第一次打开时，直接用共享的那份替换手机上的示例数据。
 */
import { useEffect, useRef, useState } from 'react';
import type { Trip, TripVersion } from './types';
import type { Store } from './storage';

type Unsub = () => void;
interface DocSnap {
  id: string;
  exists: boolean;
  data(): Record<string, unknown> | undefined;
  metadata: { fromCache: boolean; hasPendingWrites: boolean };
}
interface QuerySnap {
  docs: DocSnap[];
  metadata: { fromCache: boolean; hasPendingWrites: boolean };
}
interface DocRef {
  set(d: Record<string, unknown>): Promise<void>;
  delete(): Promise<void>;
  collection(p: string): CollRef;
}
interface CollRef {
  doc(id: string): DocRef;
  onSnapshot(next: (s: QuerySnap) => void, err?: (e: { code: string; message: string }) => void): Unsub;
}
interface DB {
  doc(p: string): DocRef;
  collection(p: string): CollRef;
}
interface UserNs {
  isOwner?(): Promise<boolean>;
  can?(name: string): Promise<boolean | null>;
}

export type ShareState =
  | { mode: 'off' } // 不在 Claude 里，或没开共享
  | { mode: 'connecting' }
  | { mode: 'live'; at: number; canWrite: boolean }
  | { mode: 'waiting' } // 共享里还没有内容，等主人打开一次
  | { mode: 'error'; message: string };

const JOINED_KEY = 'travel-planner.family-joined';
const bodyOf = (t: Trip) => {
  const { versions: _v, ...rest } = t;
  return rest;
};
const json = (x: unknown) => JSON.stringify(x);

function getClaude(): { use?: (n: string) => Promise<unknown> } | undefined {
  return (globalThis as { claude?: { use?: (n: string) => Promise<unknown> } }).claude;
}

export function useFamilyShare(store: Store, setStore: (f: (s: Store) => Store) => void): ShareState {
  const [state, setState] = useState<ShareState>(() => (getClaude()?.use ? { mode: 'connecting' } : { mode: 'off' }));
  const dbRef = useRef<DB | null>(null);
  const canWrite = useRef(true);
  const ready = useRef(false); // 已经和共享对齐过一次，之后才往上写
  const syncedBody = useRef(new Map<string, string>()); // 行程 id → 已同步的内容
  const syncedVers = useRef(new Map<string, string>()); // 行程 id/版本 id → 已同步的内容
  const remoteTrips = useRef(new Map<string, Record<string, unknown>>());
  const remoteVers = useRef(new Map<string, Map<string, TripVersion>>());
  const versionSubs = useRef(new Map<string, Unsub>());
  const dirty = useRef(new Set<string>()); // 本机改了还没写上去的行程
  const storeRef = useRef(store);
  storeRef.current = store;
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  // 把共享的内容合并进本机
  const applyRemote = () => {
    setStore((s) => {
      let changed = false;
      const firstJoin = !localStorage.getItem(JOINED_KEY);
      const out: Trip[] = [];
      for (const [id, body] of remoteTrips.current) {
        const vers = [...(remoteVers.current.get(id)?.values() ?? [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        const remote = { ...(body as unknown as Trip), versions: vers };
        const local = s.trips.find((t) => t.id === id);
        if (local && dirty.current.has(id)) {
          out.push(local); // 本机正在改，等写上去
          continue;
        }
        syncedBody.current.set(id, json(bodyOf(remote)));
        for (const v of vers) syncedVers.current.set(`${id}/${v.id}`, json(v));
        if (!local || json(local) !== json(remote)) changed = true;
        out.push(remote);
      }
      for (const t of s.trips) {
        if (remoteTrips.current.has(t.id)) continue;
        if (syncedBody.current.has(t.id)) {
          changed = true; // 别人删掉了
          syncedBody.current.delete(t.id);
          continue;
        }
        if (firstJoin && !dirty.current.has(t.id)) {
          changed = true; // 第一次加入：手机上原来的示例数据不要了，用共享的
          continue;
        }
        out.push(t); // 本机新建的，等写上去
      }
      try {
        localStorage.setItem(JOINED_KEY, '1');
      } catch {
        /* 存不了也没关系 */
      }
      if (!changed || !out.length) return s;
      return { activeId: out.some((t) => t.id === s.activeId) ? s.activeId : out[0].id, trips: out };
    });
  };

  const watchVersions = (db: DB, tripId: string) => {
    if (versionSubs.current.has(tripId)) return;
    const unsub = db
      .doc(`trips/${tripId}`)
      .collection('versions')
      .onSnapshot(
        (snap) => {
          const m = new Map<string, TripVersion>();
          for (const d of snap.docs) {
            const v = d.data()?.v as TripVersion | undefined;
            if (v && typeof v === 'object' && v.id) m.set(v.id, v);
          }
          remoteVers.current.set(tripId, m);
          if (ready.current) applyRemote();
        },
        () => undefined,
      );
    versionSubs.current.set(tripId, unsub);
  };

  // 连接、订阅
  useEffect(() => {
    const claude = getClaude();
    if (!claude?.use) return;
    let alive = true;
    let unsubTrips: Unsub | null = null;
    const timer = setTimeout(() => alive && !ready.current && setState({ mode: 'error', message: '暂时连不上共享数据，先显示本机的内容' }), 10_000);
    (async () => {
      const db = (await claude.use!('db').catch(() => null)) as DB | null;
      const user = (await claude.use!('user').catch(() => null)) as UserNs | null;
      if (!alive) return;
      if (!db) {
        clearTimeout(timer);
        setState({ mode: 'off' });
        return;
      }
      dbRef.current = db;
      const isOwner = (await user?.isOwner?.().catch(() => false)) ?? false;
      const can = await user?.can?.('data.write').catch(() => null);
      canWrite.current = can !== false;
      unsubTrips = db.collection('trips').onSnapshot(
        (snap) => {
          if (snap.metadata.fromCache && !ready.current) return; // 等确定的结果
          clearTimeout(timer);
          remoteTrips.current = new Map(snap.docs.filter((d) => d.exists).map((d) => [d.id, (d.data()?.body ?? {}) as Record<string, unknown>]));
          for (const id of remoteTrips.current.keys()) watchVersions(db, id);
          if (!ready.current && !remoteTrips.current.size) {
            if (isOwner && canWrite.current) {
              // 共享里还是空的：主人把自己设备上的行程放上去
              ready.current = true;
              try {
                localStorage.setItem(JOINED_KEY, '1');
              } catch {
                /* 忽略 */
              }
              for (const t of storeRef.current.trips) dirty.current.add(t.id);
              flush();
              setState({ mode: 'live', at: Date.now(), canWrite: true });
            } else {
              setState({ mode: 'waiting' });
            }
            return;
          }
          // 等各行程的版本到了再合并（最多等 1.5 秒）
          const firstTime = !ready.current;
          ready.current = true;
          if (firstTime) setTimeout(applyRemote, 1500);
          else applyRemote();
          setState({ mode: 'live', at: Date.now(), canWrite: canWrite.current });
        },
        (e) => {
          clearTimeout(timer);
          setState({ mode: 'error', message: e.code === 'revoked' ? '共享已关闭' : '共享数据暂时不可用' });
        },
      );
    })();
    return () => {
      alive = false;
      clearTimeout(timer);
      unsubTrips?.();
      for (const u of versionSubs.current.values()) u();
      versionSubs.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 本机改了：记下来，停 1.2 秒后写上去
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flush = () => {
    const db = dbRef.current;
    if (!db || !ready.current || !canWrite.current) return;
    queue.current = queue.current.then(async () => {
      const s = storeRef.current;
      try {
        for (const t of s.trips) {
          const body = json(bodyOf(t));
          if (syncedBody.current.get(t.id) !== body) {
            await db.doc(`trips/${t.id}`).set({ body: bodyOf(t), updatedAt: Date.now() });
            syncedBody.current.set(t.id, body);
            watchVersions(db, t.id);
          }
          const vref = db.doc(`trips/${t.id}`).collection('versions');
          const keep = new Set<string>();
          for (const v of t.versions ?? []) {
            const key = `${t.id}/${v.id}`;
            keep.add(key);
            const vj = json(v);
            if (syncedVers.current.get(key) !== vj) {
              await vref.doc(v.id).set({ v });
              syncedVers.current.set(key, vj);
            }
          }
          for (const key of [...syncedVers.current.keys()]) {
            if (key.startsWith(`${t.id}/`) && !keep.has(key)) {
              await vref.doc(key.slice(t.id.length + 1)).delete();
              syncedVers.current.delete(key);
            }
          }
          dirty.current.delete(t.id);
        }
        // 本机删掉的行程
        for (const id of [...syncedBody.current.keys()]) {
          if (s.trips.some((t) => t.id === id)) continue;
          for (const key of [...syncedVers.current.keys()]) {
            if (key.startsWith(`${id}/`)) {
              await db.doc(`trips/${id}`).collection('versions').doc(key.slice(id.length + 1)).delete();
              syncedVers.current.delete(key);
            }
          }
          await db.doc(`trips/${id}`).delete();
          syncedBody.current.delete(id);
        }
        setState({ mode: 'live', at: Date.now(), canWrite: true });
      } catch (e) {
        const code = (e as { code?: string })?.code;
        if (code === 'invalid_argument') {
          canWrite.current = false;
          dirty.current.clear();
          setState({ mode: 'live', at: Date.now(), canWrite: false });
        } else if (code === 'quota_exceeded') {
          setState({ mode: 'error', message: '共享空间满了：在「方案 → 历史版本」里删掉一些旧版本再试' });
        } else {
          setState({ mode: 'error', message: '这次没同步上，稍后会再试' });
        }
      }
    });
  };

  useEffect(() => {
    if (!ready.current || !dbRef.current) return;
    let any = false;
    for (const t of store.trips) {
      if (syncedBody.current.get(t.id) !== json(bodyOf(t)) || (t.versions ?? []).some((v) => syncedVers.current.get(`${t.id}/${v.id}`) !== json(v))) {
        dirty.current.add(t.id);
        any = true;
      }
    }
    if (!any && [...syncedBody.current.keys()].every((id) => store.trips.some((t) => t.id === id))) return;
    if (flushTimer.current) clearTimeout(flushTimer.current);
    flushTimer.current = setTimeout(flush, 1200);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store]);

  return state;
}
