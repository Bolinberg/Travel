import { describe, expect, it } from 'vitest';
import { looksLikeTicket, parseTicketText } from './ticketParse';

const SEALINK = `SeaLink Kangaroo Island – Booking Confirmation
Booking Reference: KIF8823411
Outbound
Departing Cape Jervis Tue 15 Dec 2026 10:00am
Arriving Penneshaw 10:45am
Return
Departing Penneshaw Thu 17 Dec 2026 4:30pm
Passengers: 2 Adults, 2 Children
Vehicle: Car (under 5.5m)
Total Paid: $612.00
https://www.sealink.com.au/kangaroo-island/`;

const ZOO = `Adelaide Zoo – Your e-tickets
Order #AZ-55129
Visit date: Monday 14 December 2026
Family Pass (2 adults + 2 children) x 1
Order total AUD 124.00
Payment received. This is your tax invoice.`;

describe('识别粘贴的门票 / 渡轮确认', () => {
  it('SeaLink 渡轮往返', () => {
    const p = parseTicketText(SEALINK, 2026);
    expect(p.title).toBe('SeaLink 渡轮往返');
    expect(p.kind).toBe('ferry');
    expect(p.date).toBe('2026-12-15');
    expect(p.returnDate).toBe('2026-12-17');
    expect(p.times).toContain('去程 10:00');
    expect(p.times).toContain('Cape Jervis → Penneshaw');
    expect(p.times).toContain('回程 16:30');
    expect(p.people).toBe('2 大 2 小');
    expect(p.vehicle).toMatch(/Car/);
    expect(p.total).toBe(612);
    expect(p.confirmation).toBe('KIF8823411');
    expect(p.paid).toBe(true);
  });
  it('动物园电子票', () => {
    const p = parseTicketText(ZOO, 2026);
    expect(p.title).toBe('阿德莱德动物园家庭票');
    expect(p.date).toBe('2026-12-14');
    expect(p.total).toBe(124);
    expect(p.confirmation).toBe('AZ-55129');
    expect(p.paid).toBe(true);
    expect(p.confirmed).toBe(true);
  });
  it('分得出是门票 / 渡轮', () => {
    expect(looksLikeTicket(SEALINK)).toBe(true);
    expect(looksLikeTicket(ZOO)).toBe(true);
    expect(looksLikeTicket('Harbour View Motel\nCheck-in 12 Dec')).toBe(false);
  });
});
