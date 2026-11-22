import { describe, expect, it } from 'vitest';
import { createKangarooIslandTrip } from './templateKI';
import { findPlace } from './geo';
import { groupLegs, dayLegs } from './route';
import { summarize } from './calc';

describe('6-day Kangaroo Island template', () => {
  const t = createKangarooIslandTrip();

  it('meets the family constraints', () => {
    expect(t.days).toHaveLength(6);
    expect(Math.max(...t.days.map((d) => d.driveHours))).toBeLessThanOrEqual(5);
    // 阿德莱德住 2 晚，经过甘比尔山，去袋鼠岛
    expect(t.days.filter((d) => d.to === 'Adelaide SA' && d.accommodation).length).toBe(2);
    expect(t.days.some((d) => d.stops.includes('Mount Gambier SA'))).toBe(true);
    expect(t.days.some((d) => d.stops.includes('Seal Bay Conservation Park SA'))).toBe(true);
    expect(summarize(t).nights).toBe(6);
  });

  it('every place has coordinates and ferry legs are marked', () => {
    for (const d of t.days) for (const n of [d.from, d.to, ...d.stops]) expect(findPlace(t, n), n).toBeDefined();
    expect(groupLegs(dayLegs(t, t.days[4])).map((g) => g.mode)).toEqual(['drive', 'ferry', 'drive']);
    expect(groupLegs(dayLegs(t, t.days[5])).map((g) => g.mode)).toEqual(['drive', 'ferry', 'drive']);
  });

  it('every day has stay (when overnight) and dining recommendations', () => {
    for (const d of t.days) {
      if (d.accommodation) expect(d.stayOptions.length, d.title).toBeGreaterThan(0);
      expect(d.dining.length, d.title).toBeGreaterThan(0);
    }
  });
});

import { createLoopTrip } from './templateKI';

describe('6-day round trip template', () => {
  const t = createLoopTrip();
  it('returns to Melbourne in 6 days within the family limits', () => {
    expect(t.days).toHaveLength(6);
    expect(t.days[0].from).toBe('Melbourne VIC');
    expect(t.days[5].to).toBe('Melbourne VIC');
    expect(t.days[5].accommodation).toBeNull();
    expect(Math.max(...t.days.map((d) => d.driveHours))).toBeLessThanOrEqual(5);
    expect(t.days.filter((d) => d.to === 'Adelaide SA' && d.accommodation).length).toBe(2);
    expect(t.days.some((d) => d.stops.includes('Mount Gambier SA'))).toBe(true);
    for (const d of t.days) for (const n of [d.from, d.to, ...d.stops]) expect(findPlace(t, n), n).toBeDefined();
  });
});

import { createGrandTrip } from './templateKI';

describe('8-day grand round trip', () => {
  const t = createGrandTrip();
  it('fits everything the family asked for', () => {
    expect(t.days).toHaveLength(8);
    expect(t.days[0].from).toBe('Melbourne VIC');
    expect(t.days[7].to).toBe('Melbourne VIC');
    expect(Math.max(...t.days.map((d) => d.driveHours))).toBeLessThanOrEqual(5);
    const stops = t.days.flatMap((d) => d.stops);
    for (const s of ['Mount Gambier SA', 'Adelaide Zoo SA', 'South Australian Museum SA', 'Art Gallery of South Australia SA', 'Seal Bay Conservation Park SA'])
      expect(stops, s).toContain(s);
    expect(t.days.filter((d) => d.to === 'Adelaide SA' && d.accommodation).length).toBe(3);
    expect(new Set(t.days.map((d) => d.id)).size).toBe(8);
    for (const d of t.days) for (const n of [d.from, d.to, ...d.stops]) expect(findPlace(t, n), n).toBeDefined();
    const linked = t.expenses.filter((e) => e.dayId);
    for (const e of linked) expect(t.days.some((d) => d.id === e.dayId)).toBe(true);
  });
});
