import { describe, expect, it } from 'vitest';
import { addPlanE, COMPARE_D, COMPARE_E, createRouteComparisonTrip, upgradeComparison } from './templateKI';
import { planOptions } from './versions';

describe('方案 E：D 去掉袋鼠岛、阿德莱德直接回家', () => {
  const fresh = createRouteComparisonTrip();
  // 老设备：还没有 E 的行程
  const trip = { ...fresh, offered: undefined, versions: fresh.versions!.filter((v) => v.label !== COMPARE_E) };
  const up = upgradeComparison(trip);
  const e = up.versions!.find((v) => v.label === COMPARE_E)!;
  const d = up.versions!.find((v) => v.label === COMPARE_D)!;
  it('加了 E，没切换，D 没变', () => {
    expect(e).toBeTruthy();
    expect(up.activePlan).toBe(trip.activePlan);
    expect(d.snapshot.days.length).toBe(9);
  });
  it('只剩阿德莱德之前的天，加一天直接回 Point Cook', () => {
    const days = e.snapshot.days;
    expect(days.map((x) => x.to)).toEqual(['Mount Gambier SA', 'Adelaide SA', 'Adelaide SA', 'Point Cook VIC']);
    const last = days[3];
    expect(last.from).toBe('Adelaide SA');
    expect(last.stops).toEqual([]);
    expect(last.accommodation).toBeNull();
    expect(JSON.stringify([days, e.snapshot.expenses])).not.toMatch(/Vivonne Bay|SeaLink|海狮湾|Halls Gap/);
    // 前三天的住宿、记账原样保留
    expect(days[0].accommodation?.name).toBe(d.snapshot.days[0].accommodation?.name);
    expect(e.snapshot.expenses.some((x) => /动物园家庭票/.test(x.title))).toBe(true);
  });
  it('新设备直接就有 E', () => {
    expect(fresh.versions!.some((v) => v.label === COMPARE_E)).toBe(true);
  });
  it('只加一次；删掉后不会再加回来；方案按钮里同名的只显示一个', () => {
    expect(addPlanE(up)).toBe(up);
    const removed = { ...up, versions: up.versions!.filter((v) => v.label !== COMPARE_E) };
    expect(addPlanE(removed)).toBe(removed);
    const dup = { ...up, versions: [...up.versions!, { ...d, id: 'dup', createdAt: '2000-01-01' }] };
    expect(planOptions(dup).filter((v) => v.label === COMPARE_D).length).toBe(1);
  });
});

import { addPlanF, COMPARE_F } from './templateKI';
describe('方案 F：E 的基础上阿德莱德多住两晚', () => {
  const fresh = createRouteComparisonTrip();
  const f = fresh.versions!.find((v) => v.label === COMPARE_F)!;
  const e = fresh.versions!.find((v) => v.label === COMPARE_E)!;
  it('6 天：E 的前三天 + 海边一天 + 袋鼠考拉一天 + 开回家', () => {
    const days = f.snapshot.days;
    expect(days.map((x) => x.to)).toEqual(['Mount Gambier SA', 'Adelaide SA', 'Adelaide SA', 'Adelaide SA', 'Adelaide SA', 'Point Cook VIC']);
    expect(days[3].stops).toContain('Glenelg SA');
    expect(days[3].mode).toBe('transit');
    expect(days[4].stops).toContain('Cleland Wildlife Park SA');
    expect(days[3].accommodation?.name).toBe(e.snapshot.days[2].accommodation?.name);
    expect(days[4].accommodation?.booked).toBe(false);
    expect(days[5].title).toContain('直接开回');
    expect(f.snapshot.expenses.some((x) => /阿德莱德停车（4 晚）/.test(x.title))).toBe(true);
    expect(f.snapshot.places.some((p) => p.name === 'Mount Lofty Summit SA')).toBe(true);
    expect(e.snapshot.days).toHaveLength(4); // E 不变
  });
  it('E 被删了也能从 D 生成；只加一次', () => {
    const noE = { ...fresh, offered: ['E'], versions: fresh.versions!.filter((v) => v.label !== COMPARE_E && v.label !== COMPARE_F) };
    const up = addPlanF(noE);
    expect(up.versions!.find((v) => v.label === COMPARE_F)!.snapshot.days).toHaveLength(6);
    expect(addPlanF(up)).toBe(up);
  });
});
