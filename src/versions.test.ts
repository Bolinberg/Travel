import { describe, expect, it } from 'vitest';
import { createDefaultTrip, duplicateTrip } from './defaultTrip';
import { addVersion, MAX_VERSIONS, restoreVersion, snapshot, versionTrip } from './versions';
import { proposalTrip, proposeByRules } from './replan';

describe('versions', () => {
  it('snapshots exclude nested versions and restore round-trips', () => {
    const t = createDefaultTrip();
    addVersion(t, '原 9 天', 'manual');
    expect((t.versions![0].snapshot as any).versions).toBeUndefined();

    const six = proposalTrip(t, proposeByRules(t, 6));
    addVersion(t, '6 天方案', 'proposal', snapshot(six));
    expect(versionTrip(t, t.versions![1]).days).toHaveLength(6);

    const restored = restoreVersion(t, t.versions![1].id);
    expect(restored.id).toBe(t.id);
    expect(restored.days).toHaveLength(6);
    // 恢复前自动保存了 9 天版本
    expect(restored.versions).toHaveLength(3);
    expect(restored.versions![2].kind).toBe('auto');
    expect(restored.versions![2].snapshot.days).toHaveLength(9);
    // 原对象未被修改
    expect(t.days).toHaveLength(9);
  });

  it('caps the list, dropping oldest auto saves first', () => {
    const t = createDefaultTrip();
    addVersion(t, 'keep', 'manual');
    for (let i = 0; i < MAX_VERSIONS + 5; i++) addVersion(t, `auto ${i}`, 'auto');
    expect(t.versions).toHaveLength(MAX_VERSIONS);
    expect(t.versions![0].label).toBe('keep');
  });

  it('duplicates do not carry history', () => {
    const t = createDefaultTrip();
    addVersion(t, 'x', 'manual');
    expect(duplicateTrip(t, 'copy', '2027-01-01').versions).toBeUndefined();
  });
});

import { createRouteComparisonTrip, COMPARE_A, COMPARE_B } from './templateKI';
import { currentPlanId, planOptions, switchPlan } from './versions';

describe('switching plans on the itinerary page', () => {
  it('switches A <-> B and keeps edits made inside each plan', () => {
    const t0 = createRouteComparisonTrip();
    const plans = planOptions(t0);
    const a = plans.find((v) => v.label === COMPARE_A)!;
    const b = plans.find((v) => v.label === COMPARE_B)!;
    expect(currentPlanId(t0)).toBe(b.id);

    const tA = switchPlan(t0, a.id);
    expect(tA.days).toHaveLength(7);
    expect(tA.name).toBe(t0.name);
    expect(tA.id).toBe(t0.id);
    expect(currentPlanId(tA)).toBe(a.id);

    tA.budget = 4321; // 在 A 里改了预算
    const tB = switchPlan(tA, b.id);
    expect(tB.days).toHaveLength(9);
    expect(tB.budget).not.toBe(4321);
    const backToA = switchPlan(tB, a.id);
    expect(backToA.budget).toBe(4321); // 切回来修改还在
    expect(backToA.versions!.filter((v) => v.kind === 'auto')).toHaveLength(0); // 没有多出杂乱的自动存档
  });

  it('auto-saves content that belongs to no plan before switching', () => {
    const t0 = createRouteComparisonTrip();
    const edited = { ...t0, activePlan: undefined, days: t0.days.slice(0, 5) };
    const a = planOptions(t0).find((v) => v.label === COMPARE_A)!;
    const next = switchPlan(edited, a.id);
    expect(next.versions!.some((v) => v.kind === 'auto')).toBe(true);
  });
});
