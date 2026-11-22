import { describe, expect, it } from 'vitest';
import { addDays, fuelCost, mapsUrl, summarize } from './calc';
import { createDefaultTrip } from './defaultTrip';

describe('calc', () => {
  it('addDays crosses month/year boundaries', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
  });

  it('fuelCost', () => {
    expect(fuelCost(1000, 9, 2)).toBeCloseTo(180);
  });

  it('summarize default trip', () => {
    const trip = createDefaultTrip();
    const s = summarize(trip);
    expect(s.days).toBe(9);
    expect(s.nights).toBe(8);
    expect(s.totalKm).toBe(1975);
    expect(s.byCategory.accommodation).toBe(280 + 220 + 180 + 260 + 250 * 3 + 230);
    // 餐饮 = (60*2 + 35*2) * 9 + 零食 120
    expect(s.byCategory.food).toBe(190 * 9 + 120);
    expect(s.total).toBeCloseTo(Object.values(s.byCategory).reduce((a, b) => a + b, 0));
    expect(s.paid).toBe(0);
    expect(s.unbooked).toBe(8);
  });

  it('paid totals include paid stays and expenses', () => {
    const trip = createDefaultTrip();
    trip.days[0].accommodation!.paid = true;
    trip.expenses[0].paid = true;
    const s = summarize(trip);
    expect(s.paid).toBe(280 + trip.expenses[0].amount);
    expect(s.unpaid).toBeCloseTo(s.total - s.paid);
  });

  it('mapsUrl encodes waypoints', () => {
    const url = mapsUrl('Melbourne VIC', 'Lorne VIC', ['Torquay VIC']);
    expect(url).toContain('waypoints=Torquay+VIC');
  });
});

import { migrateTrip } from './defaultTrip';
import { findPlace } from './geo';

describe('places & migration', () => {
  it('every default itinerary place has coordinates', () => {
    const trip = createDefaultTrip();
    for (const d of trip.days) {
      for (const n of [d.from, d.to, ...d.stops]) {
        expect(findPlace(trip, n), n).toBeDefined();
      }
    }
  });

  it('migrates v1 data, keeping user edits', () => {
    const v2 = createDefaultTrip();
    const v1: any = structuredClone(v2);
    v1.version = 1;
    delete v1.places;
    v1.days.forEach((d: any) => {
      delete d.stayOptions;
      delete d.dining;
    });
    v1.budget = 6000;
    const t = migrateTrip(v1)!;
    expect(t.version).toBe(2);
    expect(t.budget).toBe(6000);
    expect(t.places.length).toBeGreaterThan(10);
    expect(Array.isArray(t.days[0].dining)).toBe(true);
  });

  it('rejects garbage', () => {
    expect(migrateTrip({ foo: 1 })).toBeNull();
  });
});
