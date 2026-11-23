import { describe, expect, it } from 'vitest';
import { looksLikeDining, parseDiningText } from './diningParse';

const GOOGLE = `Apollo Bay Fishermen's Co-op
4.5
(1,284)
$20–40 · Seafood restaurant
Breakwater Rd, Apollo Bay VIC 3233
Open · Closes 8 pm`;

const OPENTABLE = `Your reservation is confirmed
Thanks, Lin! Your table at Bottle of Milk is booked.
Sat, 12 Dec 2026 at 12:30 pm
Party of 4
Confirmation #11223344
52 Mountjoy Parade, Lorne VIC 3232`;

const TA = `Fire and Smoke KI
4.5 of 5 bubbles 312 reviews
#1 of 6 Restaurants in Penneshaw
$$ - $$$, Pizza, Australian
https://www.tripadvisor.com.au/Restaurant_Review-g1-d2-Reviews-Fire_and_Smoke-Penneshaw.html`;

describe('识别粘贴的餐厅信息', () => {
  it('Google 地图餐厅页', () => {
    const p = parseDiningText(GOOGLE, 2026);
    expect(p.name).toBe("Apollo Bay Fishermen's Co-op");
    expect(p.rating).toBe('Google 4.5（1,284 条）');
    expect(p.perPerson).toBe(30);
    expect(p.priceLevel).toBe('$20–40/人');
    expect(p.cuisine).toMatch(/Seafood/);
    expect(p.confirmed).toBe(false);
    expect(p.date).toBe('');
    expect(p.address).toContain('Apollo Bay VIC');
  });
  it('OpenTable 订位确认', () => {
    const p = parseDiningText(OPENTABLE, 2026);
    expect(p.name).toBe('Bottle of Milk');
    expect(p.date).toBe('2026-12-12');
    expect(p.time).toBe('12:30');
    expect(p.party).toBe(4);
    expect(p.confirmation).toBe('11223344');
    expect(p.confirmed).toBe(true);
    expect(p.address).toContain('Mountjoy Parade');
  });
  it('Tripadvisor 餐厅页', () => {
    const p = parseDiningText(TA, 2026);
    expect(p.name).toBe('Fire and Smoke KI');
    expect(p.rating).toBe('Tripadvisor 4.5/5（312 条）');
    expect(p.priceLevel).toBe('$$');
    expect(p.perPerson).toBe(35);
    expect(p.url).toContain('tripadvisor');
  });
  it('分得清餐厅和住宿', () => {
    expect(looksLikeDining(OPENTABLE)).toBe(true);
    expect(looksLikeDining(GOOGLE)).toBe(true);
    expect(looksLikeDining('Harbour View Motel\nCheck-in 12 Dec\nCheck-out 13 Dec\n1 night')).toBe(false);
  });
});
