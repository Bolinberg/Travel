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
