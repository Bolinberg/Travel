import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Day, Mode, Place, Trip } from './types';
import { fetchWiki, findPlace } from './geo';
import { dayLegs, groupLegs, MODES, routeGroup, sketchSegment } from './route';

export const DAY_COLORS = ['#0f766e', '#c2410c', '#7c3aed', '#0369a1', '#be123c', '#4d7c0f', '#a16207', '#0e7490', '#9d174d'];
export const dayColor = (i: number) => DAY_COLORS[i % DAY_COLORS.length];

/** 某天按顺序经过的地点（出发地、途经点、目的地），缺坐标的跳过 */
export function dayPlaces(trip: Trip, day: Day): Place[] {
  const names = [day.from, ...day.stops, day.to].filter((n) => n.trim());
  const out: Place[] = [];
  for (const n of names) {
    const p = findPlace(trip, n);
    if (p && out[out.length - 1] !== p) out.push(p);
  }
  return out;
}

/** 各交通方式的线型（颜色用当天颜色；轮渡固定蓝色） */
function lineStyle(mode: Mode, color: string, routed: boolean): L.PolylineOptions {
  if (!routed && MODES[mode].profile) {
    // 本应有真实道路但还没拿到：浅色虚线
    return { color, weight: 3, opacity: 0.5, dashArray: '6 8' };
  }
  switch (mode) {
    case 'drive':
      return { color, weight: 5, opacity: 0.85 };
    case 'walk':
      return { color, weight: 4, opacity: 0.9, dashArray: '1 8', lineCap: 'round' };
    case 'bike':
      return { color, weight: 4, opacity: 0.9, dashArray: '10 6' };
    case 'transit':
      return { color, weight: 4, opacity: 0.85, dashArray: '14 6 2 6' };
    case 'ferry':
      return { color: '#0284c7', weight: 4, opacity: 0.9, dashArray: '10 10' };
    case 'flight':
      return { color, weight: 2, opacity: 0.9, dashArray: '4 6' };
  }
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function popupHtml(p: Place, img?: string) {
  return `<div class="pop">
    ${img ? `<img src="${escapeHtml(img)}" alt="" />` : ''}
    <b>${escapeHtml(p.label)}</b>
    ${p.desc ? `<p>${escapeHtml(p.desc)}</p>` : ''}
  </div>`;
}

const TILES = [
  {
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    opts: { subdomains: 'abcd', maxZoom: 19, attribution: '&copy; OpenStreetMap &copy; CARTO' },
  },
  { url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', opts: { maxZoom: 19, attribution: '&copy; OpenStreetMap' } },
];

export default function TripMap({
  trip,
  focus,
  height = 420,
}: {
  trip: Trip;
  /** 只显示某一天（下标），null 显示全程 */
  focus: number | null;
  height?: number;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const [routing, setRouting] = useState(false);
  const [failed, setFailed] = useState(0);
  const [retry, setRetry] = useState(0);
  const [modesUsed, setModesUsed] = useState<Mode[]>([]);

  useEffect(() => {
    if (!el.current) return;
    const m = L.map(el.current, { zoomControl: true, attributionControl: true });
    // 底图：CARTO（本地打开文件也能加载）；连续出错则换 OpenStreetMap
    let tileIdx = 0;
    let errors = 0;
    let tiles = L.tileLayer(TILES[0].url, TILES[0].opts).addTo(m);
    const onErr = () => {
      if (++errors < 4 || tileIdx >= TILES.length - 1) return;
      tileIdx++;
      errors = 0;
      m.removeLayer(tiles);
      tiles = L.tileLayer(TILES[tileIdx].url, TILES[tileIdx].opts).addTo(m);
      tiles.on('tileerror', onErr);
    };
    tiles.on('tileerror', onErr);
    m.setView([-37.0, 141.5], 6);
    map.current = m;
    layer.current = L.layerGroup().addTo(m);
    return () => {
      m.stop();
      m.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    const g = layer.current;
    if (!m || !g) return;
    g.clearLayers();
    let alive = true;
    const bounds: L.LatLngExpression[] = [];
    const shown = trip.days.map((d, i) => ({ d, i })).filter(({ i }) => focus === null || focus === i);
    const pending: Promise<boolean>[] = [];
    const used = new Set<Mode>();

    for (const { d, i } of shown) {
      const color = dayColor(i);
      for (const grp of groupLegs(dayLegs(trip, d))) {
        used.add(grp.mode);
        // 先画示意线，路线返回后替换为真实道路
        const sketch = sketchSegment(grp.mode, grp.points);
        const line = L.polyline(sketch.path, lineStyle(grp.mode, color, !MODES[grp.mode].profile)).addTo(g);
        const tip = (routed: boolean, km: number, h: number) =>
          `D${i + 1} ${MODES[grp.mode].icon} ${MODES[grp.mode].label} · 约 ${km} km · ${h} 小时${routed ? '' : '（示意线）'}`;
        line.bindTooltip(tip(false, sketch.km, sketch.hours), { sticky: true });
        // 非自驾段在中点放一个交通方式图标
        if (grp.mode !== 'drive') {
          const mid = sketch.path[Math.floor(sketch.path.length / 2)] ?? sketch.path[0];
          const a = grp.points[0];
          const b = grp.points[grp.points.length - 1];
          const at: [number, number] = sketch.path.length > 2 ? mid : [(a.lat + b.lat) / 2, (a.lng + b.lng) / 2];
          L.marker(at, {
            icon: L.divIcon({ className: '', html: `<div class="mode-pin">${MODES[grp.mode].icon}</div>`, iconSize: [24, 24], iconAnchor: [12, 12] }),
            interactive: false,
          }).addTo(g);
        }
        if (MODES[grp.mode].profile) {
          pending.push(
            routeGroup(grp).then((r) => {
              if (!alive) return true;
              if (r.routed) {
                line.setLatLngs(r.path);
                line.setStyle(lineStyle(grp.mode, color, true));
              }
              line.setTooltipContent(tip(r.routed, r.km, r.hours));
              return r.routed;
            }),
          );
        }
      }

      const pts = dayPlaces(trip, d);
      pts.forEach((p, k) => {
        bounds.push([p.lat, p.lng]);
        const isEnd = k === pts.length - 1 && p.name === findPlace(trip, d.to)?.name;
        const icon = L.divIcon({
          className: '',
          html: isEnd
            ? `<div class="pin end" style="background:${color}">${i + 1}</div>`
            : `<div class="pin stop" style="border-color:${color}"></div>`,
          iconSize: isEnd ? [26, 26] : [14, 14],
          iconAnchor: isEnd ? [13, 13] : [7, 7],
        });
        const mk = L.marker([p.lat, p.lng], { icon, title: p.label, zIndexOffset: isEnd ? 100 : 0 }).addTo(g);
        mk.bindPopup(popupHtml(p), { maxWidth: 240 });
        mk.on('popupopen', () => {
          if (!p.wiki) return;
          fetchWiki(p.wiki).then((w) => w?.thumb && mk.setPopupContent(popupHtml(p, w.thumb)));
        });
      });
    }

    setModesUsed([...used]);
    if (bounds.length) m.fitBounds(L.latLngBounds(bounds), { padding: [24, 24], maxZoom: 13, animate: false });
    setRouting(pending.length > 0);
    setFailed(0);
    Promise.all(pending).then((res) => {
      if (!alive) return;
      setRouting(false);
      setFailed(res.filter((ok) => !ok).length);
    });
    return () => {
      alive = false;
    };
  }, [trip, focus, retry]);

  // 容器尺寸变化（切换标签页）时刷新
  useEffect(() => {
    const t = setTimeout(() => map.current?.invalidateSize(), 50);
    return () => clearTimeout(t);
  });

  return (
    <div className="map-wrap">
      <div ref={el} className="map" style={{ height }} />
      {routing && <div className="map-note">正在获取真实路线…</div>}
      {!routing && failed > 0 && (
        <div className="map-note warn">
          {failed} 段未能获取真实道路，暂显示为虚线{' '}
          <button className="link" onClick={() => setRetry((n) => n + 1)}>重试</button>
        </div>
      )}
      {modesUsed.length > 1 || (modesUsed.length === 1 && modesUsed[0] !== 'drive') ? (
        <div className="map-legend">
          {modesUsed.map((m) => (
            <span key={m}>
              <i className={`lg lg-${m}`} /> {MODES[m].icon} {MODES[m].label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
