import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { createApp } from './app';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');

function setup(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const calls: { url: string; ua: string | null }[] = [];
  const upstreamFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, ua: new Headers(init?.headers).get('User-Agent') });
    return handler(url, init);
  }) as typeof fetch;
  const app = createApp(new DatabaseSync(':memory:'), { upstreamFetch });
  return { app, calls };
}

describe('map proxy', () => {
  it('proxies and caches tiles with an identifying User-Agent', async () => {
    const png = new Uint8Array([137, 80, 78, 71]);
    const { app, calls } = setup(() => new Response(png, { status: 200 }));
    const r1 = await app.request('/api/map/tile/6/57/39.png');
    expect(r1.status).toBe(200);
    expect(r1.headers.get('Content-Type')).toBe('image/png');
    expect(new Uint8Array(await r1.arrayBuffer())).toEqual(png);
    await app.request('/api/map/tile/6/57/39.png');
    expect(calls).toHaveLength(1); // 第二次命中缓存
    expect(calls[0].url).toBe('https://tile.openstreetmap.org/6/57/39.png');
    expect(calls[0].ua).toContain('TravelPlanner');
  });

  it('rejects invalid tile coordinates', async () => {
    const { app, calls } = setup(() => new Response(''));
    expect((await app.request('/api/map/tile/3/8/0.png')).status).toBe(400); // x 超出 2^3
    expect((await app.request('/api/map/tile/25/0/0.png')).status).toBe(400);
    expect((await app.request('/api/map/tile/3/1/abc')).status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it('routes via upstream with fallback, caches in SQLite', async () => {
    const ok = JSON.stringify({ code: 'Ok', routes: [{ distance: 1000, duration: 60, geometry: { coordinates: [] } }] });
    const { app, calls } = setup((url) =>
      url.includes('routing.openstreetmap.de') ? new Response('busy', { status: 503 }) : new Response(ok),
    );
    const path = '/api/map/route/car/144.96310,-37.81360;143.67000,-38.75700';
    const r = await app.request(path);
    expect(r.status).toBe(200);
    expect((await r.json()).code).toBe('Ok');
    expect(calls.map((c) => new URL(c.url).host)).toEqual(['routing.openstreetmap.de', 'router.project-osrm.org']);
    await app.request(path);
    expect(calls).toHaveLength(2); // 缓存命中
  });

  it('rejects bad route params and reports upstream failure', async () => {
    const { app } = setup(() => new Response('x', { status: 500 }));
    expect((await app.request('/api/map/route/plane/1,2;3,4')).status).toBe(400);
    expect((await app.request('/api/map/route/car/abc')).status).toBe(400);
    expect((await app.request('/api/map/route/foot/1.0,2.0;3.0,4.0')).status).toBe(502);
  });
});
