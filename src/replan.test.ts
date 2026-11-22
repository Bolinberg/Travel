import { describe, expect, it } from 'vitest';
import { compare, proposalFromAi, proposalTrip, proposeByRules } from './replan';
import { createDefaultTrip } from './defaultTrip';
import { validateReplan } from './ai';

describe('replan by rules', () => {
  const trip = createDefaultTrip();

  it('shortens 9 → 6 keeping endpoints and total distance', () => {
    const p = proposeByRules(trip, 6);
    expect(p.days).toHaveLength(6);
    expect(p.days[0].day.from).toBe('Melbourne VIC');
    expect(p.days[5].day.to).toBe('Melbourne VIC');
    expect(p.days[5].day.accommodation).toBeNull();
    const km = p.days.reduce((s, d) => s + d.day.km, 0);
    expect(km).toBe(1975);
    // 每个原日期都被覆盖一次
    expect(p.days.flatMap((d) => d.sources).sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(new Set(p.days.map((d) => d.day.id)).size).toBe(6);
    // 不修改原行程
    expect(trip.days).toHaveLength(9);
  });

  it('merged days keep the passed-through town as a stop', () => {
    const p = proposeByRules(trip, 8);
    const m = p.days.find((d) => d.kind === 'merged')!;
    const [a, b] = m.sources.map((i) => trip.days[i]);
    if (a.to !== a.from && a.to !== b.to) expect(m.day.stops).toContain(a.to);
  });

  it('lengthens 9 → 11 by splitting the long drive first', () => {
    const p = proposeByRules(trip, 11);
    expect(p.days).toHaveLength(11);
    expect(p.days.some((d) => d.kind === 'split')).toBe(true);
    expect(Math.max(...p.days.map((d) => d.day.driveHours))).toBeLessThan(5.5);
  });

  it('comparison and expense remap', () => {
    const p = proposeByRules(trip, 6);
    const after = proposalTrip(trip, p);
    const c = compare(trip, after);
    expect(c.after.days).toBe(6);
    expect(c.after.nights).toBe(5);
    expect(c.after.total).toBeLessThan(c.before.total);
    const ids = new Set(after.days.map((d) => d.id));
    for (const e of after.expenses) if (e.dayId) expect(ids.has(e.dayId)).toBe(true);
  });
});

describe('replan by AI (parsing)', () => {
  const trip = createDefaultTrip();
  const raw = {
    summary: '缩短为 3 天',
    days: [
      { title: 'A', from: 'Melbourne VIC', to: 'Apollo Bay VIC', stops: ['Lorne VIC'], km: 195, driveHours: 3.5, overnight: true, sources: [1], kind: 'same', reason: '', notes: '' },
      { title: 'B', from: 'Apollo Bay VIC', to: 'Port Campbell VIC', stops: ['Twelve Apostles VIC'], km: 100, driveHours: 1.5, overnight: true, sources: [2, 99], kind: 'edited', reason: '', notes: '' },
      { title: 'C', from: 'Port Campbell VIC', to: 'Melbourne VIC', stops: [], km: 230, driveHours: 3, overnight: false, sources: [], kind: 'added', reason: '', notes: '' },
    ],
    places: [{ name: 'Port Campbell VIC', label: '坎贝尔港', lat: -38.62, lng: 142.99, desc: '' }],
  };

  it('validates and builds a proposal', () => {
    expect(() => validateReplan(raw, 9, 4)).toThrow();
    const plan = validateReplan(raw, 9, 3);
    expect(plan.days[1].sources).toEqual([2]); // 99 越界被去掉
    const p = proposalFromAi(trip, plan);
    expect(p.days[0].day.accommodation?.cost).toBe(trip.days[0].accommodation!.cost); // 沿用原住宿
    expect(p.days[0].day.id).toBe(trip.days[0].id);
    expect(p.days[1].day.accommodation?.name).toBe('Port Campbell VIC 住宿');
    expect(p.days[2].day.accommodation).toBeNull();
    const after = proposalTrip(trip, p);
    expect(after.places.some((x) => x.name === 'Port Campbell VIC')).toBe(true);
  });
});
