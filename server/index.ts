import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createApp } from './app';

/*
 * 运行：npm run build && npm start
 * 环境变量：
 *   PORT        监听端口（默认 8787）
 *   DB_PATH     SQLite 文件路径（默认 ./data/travel.db；部署时放在持久化磁盘上）
 *   CORS_ORIGIN 允许跨域调用 API 的来源（默认 *，因为用的是 Bearer 密钥而不是 Cookie）
 *   TILE_URL    地图瓦片上游（默认 OpenStreetMap，可换成有 API Key 的商用瓦片服务）
 *   MAP_USER_AGENT 访问上游地图 / 路线服务时的 User-Agent
 */

const port = Number(process.env.PORT ?? 8787);
const dbPath = process.env.DB_PATH ?? './data/travel.db';
mkdirSync(dirname(dbPath), { recursive: true });

const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

const app = createApp(db, {
  corsOrigin: process.env.CORS_ORIGIN,
  tileUrl: process.env.TILE_URL,
  userAgent: process.env.MAP_USER_AGENT,
});
// 同一个服务也托管 App 页面
app.use('/*', serveStatic({ root: './dist' }));

serve({ fetch: app.fetch, port, hostname: process.env.HOST ?? "0.0.0.0" }, () => {
  console.log(`Travel planner on http://localhost:${port}  (db: ${dbPath})`);
});
