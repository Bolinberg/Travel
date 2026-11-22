import { describe, expect, it } from 'vitest';
import { applyResult, validateResult } from './ai';
import { createBlankTrip } from './defaultTrip';
import { findPlace } from './geo';

const sample = {
  sights: [
    { name: 'Bondi Beach NSW', label: '邦迪海滩', desc: '著名海滩', lat: -33.8915, lng: 151.2767, wiki: 'Bondi Beach' },
    { name: 'Bad Coords', label: 'x', desc: 'x', lat: 200, lng: 0, wiki: '' },
  ],
  stays: [{ name: 'Big4 Park', where: 'Byron Bay', type: '度假村', price: '约 $250/晚', cost: 250, note: '有泳池' }],
  dining: [
    { name: 'Fish Shack', where: 'Byron Bay', meal: '晚餐', type: '海鲜', price: '$$', note: '' },
    { name: '', where: 'x', meal: '午餐', type: 'x', price: '$', note: '' },
  ],
};

describe('ai results', () => {
  it('validate drops malformed entries', () => {
    const r = validateResult(sample);
    expect(r.sights).toHaveLength(1);
    expect(r.stays).toHaveLength(1);
    expect(r.dining).toHaveLength(1);
    expect(() => validateResult({ sights: [] })).toThrow();
  });

  it('apply merges into the day without duplicates', () => {
    const t = createBlankTrip({
      name: '', origin: 'Sydney NSW', destination: 'Byron Bay NSW', startDate: '2027-01-01',
      days: 3, adults: 2, children: 2, budget: 3000,
    });
    const id = t.days[0].id;
    const r = validateResult(sample);
    expect(applyResult(t, id, r)).toEqual({ sights: 1, stays: 1, dining: 1 });
    expect(t.days[0].stops).toEqual(['Bondi Beach NSW']);
    expect(findPlace(t, 'bondi beach nsw')?.wiki).toBe('Bondi Beach');
    expect(t.days[0].stayOptions[0].cost).toBe(250);
    expect(t.days[0].dining[0].type).toBe('海鲜 · 晚餐');
    // 再次应用不重复
    expect(applyResult(t, id, r)).toEqual({ sights: 0, stays: 0, dining: 0 });
    // 最后一天不住宿，不加住宿推荐
    expect(applyResult(t, t.days[2].id, r).stays).toBe(0);
  });
});
