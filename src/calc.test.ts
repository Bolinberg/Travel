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
