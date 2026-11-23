import { describe, expect, it } from 'vitest';
import { categorize, parseExpenseText } from './expenseParse';

describe('记一笔：粘贴识别', () => {
  it('信用卡消费通知', () => {
    const [e] = parseExpenseText("You've spent $25.00 at Wilson Parking Adelaide on 14/12/2026 using card ending 1234.", 2026);
    expect(e.title).toBe('Wilson Parking Adelaide');
    expect(e.amount).toBe(25);
    expect(e.date).toBe('2026-12-14');
    expect(e.category).toBe('transport');
  });
  it('加油收据（取 TOTAL，算油费）', () => {
    const [e] = parseExpenseText(`BP Mount Gambier
12/12/2026 17:42
Unleaded 91  48.20L @ $2.15
Car wash  $8.00
TOTAL  $111.63
EFTPOS APPROVED`, 2026);
    expect(e.amount).toBe(111.63);
    expect(e.category).toBe('fuel');
    expect(e.date).toBe('2026-12-12');
    expect(e.title).toMatch(/BP Mount Gambier/);
  });
  it('对账单几行 → 几笔', () => {
    const list = parseExpenseText(`13 Dec 2026  COLES ADELAIDE  -$86.40
14 Dec 2026  ADELAIDE ZOO GIFT SHOP  -$32.00
15 Dec 2026  SHELL CAPE JERVIS  -$95.10`, 2026);
    expect(list).toHaveLength(3);
    expect(list.map((e) => e.amount)).toEqual([86.4, 32, 95.1]);
    expect(list.map((e) => e.category)).toEqual(['food', 'shopping', 'fuel']);
    expect(list[0].date).toBe('2026-12-13');
    expect(list[0].title).toMatch(/COLES ADELAIDE/);
  });
  it('类别', () => {
    expect(categorize('Gelato Messina')).toBe('food');
    expect(categorize('Linkt toll')).toBe('transport');
    expect(categorize('纪念品')).toBe('shopping');
  });
});
