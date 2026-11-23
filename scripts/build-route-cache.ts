/**
 * 预先计算内置行程模板的真实道路路线，写入 public/route-cache.json。
 * 页面在不能联网的环境（例如在 Claude 里打开）也能画出沿公路的路线。
 * 运行：npx vite-node scripts/build-route-cache.ts（需要能访问 routing.openstreetmap.de）
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { TEMPLATES } from '../src/defaultTrip';
import { createDefaultTrip } from '../src/defaultTrip';
import { dayLegs, groupLegs, MODES } from '../src/route';

const BASE = {
  car: 'https://routing.openstreetmap.de/routed-car/route/v1/driving/',
  foot: 'https://routing.openstreetmap.de/routed-foot/route/v1/driving/',
  bike: 'https://routing.openstreetmap.de/routed-bike/route/v1/driving/',
};
const out: Record<string, unknown> = {};
// 每个模板的当前内容，加上它里面存着的备选方案（例如 A/B 对比里的 A）
const trips = [createDefaultTrip(), ...TEMPLATES.map((t) => t.create())].flatMap((t) => [
  t,
  ...(t.versions ?? []).map((v) => ({ ...v.snapshot, versions: [] })),
]);
for (const trip of trips) {
  for (const day of trip.days) {
    for (const g of groupLegs(dayLegs(trip, day))) {
      const profile = MODES[g.mode].profile;
      if (!profile) continue;
      const coords = g.points.map((p) => `${p.lng.toFixed(5)},${p.lat.toFixed(5)}`).join(';');
      const key = `route3:${profile}:${coords}`;
      if (out[key]) continue;
      // 网络偶尔断：重试 3 次，还不行就跳过这一段（App 里会现查或按直线估算）
      let j: { code?: string; routes?: { geometry: { coordinates: [number, number][] }; distance: number; duration: number }[] } = {};
      for (let attempt = 0; attempt < 3 && j.code !== 'Ok'; attempt++) {
        try {
          j = JSON.parse(execFileSync('curl', ['-s', '-m', '30', `${BASE[profile]}${coords}?overview=simplified&geometries=geojson`], { encoding: 'utf8' }));
        } catch {
          execFileSync('sleep', ['2']);
        }
      }
      const r = j.routes?.[0];
      if (j.code !== 'Ok' || !r) {
        console.warn(`\n跳过（取不到路线）: ${key}`);
        continue;
      }
      out[key] = {
        path: r.geometry.coordinates.map(([lng, lat]: [number, number]) => [Math.round(lat * 1e5) / 1e5, Math.round(lng * 1e5) / 1e5]),
        km: Math.round(r.distance / 1000),
        hours: Math.round((r.duration / 3600) * 10) / 10,
      };
      process.stdout.write('.');
    }
  }
}
writeFileSync('public/route-cache.json', JSON.stringify(out));
console.log(`\n${Object.keys(out).length} routes`);
