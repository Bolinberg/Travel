import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type { Store } from './storage';
import { loadSyncConfig, saveSyncConfig, SyncError, syncOnce, type SyncConfig } from './sync';

export type SyncState =
  | { kind: 'off' }
  | { kind: 'syncing' }
  | { kind: 'ok'; at: number; note?: string }
  | { kind: 'offline'; message: string }
  | { kind: 'error'; message: string };

const POLL_MS = 15_000;
const DEBOUNCE_MS = 2_000;

/**
 * 自动同步：修改后约 2 秒上传；每 15 秒、切回页面、恢复联网时拉取。
 */
export function useSync(store: Store, setStore: (f: (s: Store) => Store) => void) {
  const [cfg, setCfgState] = useState<SyncConfig | null>(loadSyncConfig);
  const [state, setState] = useState<SyncState>(cfg ? { kind: 'ok', at: 0 } : { kind: 'off' });
  const storeRef = useRef(store);
  storeRef.current = store;
  const cfgRef = useRef(cfg);
  cfgRef.current = cfg;
  const running = useRef(false);
  // 加入空间时选择的首轮同步方式（合并 / 只用空间里的行程）
  const firstMode = useRef<'merge' | 'replace' | null>(null);
  const again = useRef(false);

  const setCfg = useCallback((c: SyncConfig | null, initialMode?: 'merge' | 'replace') => {
    firstMode.current = c ? initialMode ?? null : null;
    saveSyncConfig(c);
    cfgRef.current = c;
    setCfgState(c);
    setState(c ? { kind: 'ok', at: 0 } : { kind: 'off' });
  }, []);

  const run = useCallback(
    async (requested?: 'merge' | 'replace') => {
      const c = cfgRef.current;
      if (!c) return;
      if (running.current) {
        again.current = true;
        return;
      }
      running.current = true;
      const mode = requested ?? firstMode.current ?? 'merge';
      firstMode.current = null;
      setState({ kind: 'syncing' });
      try {
        const empty: Store = { activeId: '', trips: [] };
        const res = await syncOnce(c, mode === 'replace' ? empty : storeRef.current);
        if (cfgRef.current?.key !== c.key) return; // 同步期间退出了空间
        flushSync(() =>
          setStore((s) => {
            if (mode !== 'replace') return res.apply(s);
            const pulled = res.apply(empty);
            return pulled.trips.length ? pulled : s; // 空间里还没有行程时保留本机的
          }),
        );
        saveSyncConfig(res.cfg);
        cfgRef.current = res.cfg;
        setCfgState(res.cfg);
        const parts = [];
        if (res.pulled) parts.push(`收到 ${res.pulled} 个更新`);
        if (res.conflicts.length) parts.push(`「${res.conflicts.join('、')}」有冲突：已以服务器为准，本机修改存入「方案」`);
        setState({ kind: 'ok', at: Date.now(), note: parts.join('；') || undefined });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setState(e instanceof SyncError && e.status === 0 ? { kind: 'offline', message: msg } : { kind: 'error', message: msg });
      } finally {
        running.current = false;
        if (again.current) {
          again.current = false;
          setTimeout(() => run(), 300);
        }
      }
    },
    [setStore],
  );

  // 本地修改后防抖上传
  useEffect(() => {
    if (!cfg) return;
    const t = setTimeout(() => run(), DEBOUNCE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store]);

  // 定时拉取 + 切回页面 + 恢复联网
  useEffect(() => {
    if (!cfg) return;
    run();
    const tick = setInterval(() => document.visibilityState === 'visible' && run(), POLL_MS);
    const onVisible = () => document.visibilityState === 'visible' && run();
    window.addEventListener('focus', onVisible);
    window.addEventListener('online', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(tick);
      window.removeEventListener('focus', onVisible);
      window.removeEventListener('online', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg?.key, cfg?.server]);

  return { cfg, setCfg, state, run };
}
