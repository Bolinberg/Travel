import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
// vitest 会把 node:sqlite 解析成 sqlite，这里用 require 绕过
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');
import { createApp } from './app';
import { createDefaultTrip, createBlankTrip } from '../src/defaultTrip';
import { createSpace, getSpace, hashTrip, syncOnce, type SyncConfig } from '../src/sync';
import type { Store } from '../src/storage';

/** 把 Hono app 包装成 fetch，供客户端同步代码直接调用 */
function setup() {
  const app = createApp(new DatabaseSync(':memory:'));
  const f = ((input: RequestInfo | URL, init?: RequestInit) => app.fetch(new Request(input, init))) as typeof fetch;
  return { app, f };
}
const SERVER = 'http://test.local';

async function device(f: typeof fetch, key: string, member: string, trips = [createDefaultTrip()]) {
  const s = await getSpace(SERVER, key, f);
  const cfg: SyncConfig = { server: SERVER, key, spaceId: s.spaceId, spaceName: s.name, member, cursor: 0, meta: {} };
  const store: Store = { activeId: trips[0]?.id ?? '', trips };
  return { cfg, store };
}

async function step(f: typeof fetch, d: { cfg: SyncConfig; store: Store }) {
  const r = await syncOnce(d.cfg, d.store, f);
  d.store = r.apply(d.store);
  d.cfg = r.cfg;
  return r;
}

describe('sync server', () => {
  it('rejects bad keys and accepts the space key', async () => {
    const { f } = setup();
    const s = await createSpace(SERVER, '测试家', f);
    await expect(getSpace(SERVER, 'nope', f)).rejects.toThrow();
    expect((await getSpace(SERVER, s.key, f)).name).toBe('测试家');
  });

  it('two devices converge, and edits flow both ways', async () => {
    const { f } = setup();
    const { key } = await createSpace(SERVER, 'fam', f);
    const dad = await device(f, key, '爸爸');
    const tripId = dad.store.trips[0].id;
    expect((await step(f, dad)).pushed).toBe(1);

    // 妈妈的设备：只用空间里的行程
    const mom = await device(f, key, '妈妈', []);
    await step(f, mom);
    expect(mom.store.trips.map((t) => t.id)).toEqual([tripId]);

    // 妈妈改预算 → 爸爸收到
    mom.store.trips[0].budget = 6000;
    expect((await step(f, mom)).pushed).toBe(1);
    const r = await step(f, dad);
    expect(r.pulled).toBe(1);
    expect(dad.store.trips[0].budget).toBe(6000);
    expect(hashTrip(dad.store.trips[0])).toBe(hashTrip(mom.store.trips[0]));
  });

  it('conflicting edits keep the server copy and save the local one as a version', async () => {
    const { f } = setup();
    const { key } = await createSpace(SERVER, 'fam', f);
    const dad = await device(f, key, '爸爸');
    await step(f, dad);
    const mom = await device(f, key, '妈妈', []);
    await step(f, mom);

    mom.store.trips[0].name = '妈妈改的名字';
    await step(f, mom);
    dad.store.trips[0].budget = 9999; // 爸爸同时离线改了别的
    const r = await step(f, dad);
    expect(r.conflicts).toHaveLength(1);
    const t = dad.store.trips[0];
    expect(t.name).toBe('妈妈改的名字');
    const saved = t.versions!.at(-1)!;
    expect(saved.label).toContain('同步冲突');
    expect(saved.snapshot.budget).toBe(9999);
    // 合并结果（含冲突版本）下一轮上传，妈妈也能看到
    await step(f, dad);
    await step(f, mom);
    expect(mom.store.trips[0].versions?.at(-1)?.label).toContain('同步冲突');
  });

  it('deletes propagate', async () => {
    const { f } = setup();
    const { key } = await createSpace(SERVER, 'fam', f);
    const a = createDefaultTrip();
    const b = createBlankTrip({ name: 'B', origin: 'Sydney NSW', destination: 'Canberra ACT', startDate: '2027-01-01', days: 2, adults: 2, children: 0, budget: 1000 });
    const dad = await device(f, key, '爸爸', [a, b]);
    await step(f, dad);
    const mom = await device(f, key, '妈妈', []);
    await step(f, mom);
    expect(mom.store.trips).toHaveLength(2);

    dad.store = { activeId: a.id, trips: [a].map((t) => dad.store.trips.find((x) => x.id === t.id)!) };
    await step(f, dad);
    await step(f, mom);
    expect(mom.store.trips.map((t) => t.name)).toEqual([a.name]);
  });

  it('enforces optimistic concurrency at the API level', async () => {
    const { app } = setup();
    const res = await app.request('/api/spaces', { method: 'POST', body: '{}' , headers: { 'Content-Type': 'application/json' } });
    const { key } = (await res.json()) as { key: string };
    const t = createDefaultTrip();
    const put = (base: number) =>
      app.request(`/api/trips/${t.id}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseVersion: base, data: t }),
      });
    expect((await put(0)).status).toBe(200);
    expect((await put(0)).status).toBe(409);
    expect((await put(1)).status).toBe(200);
    // id 不一致被拒绝
    const bad = await app.request(`/api/trips/other-id-123`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseVersion: 0, data: t }),
    });
    expect(bad.status).toBe(400);
  });

  it('rotating the key invalidates the old one', async () => {
    const { f } = setup();
    const { key } = await createSpace(SERVER, 'fam', f);
    const d = await device(f, key, 'x');
    const { rotateKey } = await import('../src/sync');
    const newKey = await rotateKey(d.cfg, f);
    await expect(getSpace(SERVER, key, f)).rejects.toThrow();
    expect((await getSpace(SERVER, newKey, f)).spaceId).toBe(d.cfg.spaceId);
  });
});
