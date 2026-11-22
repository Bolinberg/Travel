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
