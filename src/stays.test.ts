import { describe, expect, it } from 'vitest';
import { applyVerifiedStays } from './stays';
import { VERIFIED_STAYS } from './staysData';
import { createRouteComparisonTrip } from './templateKI';

describe('核实住宿', () => {
  it('A/B 两个方案的每个过夜地都有核实过的住宿和链接', () => {
    const t = createRouteComparisonTrip();
    for (const v of t.versions!) {
      for (const d of v.snapshot.days.filter((x) => x.accommodation)) {
        expect(VERIFIED_STAYS[d.to], d.to).toBeTruthy();
        expect(d.stayOptions.some((r) => r.url || r.bookingUrl), d.to).toBe(true);
      }
    }
  });
  it('重复应用不变，已选的保留', () => {
    const t = createRouteComparisonTrip();
    expect(applyVerifiedStays(t)).toBe(t);
    const old = structuredClone(t);
    const d = old.days.find((x) => x.accommodation)!;
    d.stayOptions = [{ id: 'x', name: '我自己订的', where: '', type: '', price: '', note: '', picked: true }];
    const next = applyVerifiedStays(old);
    const nd = next.days.find((x) => x.id === d.id)!;
    expect(nd.stayOptions[0].name).toBe('我自己订的');
    expect(nd.stayOptions.length).toBe(1 + VERIFIED_STAYS[d.to].length);
  });
});
