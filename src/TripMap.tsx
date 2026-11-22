import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Day, Place, Trip } from './types';
import { fetchRoute, fetchWiki, findPlace } from './geo';

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

  useEffect(() => {
    if (!el.current) return;
    const m = L.map(el.current, { zoomControl: true, attributionControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; OpenStreetMap',
    }).addTo(m);
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
    const pending: Promise<void>[] = [];

    for (const { d, i } of shown) {
      const pts = dayPlaces(trip, d);
      const color = dayColor(i);
      if (pts.length >= 2) {
        // 先画虚线占位，路线返回后替换为真实道路
        const line = L.polyline(
          pts.map((p) => [p.lat, p.lng] as [number, number]),
          { color, weight: 3, opacity: 0.6, dashArray: '6 6' },
        ).addTo(g);
        pending.push(
          fetchRoute(pts).then((r) => {
            if (!alive || !r) return;
            line.setLatLngs(r.path);
            line.setStyle({ dashArray: undefined, opacity: 0.85, weight: 4 });
          }),
        );
      }
      pts.forEach((p, k) => {
        bounds.push([p.lat, p.lng]);
        const isEnd = k === pts.length - 1 && p.name === d.to;
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

    if (bounds.length) m.fitBounds(L.latLngBounds(bounds), { padding: [24, 24], maxZoom: 12, animate: false });
    setRouting(pending.length > 0);
    Promise.all(pending).then(() => alive && setRouting(false));
    return () => {
      alive = false;
    };
  }, [trip, focus]);

  // 容器尺寸变化（切换标签页）时刷新
  useEffect(() => {
    const t = setTimeout(() => map.current?.invalidateSize(), 50);
    return () => clearTimeout(t);
  });

  return (
    <div className="map-wrap">
      <div ref={el} className="map" style={{ height }} />
      {routing && <div className="map-note">正在加载真实道路路线…</div>}
    </div>
  );
}
