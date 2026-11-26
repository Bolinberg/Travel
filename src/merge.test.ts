import { describe, expect, it } from 'vitest';
import { changesSince, mergeTrip, sameTrip } from './merge';
import { createRouteComparisonTrip } from './templateKI';
import type { Trip } from './types';

const clone = (t: Trip) => JSON.parse(JSON.stringify(t)) as Trip;

describe('家人共享：合并只加不删', () => {
  const a = createRouteComparisonTrip();
  it('两台设备各自生成的行程（id 都不同）按名字认成同一个，把对方加的东西补进来', () => {
    const b = createRouteComparisonTrip(); // 老婆手机上的那份，所有 id 都不一样
    expect(b.id).not.toBe(a.id);
    expect(sameTrip(a, b)).toBe(true);
    b.checklist.push({ id: 'w1', text: '老婆加的：给孩子带帽子', group: '其他', done: false });
    b.expenses.push({ id: 'w2', title: '袋鼠岛蜂蜜', category: 'shopping', amount: 25, dayId: b.days[5].id, paid: true });
    b.days[0].accommodation = { name: 'The Barn Accommodation', cost: 289, booked: true, paid: false, notes: '确认号 4821937765' };
    b.days[2].dining.push({ id: 'w3', name: 'Pizzateca', where: 'Adelaide', type: '餐厅', price: '$$', note: '', picked: true, booked: true });
    b.checklist[0].done = true;
    const m = mergeTrip(a, b);
    expect(m.id).toBe(a.id);
    expect(m.checklist.some((c) => c.text.includes('给孩子带帽子'))).toBe(true);
    expect(m.checklist.find((c) => c.text === a.checklist[0].text)!.done).toBe(true);
    expect(m.checklist.length).toBe(a.checklist.length + 1); // 同样的条目不会重复
    expect(m.expenses.length).toBe(a.expenses.length + 1);
    expect(m.expenses.find((e) => e.id === 'w2')!.dayId).toBe(a.days[5].id); // 挂到对应的那一天
    expect(m.days[0].accommodation!.name).toBe('The Barn Accommodation');
    expect(m.days[0].accommodation!.booked).toBe(true);
    expect(m.days[2].dining.find((r) => r.name === 'Pizzateca')!.booked).toBe(true);
    expect(m.days.length).toBe(a.days.length);
  });
  it('另一台设备用的是别的路线：同目的地就合进去，否则写进同一天的备注，不丢', () => {
    const b = createRouteComparisonTrip();
    b.days[0] = { ...b.days[0], id: 'x0', from: 'Point Cook VIC', to: 'Nowhere Town VIC', accommodation: { name: 'Sunny Cabin', cost: 210, booked: true, paid: false, notes: '' } };
    b.days[1] = { ...b.days[1], id: 'x1', from: 'Elsewhere', to: a.days[3].to, dining: [{ id: 'd9', name: 'Fish Shack', where: '', type: '', price: '', note: '', picked: true, booked: true }] };
    const m = mergeTrip(a, b);
    expect(m.days[0].notes).toContain('Sunny Cabin');
    expect(m.days[0].notes).toContain('已订');
    expect(m.days[3].dining.some((r) => r.name === 'Fish Shack')).toBe(true);
  });
  it('什么都不删：base 里有的都还在', () => {
    const b = clone(a);
    b.checklist = [];
    b.expenses = [];
    const m = mergeTrip(a, b);
    expect(m.checklist.length).toBe(a.checklist.length);
    expect(m.expenses.length).toBe(a.expenses.length);
  });
  it('本机刚删的，不会被别人的旧数据加回来；别人新加的会进来', () => {
    const prev = clone(a);
    const local = clone(a);
    local.checklist = local.checklist.slice(1); // 我删了第一条
    const remote = clone(a);
    remote.checklist.push({ id: 'n1', text: '别人刚加的', group: '其他', done: false });
    const m = mergeTrip(local, changesSince(remote, prev));
    expect(m.checklist.some((c) => c.id === a.checklist[0].id)).toBe(false);
    expect(m.checklist.some((c) => c.id === 'n1')).toBe(true);
  });
});
