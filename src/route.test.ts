import { describe, expect, it } from 'vitest';
import { createDefaultTrip } from './defaultTrip';
import { dayLegs, googleDirections, greatCircle, groupLegs, haversineKm, insertStop, modeSummary, orderStops, sketchSegment } from './route';
import { summarize } from './calc';

describe('route', () => {
  it('haversine Melbourne–Adelaide ≈ 650 km', () => {
    const km = haversineKm({ lat: -37.8136, lng: 144.9631 }, { lat: -34.9285, lng: 138.6007 });
    expect(km).toBeGreaterThan(640);
    expect(km).toBeLessThan(660);
  });

  it('legs use per-leg modes and group consecutive routable legs', () => {
    const t = createDefaultTrip();
    const d = t.days[5]; // Adelaide 周边：Central Market, Botanic Garden, Glenelg
    expect(groupLegs(dayLegs(t, d))).toHaveLength(1);
    d.legModes = { 'Glenelg SA': 'transit' };
    const groups = groupLegs(dayLegs(t, d));
    expect(groups.map((g) => g.mode)).toEqual(['drive', 'transit', 'drive']);
    expect(modeSummary(d)).toBe('🚗 自驾 + 🚆 公交/火车/电车');
  });

  it('flight sketch is a great-circle arc with airport overhead', () => {
    const t = createDefaultTrip();
    const mel = t.places.find((p) => p.name === 'Melbourne VIC')!;
    const adl = t.places.find((p) => p.name === 'Adelaide SA')!;
    expect(greatCircle(mel, adl).length).toBe(33);
    const s = sketchSegment('flight', [mel, adl]);
    expect(s.routed).toBe(false);
    expect(s.hours).toBeGreaterThan(2.9);
  });

  it('orders scrambled stops back along the route', () => {
    const t = createDefaultTrip();
    const d = t.days[0];
    const good = [...d.stops];
    d.stops = [good[3], good[0], good[2], good[1]];
    expect(orderStops(t, d)).toEqual(good);
  });

  it('inserts a new stop at the most direct position', () => {
    const t = createDefaultTrip();
    const d = t.days[0]; // Melbourne → Apollo Bay via Torquay … Lorne
    t.places.push({ name: 'Anglesea VIC', label: 'Anglesea', lat: -38.4072, lng: 144.1867 });
    const s = insertStop(t, d, 'Anglesea VIC');
    expect(s.indexOf('Anglesea VIC')).toBeGreaterThan(s.indexOf('Bells Beach VIC'));
    expect(s.indexOf('Anglesea VIC')).toBeLessThan(s.indexOf('Lorne VIC'));
  });

  it('google link carries travel mode; fuel only for driving days', () => {
    const t = createDefaultTrip();
    expect(googleDirections(t.days[0])).toContain('travelmode=driving');
    const before = summarize(t).byCategory.fuel;
    t.days[5].mode = 'transit';
    expect(googleDirections(t.days[5])).toContain('travelmode=transit');
    expect(googleDirections(t.days[5])).not.toContain('waypoints');
    expect(summarize(t).byCategory.fuel).toBeLessThan(before);
  });
});
