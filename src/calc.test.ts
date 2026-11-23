import { describe, expect, it } from 'vitest';
import { addDays, dayFood, foodStandard, fuelCost, summarize } from './calc';
import { createDefaultTrip } from './defaultTrip';

describe('calc', () => {
  it('addDays crosses month/year boundaries', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
  });

  it('fuelCost', () => {
    expect(fuelCost(1000, 9, 2)).toBeCloseTo(180);
  });

  it('summarize default trip', () => {
    const trip = createDefaultTrip();
    const s = summarize(trip);
    expect(s.days).toBe(9);
    expect(s.nights).toBe(8);
    expect(s.totalKm).toBe(1975);
    expect(s.byCategory.accommodation).toBe(290 + 220 + 180 + 260 + 380 * 3 + 250);
    // 餐饮 = (60*2 + 35*2) * 9 + 零食 120
    expect(s.byCategory.food).toBe(190 * 9 + 120);
    expect(s.total).toBeCloseTo(Object.values(s.byCategory).reduce((a, b) => a + b, 0));
    expect(s.paid).toBe(0);
    expect(s.unbooked).toBe(8);
  });

  it('paid totals include paid stays and expenses', () => {
    const trip = createDefaultTrip();
    trip.days[0].accommodation!.paid = true;
    trip.expenses[0].paid = true;
    const s = summarize(trip);
    expect(s.paid).toBe(290 + trip.expenses[0].amount);
    expect(s.unpaid).toBeCloseTo(s.total - s.paid);
  });


});

import { migrateTrip } from './defaultTrip';
import { findPlace } from './geo';

describe('places & migration', () => {
  it('every default itinerary place has coordinates', () => {
    const trip = createDefaultTrip();
    for (const d of trip.days) {
      for (const n of [d.from, d.to, ...d.stops]) {
        expect(findPlace(trip, n), n).toBeDefined();
      }
    }
  });

  it('migrates v1 data, keeping user edits', () => {
    const v2 = createDefaultTrip();
    const v1: any = structuredClone(v2);
    v1.version = 1;
    delete v1.places;
    v1.days.forEach((d: any) => {
      delete d.stayOptions;
      delete d.dining;
    });
    v1.budget = 6000;
    const t = migrateTrip(v1)!;
    expect(t.version).toBe(2);
    expect(t.budget).toBe(6000);
    expect(t.places.length).toBeGreaterThan(10);
    expect(Array.isArray(t.days[0].dining)).toBe(true);
  });

  it('rejects garbage', () => {
    expect(migrateTrip({ foo: 1 })).toBeNull();
  });
});

import { createBlankTrip, duplicateTrip } from './defaultTrip';

describe('generic trips', () => {
  const opts = {
    name: '',
    origin: 'Sydney NSW',
    destination: 'Byron Bay NSW',
    startDate: '2027-01-10',
    days: 4,
    adults: 2,
    children: 1,
    budget: 2000,
  };

  it('blank trip goes out and back', () => {
    const t = createBlankTrip(opts);
    expect(t.name).toBe('Sydney NSW → Byron Bay NSW');
    expect(t.days).toHaveLength(4);
    expect(t.days[0].from).toBe('Sydney NSW');
    expect(t.days[0].to).toBe('Byron Bay NSW');
    expect(t.days[3].to).toBe('Sydney NSW');
    expect(t.days[3].accommodation).toBeNull();
    expect(summarize(t).nights).toBe(3);
    expect(t.checklist.some((c) => c.text.includes('南澳'))).toBe(false);
  });

  it('duplicate gets fresh ids and cleared status', () => {
    const src = createDefaultTrip();
    src.days[0].accommodation!.booked = true;
    src.expenses[0].paid = true;
    src.checklist[0].done = true;
    const t = duplicateTrip(src, 'copy', '2027-03-01');
    expect(t.id).not.toBe(src.id);
    expect(t.days[0].id).not.toBe(src.days[0].id);
    expect(t.days[0].accommodation!.booked).toBe(false);
    expect(t.expenses[0].paid).toBe(false);
    expect(t.checklist[0].done).toBe(false);
    // 关联到某天的开销指向新的 day id
    const linked = t.expenses.find((e) => e.dayId);
    expect(t.days.some((d) => d.id === linked!.dayId)).toBe(true);
    expect(src.days[0].accommodation!.booked).toBe(true);
  });
});

describe('餐饮不重复算', () => {
  it('当天取每日标准和已选餐厅合计中较大的', () => {
    const t = createDefaultTrip();
    const d = t.days[0];
    d.dining = [{ id: 'a', name: 'X', where: '', type: '', price: '', note: '', picked: true, cost: 50 }];
    expect(dayFood(t, d)).toBe(foodStandard(t));
    d.dining[0].cost = 500;
    expect(dayFood(t, d)).toBe(500);
    d.dining[0].picked = false;
    expect(dayFood(t, d)).toBe(foodStandard(t));
  });
});

describe('记下的实际开销不和估算重复算', () => {
  it('加油收据：油费取估算和实际中较大的', () => {
    const t = createDefaultTrip();
    const est = summarize(t).byCategory.fuel;
    t.expenses.push({ id: 'f1', title: 'BP', category: 'fuel', amount: 50, dayId: t.days[0].id, paid: true });
    expect(summarize(t).byCategory.fuel).toBe(est); // 实际还没超过估算
    t.expenses.push({ id: 'f2', title: 'Shell', category: 'fuel', amount: est + 100, dayId: t.days[1].id, paid: true });
    expect(summarize(t).byCategory.fuel).toBe(est + 150);
  });
  it('某天的餐饮收据算进当天餐饮，不另外加', () => {
    const t = createDefaultTrip();
    const before = summarize(t).byCategory.food;
    t.expenses = t.expenses.filter((e) => e.category !== 'food');
    const base = summarize(t).byCategory.food;
    t.expenses.push({ id: 'c1', title: 'Coles', category: 'food', amount: 60, dayId: t.days[0].id, paid: true });
    expect(summarize(t).byCategory.food).toBe(base); // 还在每日标准内
    t.expenses.push({ id: 'c2', title: 'Restaurant', category: 'food', amount: 300, dayId: t.days[0].id, paid: true });
    expect(summarize(t).byCategory.food).toBe(base - foodStandard(t) + 360);
    expect(before).toBeGreaterThanOrEqual(base);
  });
});
