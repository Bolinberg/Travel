import type { Rec } from './types';

type R = Omit<Rec, 'id' | 'picked'>;

/** 第 i 天（从 0 开始）的住宿 / 餐饮推荐。待联网核实后填入。 */
export const GUIDES: Record<number, { stays?: R[]; dining?: R[] }> = {};
