import { describe, expect, it } from 'vitest';
import { autoMode, routeKey } from './autoRoute';
import { createDefaultTrip } from './defaultTrip';
import type { Day } from './types';

const base = (over: Partial<Day>): Day => ({
  id: 'd', title: '', from: 'A', to: 'B', km: 0, driveHours: 0, stops: [], accommodation: null, stayOptions: [], dining: [], notes: '', ...over,
});

describe('只填地址，交通方式自动定', () => {
  const t = createDefaultTrip();
  t.places.push(
    { name: 'A', label: 'A', lat: -34.9285, lng: 138.6007 }, // 阿德莱德
    { name: 'B', label: 'B', lat: -35.5522, lng: 138.6178 }, // Victor Harbor，约 70 km
    { name: 'C', label: 'C', lat: -34.915, lng: 138.606 }, // 阿德莱德动物园，约 1.5 km
  );
  it('步行日改去远处 → 自驾', () => {
    expect(autoMode(t, base({ mode: 'walk' }))).toBe('drive');
  });
  it('同城短距离来回 → 步行', () => {
    expect(autoMode(t, base({ from: 'A', to: 'A', stops: ['C'] }))).toBe('walk');
  });
  it('正常自驾不动', () => {
    expect(autoMode(t, base({}))).toBeUndefined();
  });
  it('地址或交通方式变了，routeKey 就变', () => {
    const d = base({});
    expect(routeKey(d)).not.toBe(routeKey({ ...d, stops: ['C'] }));
    expect(routeKey(d)).not.toBe(routeKey({ ...d, mode: 'walk' }));
    expect(routeKey(d)).toBe(routeKey({ ...d, stops: ['  '] }));
  });
});
