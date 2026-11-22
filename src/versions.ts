import type { Trip, TripVersion } from './types';
import { newId } from './id';

export const MAX_VERSIONS = 20;

export function snapshot(trip: Trip): TripVersion['snapshot'] {
  const { versions: _v, activePlan: _a, ...core } = structuredClone(trip);
  return core;
}

/** 新增一个版本（就地修改 trip）。超过上限时先删最旧的自动版本，再删最旧的其他版本。 */
export function addVersion(
  trip: Trip,
  label: string,
  kind: TripVersion['kind'],
  core: TripVersion['snapshot'] = snapshot(trip),
): TripVersion {
  const v: TripVersion = { id: newId(), label, kind, createdAt: new Date().toISOString(), snapshot: { ...core, id: trip.id } };
  const list = [...(trip.versions ?? []), v];
  while (list.length > MAX_VERSIONS) {
    const i = list.findIndex((x) => x.kind === 'auto');
    list.splice(i >= 0 ? i : 0, 1);
  }
  trip.versions = list;
  return v;
}

/** 用某个版本替换当前内容（先自动保存当前），保留行程 id 和版本列表 */
export function restoreVersion(trip: Trip, versionId: string): Trip {
  const v = trip.versions?.find((x) => x.id === versionId);
  if (!v) return trip;
  const next: Trip = { ...structuredClone(trip) };
  addVersion(next, `恢复「${v.label}」之前`, 'auto');
  const versions = next.versions;
  return { ...structuredClone(v.snapshot), id: trip.id, versions, activePlan: v.kind === 'proposal' ? v.id : undefined };
}

/** 把版本转成可展示 / 对比的完整行程 */
export function versionTrip(trip: Trip, v: TripVersion): Trip {
  return { ...structuredClone(v.snapshot), id: trip.id, versions: [] };
}

export const KIND_LABEL: Record<TripVersion['kind'], string> = {
  auto: '自动保存',
  manual: '手动保存',
  proposal: '备选方案',
};

/** 行程里可以直接切换的备选方案（最多 4 个，按添加顺序） */
export function planOptions(trip: Trip): TripVersion[] {
  return (trip.versions ?? [])
    .filter((v) => v.kind === 'proposal')
    .slice(-4)
    .sort((a, b) => a.label.localeCompare(b.label, 'zh'));
}

const sameDays = (a: Trip['days'], b: Trip['days']) => JSON.stringify(a) === JSON.stringify(b);

/** 当前内容对应哪个方案：优先看 activePlan，否则找内容完全相同的方案 */
export function currentPlanId(trip: Trip): string | undefined {
  const opts = planOptions(trip);
  if (trip.activePlan && opts.some((v) => v.id === trip.activePlan)) return trip.activePlan;
  return opts.find((v) => sameDays(v.snapshot.days, trip.days))?.id;
}

/**
 * 在行程页切换方案：先把当前内容存回它所属的方案（保留在这个方案里做的修改），
 * 再换成目标方案的内容。行程名称和 id 不变；当前内容不属于任何方案时先自动存档。
 */
export function switchPlan(trip: Trip, versionId: string): Trip {
  const target = trip.versions?.find((v) => v.id === versionId);
  if (!target) return trip;
  const next: Trip = structuredClone(trip);
  const from = currentPlanId(trip);
  if (from === versionId) return trip;
  if (from) {
    const v = next.versions!.find((x) => x.id === from)!;
    v.snapshot = { ...snapshot(trip), name: v.snapshot.name };
  } else {
    addVersion(next, '切换方案前的行程', 'auto');
  }
  const versions = next.versions;
  return { ...structuredClone(target.snapshot), id: trip.id, name: trip.name, versions, activePlan: versionId };
}
