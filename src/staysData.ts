import type { VerifiedStay } from './stays';

/** 核实日期 */
export const STAYS_CHECKED = '';

/** 过夜地（Day.to）→ 已核实的住宿（待填） */
export const VERIFIED_STAYS: Record<string, VerifiedStay[]> = {};
