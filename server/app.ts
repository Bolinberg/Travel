import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { bodyLimit } from 'hono/body-limit';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

/*
 * 家庭同步 API
 *
 * - 家庭空间（space）：创建时生成一个随机密钥，密钥就是邀请凭证；数据库只存它的 SHA-256。
 * - 行程（trip）：整份 JSON 文档 + 版本号（乐观并发）。PUT 时必须带上基于的版本号，
 *   不一致返回 409 和服务器上的最新版本，由客户端处理冲突（不会静默覆盖别人的修改）。
 * - 增量拉取：每次写入分配全局递增的 seq，客户端用 since=<上次的 cursor> 只取变化的行程。
 */

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS spaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS trips (
  space_id TEXT NOT NULL REFERENCES spaces(id),
  id TEXT NOT NULL,
  version INTEGER NOT NULL,
  seq INTEGER NOT NULL,
  data TEXT,
  deleted INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (space_id, id)
);
CREATE INDEX IF NOT EXISTS trips_seq ON trips(space_id, seq);
CREATE TABLE IF NOT EXISTS counters (name TEXT PRIMARY KEY, value INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS route_cache (key TEXT PRIMARY KEY, body TEXT NOT NULL, created_at TEXT NOT NULL);
INSERT OR IGNORE INTO counters VALUES ('seq', 0);
`;

const MAX_BODY = 8 * 1024 * 1024; // 单个行程最大 8MB（含历史版本）

const hashKey = (key: string) => createHash('sha256').update(key).digest('hex');
const now = () => new Date().toISOString();
const isId = (s: unknown): s is string => typeof s === 'string' && /^[A-Za-z0-9_-]{6,64}$/.test(s);
const cleanName = (s: unknown, max = 40) => (typeof s === 'string' ? s.trim().slice(0, max) : '');

interface TripRow {
  id: string;
  version: number;
  seq: number;
  data: string | null;
  deleted: number;
  updated_at: string;
  updated_by: string;
}

function rowOut(r: TripRow, withData = true) {
  return {
    id: r.id,
    version: r.version,
    seq: r.seq,
    deleted: !!r.deleted,
    updatedAt: r.updated_at,
    updatedBy: r.updated_by,
    ...(withData && !r.deleted && r.data ? { data: JSON.parse(r.data) } : {}),
  };
}

export interface AppOptions {
  corsOrigin?: string;
  /** 访问上游地图 / 路线服务用的 fetch（测试时可替换） */
  upstreamFetch?: typeof fetch;
  /** 瓦片上游地址模板，默认 OpenStreetMap */
  tileUrl?: string;
  /** 访问上游时的 User-Agent（OpenStreetMap 要求标明应用身份） */
  userAgent?: string;
}

const ROUTE_UPSTREAMS: Record<string, string[]> = {
  car: ['https://routing.openstreetmap.de/routed-car/route/v1/driving/', 'https://router.project-osrm.org/route/v1/driving/'],
  foot: ['https://routing.openstreetmap.de/routed-foot/route/v1/driving/'],
  bike: ['https://routing.openstreetmap.de/routed-bike/route/v1/driving/'],
};
const COORDS_RE = /^-?\d{1,3}(\.\d+)?,-?\d{1,2}(\.\d+)?(;-?\d{1,3}(\.\d+)?,-?\d{1,2}(\.\d+)?){1,24}$/;

export function createApp(db: DatabaseSync, opts: AppOptions = {}) {
  const upstream = opts.upstreamFetch ?? fetch;
  const tileUrl = opts.tileUrl ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
  const userAgent = opts.userAgent ?? 'TravelPlannerFamily/1.0 (self-hosted family trip planner)';
  db.exec(SCHEMA);
  const nextSeq = () => {
    db.prepare(`UPDATE counters SET value = value + 1 WHERE name = 'seq'`).run();
    return (db.prepare(`SELECT value FROM counters WHERE name = 'seq'`).get() as { value: number }).value;
  };

  const app = new Hono<{ Variables: { spaceId: string; member: string } }>();

  app.use(
    '/api/*',
    cors({
      origin: opts.corsOrigin ?? '*',
      allowHeaders: ['Authorization', 'Content-Type', 'X-Member'],
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      maxAge: 86400,
    }),
  );
  app.use('/api/*', bodyLimit({ maxSize: MAX_BODY, onError: (c) => c.json({ error: '数据太大' }, 413) }));

  app.get('/api/health', (c) => c.json({ ok: true }));

  /* ---------- 地图代理：瓦片 + 路线（同源访问，服务端缓存） ---------- */

  const tileCache = new Map<string, ArrayBuffer>(); // 简单 LRU
  const TILE_CACHE_MAX = 800;

  app.get('/api/map/tile/:z/:x/:file', async (c) => {
    const z = Number(c.req.param('z'));
    const x = Number(c.req.param('x'));
    const m = /^(\d+)\.png$/.exec(c.req.param('file'));
    const y = m ? Number(m[1]) : NaN;
    const n = 2 ** z;
    if (!Number.isInteger(z) || z < 0 || z > 19 || !Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= n || y >= n) {
      return c.json({ error: '瓦片坐标不合法' }, 400);
    }
    const key = `${z}/${x}/${y}`;
    let buf = tileCache.get(key);
    if (buf) {
      tileCache.delete(key);
      tileCache.set(key, buf);
    } else {
      try {
        const r = await upstream(tileUrl.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y)), {
          headers: { 'User-Agent': userAgent },
          signal: AbortSignal.timeout(10000),
        });
        if (!r.ok) return c.json({ error: `上游瓦片服务返回 ${r.status}` }, 502);
        buf = await r.arrayBuffer();
      } catch {
        return c.json({ error: '无法连接上游瓦片服务' }, 502);
      }
      tileCache.set(key, buf);
      if (tileCache.size > TILE_CACHE_MAX) tileCache.delete(tileCache.keys().next().value!);
    }
    return c.body(buf, 200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=604800' });
  });

  app.get('/api/map/route/:profile/:coords', async (c) => {
    const profile = c.req.param('profile');
    const coords = c.req.param('coords');
    if (!ROUTE_UPSTREAMS[profile] || !COORDS_RE.test(coords)) return c.json({ error: '路线参数不合法' }, 400);
    const key = `${profile}:${coords}`;
    const hit = db.prepare('SELECT body FROM route_cache WHERE key = ?').get(key) as { body: string } | undefined;
    if (hit) return c.body(hit.body, 200, { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=86400' });
    for (const base of ROUTE_UPSTREAMS[profile]) {
      try {
        const r = await upstream(`${base}${coords}?overview=simplified&geometries=geojson`, {
          headers: { 'User-Agent': userAgent },
          signal: AbortSignal.timeout(15000),
        });
        if (!r.ok) continue;
        const body = await r.text();
        if (JSON.parse(body).code !== 'Ok') continue;
        db.prepare('INSERT OR REPLACE INTO route_cache (key, body, created_at) VALUES (?, ?, ?)').run(key, body, now());
        return c.body(body, 200, { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=86400' });
      } catch {
        /* 换下一个上游 */
      }
    }
    return c.json({ error: '无法获取路线' }, 502);
  });

  // 创建家庭空间：返回密钥（只返回这一次）
  app.post('/api/spaces', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const name = cleanName(body.name) || '我们家';
    const id = randomBytes(9).toString('base64url');
    const key = randomBytes(24).toString('base64url');
    db.prepare('INSERT INTO spaces (id, name, key_hash, created_at) VALUES (?, ?, ?, ?)').run(id, name, hashKey(key), now());
    return c.json({ spaceId: id, name, key }, 201);
  });

  // 以下接口需要 Authorization: Bearer <密钥>
  app.use('/api/space', auth);
  app.use('/api/space/*', auth);
  app.use('/api/trips', auth);
  app.use('/api/trips/*', auth);

  async function auth(c: any, next: () => Promise<void>) {
    const h = c.req.header('Authorization') ?? '';
    const key = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
    if (!key) return c.json({ error: '缺少同步密钥' }, 401);
    const want = hashKey(key);
    const row = db.prepare('SELECT id, key_hash FROM spaces WHERE key_hash = ?').get(want) as
      | { id: string; key_hash: string }
      | undefined;
    if (!row || !timingSafeEqual(Buffer.from(row.key_hash), Buffer.from(want))) {
      return c.json({ error: '同步密钥无效，可能已被更换' }, 401);
    }
    c.set('spaceId', row.id);
    c.set('member', cleanName(decodeURIComponent(c.req.header('X-Member') ?? '')));
    await next();
  }

  app.get('/api/space', (c) => {
    const s = db.prepare('SELECT id, name, created_at FROM spaces WHERE id = ?').get(c.get('spaceId')) as {
      id: string;
      name: string;
      created_at: string;
    };
    const n = db.prepare('SELECT COUNT(*) AS n FROM trips WHERE space_id = ? AND deleted = 0').get(s.id) as { n: number };
    return c.json({ spaceId: s.id, name: s.name, createdAt: s.created_at, trips: n.n });
  });

  // 更换密钥：旧邀请链接和其他设备都会失效，需要重新邀请
  app.post('/api/space/rotate', (c) => {
    const key = randomBytes(24).toString('base64url');
    db.prepare('UPDATE spaces SET key_hash = ? WHERE id = ?').run(hashKey(key), c.get('spaceId'));
    return c.json({ key });
  });

  // 增量拉取
  app.get('/api/trips', (c) => {
    const since = Math.max(0, Number(c.req.query('since') ?? 0) || 0);
    const rows = db
      .prepare('SELECT id, version, seq, data, deleted, updated_at, updated_by FROM trips WHERE space_id = ? AND seq > ? ORDER BY seq')
      .all(c.get('spaceId'), since) as unknown as TripRow[];
    const cursor = rows.length ? rows[rows.length - 1].seq : since;
    return c.json({ trips: rows.map((r) => rowOut(r)), cursor });
  });

  app.get('/api/trips/:id', (c) => {
    const r = getTrip(c.get('spaceId'), c.req.param('id'));
    return r ? c.json(rowOut(r)) : c.json({ error: '不存在' }, 404);
  });

  function getTrip(spaceId: string, id: string) {
    return db
      .prepare('SELECT id, version, seq, data, deleted, updated_at, updated_by FROM trips WHERE space_id = ? AND id = ?')
      .get(spaceId, id) as TripRow | undefined;
  }

  // 上传：baseVersion 必须等于服务器当前版本（新行程为 0）
  app.put('/api/trips/:id', async (c) => {
    const id = c.req.param('id');
    if (!isId(id)) return c.json({ error: '行程 id 不合法' }, 400);
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body.baseVersion !== 'number' || !body.data || typeof body.data !== 'object') {
      return c.json({ error: '请求格式不对' }, 400);
    }
    if (body.data.id !== id) return c.json({ error: '行程 id 不一致' }, 400);
    const spaceId = c.get('spaceId');
    const cur = getTrip(spaceId, id);
    const curVersion = cur?.version ?? 0;
    if (body.baseVersion !== curVersion) {
      return c.json({ error: '版本冲突', current: cur ? rowOut(cur) : null }, 409);
    }
    const seq = nextSeq();
    const version = curVersion + 1;
    const data = JSON.stringify(body.data);
    db.prepare(
      `INSERT INTO trips (space_id, id, version, seq, data, deleted, updated_at, updated_by)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?)
       ON CONFLICT(space_id, id) DO UPDATE SET version = excluded.version, seq = excluded.seq, data = excluded.data,
         deleted = 0, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
    ).run(spaceId, id, version, seq, data, now(), c.get('member'));
    return c.json({ id, version, seq });
  });

  // 删除（保留墓碑，其他设备同步后也删除）
  app.delete('/api/trips/:id', async (c) => {
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    const spaceId = c.get('spaceId');
    const cur = getTrip(spaceId, id);
    if (!cur || cur.deleted) return c.json({ id, version: cur?.version ?? 0, seq: cur?.seq ?? 0 });
    if (typeof body.baseVersion === 'number' && body.baseVersion !== cur.version) {
      return c.json({ error: '版本冲突', current: rowOut(cur) }, 409);
    }
    const seq = nextSeq();
    db.prepare('UPDATE trips SET deleted = 1, data = NULL, version = version + 1, seq = ?, updated_at = ?, updated_by = ? WHERE space_id = ? AND id = ?').run(
      seq,
      now(),
      c.get('member'),
      spaceId,
      id,
    );
    return c.json({ id, version: cur.version + 1, seq });
  });

  return app;
}
