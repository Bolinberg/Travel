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

import { createSevenDayTrip } from './templateKI';

describe('7-day Blue Lake round trip', () => {
  const t = createSevenDayTrip();
  it('drives straight to Blue Lake then Adelaide, and keeps everything else', () => {
    expect(t.days).toHaveLength(7);
    expect(t.days[0].to).toBe('Mount Gambier SA');
    expect(t.days[0].stops).toContain('Blue Lake, Mount Gambier SA');
    expect(t.days[1].to).toBe('Adelaide SA');
    expect(t.days[6].to).toBe('Melbourne VIC');
    expect(t.days.flatMap((d) => d.stops)).toEqual(expect.arrayContaining(['Adelaide Zoo SA', 'South Australian Museum SA', 'Seal Bay Conservation Park SA']));
    expect(t.days.filter((d) => d.to === 'Adelaide SA' && d.accommodation).length).toBe(3);
    expect(new Set(t.days.map((d) => d.id)).size).toBe(7);
    for (const d of t.days) for (const n of [d.from, d.to, ...d.stops]) expect(findPlace(t, n), n).toBeDefined();
    for (const e of t.expenses) if (e.dayId) expect(t.days.some((d) => d.id === e.dayId)).toBe(true);
    expect(t.expenses.filter((e) => e.dayId).length).toBeGreaterThan(3);
  });
});

import { createNineDayTrip } from './templateKI';

describe('9-day plan: 2 nights on Kangaroo Island, home via the Grampians', () => {
  const t = createNineDayTrip();
  it('has the requested shape', () => {
    expect(t.days).toHaveLength(9);
    expect(t.days[8].to).toBe('Melbourne VIC');
    const kiNights = t.days.filter((d) => d.to === 'Vivonne Bay SA' && d.accommodation).length;
    expect(kiNights).toBe(2);
    expect(t.days[7].to).toBe('Halls Gap VIC');
    expect(t.days.flatMap((d) => d.stops)).toContain('The Pinnacle Lookout, Grampians VIC');
    expect(Math.max(...t.days.map((d) => d.driveHours))).toBeLessThanOrEqual(5.3);
    // 第 1 天走大洋路全程
    expect(t.days[0].stops).toEqual(expect.arrayContaining(['Lorne VIC', 'Apollo Bay VIC', 'Twelve Apostles VIC']));
    expect(t.days[1].stops).toContain('Blue Lake, Mount Gambier SA');
    expect(new Set(t.days.map((d) => d.id)).size).toBe(9);
    for (const d of t.days) for (const n of [d.from, d.to, ...d.stops]) expect(findPlace(t, n), n).toBeDefined();
    for (const e of t.expenses) if (e.dayId) expect(t.days.some((d) => d.id === e.dayId)).toBe(true);
    expect(summarize(t).nights).toBe(8);
  });
});

import { createRouteComparisonTrip, COMPARE_A, COMPARE_B, COMPARE_C } from './templateKI';
import { versionTrip } from './versions';

describe('route comparison A vs B from Point Cook', () => {
  const t = createRouteComparisonTrip();
  const [va, vb] = t.versions!.slice().reverse();
  it('holds both routes as proposals', () => {
    expect(t.versions!.map((v) => v.label)).toEqual([COMPARE_B, COMPARE_A, COMPARE_C]);
    const a = versionTrip(t, t.versions!.find((v) => v.label === COMPARE_A)!);
    const b = versionTrip(t, t.versions!.find((v) => v.label === COMPARE_B)!);
    expect(a.days).toHaveLength(7);
    expect(a.days[4].to).toBe('Adelaide SA'); // 第 5 天回阿德莱德住
    expect(a.days[5].from).toBe('Adelaide SA');
    expect(a.days[5].to).toBe('Dimboola VIC');
    expect(a.days[6].stops).toContain('The Pinnacle Lookout, Grampians VIC');
    expect(a.days.filter((d) => d.to === 'Vivonne Bay SA' && d.accommodation).length).toBe(1);
    expect(Math.max(...a.days.slice(2).map((d) => d.driveHours))).toBeLessThanOrEqual(5);
    expect(b.days).toHaveLength(9);
    expect(a.days[0].from).toBe('Point Cook VIC');
    expect(a.days[0].to).toBe('Mount Gambier SA');
    expect(a.days[1].to).toBe('Adelaide SA');
    expect(b.days[0].to).toBe('Port Campbell VIC');
    expect(b.days[2].to).toBe('Adelaide SA');
    for (const tr of [a, b]) {
      expect(tr.days[tr.days.length - 1].to).toBe('Point Cook VIC');
      for (const d of tr.days) for (const n of [d.from, d.to, ...d.stops]) expect(findPlace(tr, n), n).toBeDefined();
      for (const e of tr.expenses) if (e.dayId) expect(tr.days.some((d) => d.id === e.dayId)).toBe(true);
    }
    expect(summarize(a).totalKm).toBeLessThan(summarize(b).totalKm + 200);
    expect(va && vb).toBeTruthy();
  });
});

import { upgradeComparison } from './templateKI';
import { currentPlanId } from './versions';

describe('upgrading an existing A/B comparison on a device', () => {
  it('replaces the old A (keeping it as history) and moves a viewer of old A to the new A', () => {
    const t = createRouteComparisonTrip();
    // 模拟旧设备：A 是旧标签、正在看 A
    const oldA = t.versions!.find((v) => v.label === COMPARE_A)!;
    oldA.label = 'A：去程直达蓝湖、回程 2 天（7 天）';
    const onOldA = { ...structuredClone(oldA.snapshot), id: t.id, name: t.name, versions: t.versions, activePlan: oldA.id };
    const up = upgradeComparison(onOldA);
    expect(up.versions!.some((v) => v.label === COMPARE_A && v.kind === 'proposal')).toBe(true);
    expect(up.versions!.some((v) => v.label.endsWith('（旧版）') && v.kind === 'manual')).toBe(true);
    expect(up.days[5].to).toBe('Dimboola VIC');
    expect(up.versions!.find((v) => v.id === currentPlanId(up))!.label).toBe(COMPARE_A);
    // 已经是新版就不动
    expect(upgradeComparison(up)).toBe(up);
  });
});

describe('方案 C：去程住 Apollo Bay 和蓝湖', () => {
  const t = createRouteComparisonTrip();
  const c = versionTrip(t, t.versions!.find((v) => v.label === COMPARE_C)!);
  it('第 1 晚 Apollo Bay，第 2 晚甘比尔山，第 3 天到阿德莱德，之后和 B 一样', () => {
    expect(c.days).toHaveLength(9);
    expect(c.days[0].to).toBe('Apollo Bay VIC');
    expect(c.days[1].to).toBe('Mount Gambier SA');
    expect(c.days[2].to).toBe('Adelaide SA');
    const b = versionTrip(t, t.versions!.find((v) => v.label === COMPARE_B)!);
    expect(c.days.slice(3).map((d) => d.to)).toEqual(b.days.slice(3).map((d) => d.to));
    expect(c.days[0].stayOptions.some((r) => r.bookingUrl)).toBe(true);
  });
  it('已有对比的设备会补上 C，且不切换当前方案', () => {
    const old = structuredClone(t);
    old.versions = old.versions!.filter((v) => v.label !== COMPARE_C);
    const up = upgradeComparison(old);
    expect(up.versions!.some((v) => v.label === COMPARE_C)).toBe(true);
    expect(up.activePlan).toBe(old.activePlan);
    expect(upgradeComparison(up)).toBe(up);
  });
});
