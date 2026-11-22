import type { Trip, TripVersion } from './types';
import { newId } from './id';

export const MAX_VERSIONS = 20;

export function snapshot(trip: Trip): TripVersion['snapshot'] {
  const { versions: _v, ...core } = structuredClone(trip);
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
  return { ...structuredClone(v.snapshot), id: trip.id, versions };
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
