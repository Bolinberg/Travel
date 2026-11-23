import { describe, expect, it } from 'vitest';
import { applyParsedTicket, classifyPaste } from './PasteBooking';
import { parseTicketText } from './ticketParse';
import { createRouteComparisonTrip } from './templateKI';

const SEALINK = `SeaLink Kangaroo Island – Booking Confirmation
Booking Reference: KIF8823411
Departing Cape Jervis Tue 15 Dec 2026 10:00am
Return
Departing Penneshaw Thu 17 Dec 2026 4:30pm
Passengers: 2 Adults, 2 Children
Total Paid: $612.00`;

describe('粘贴门票 / 渡轮确认，写进「要订的」', () => {
  it('对上已有的「SeaLink 渡轮往返」：填实付、标记已付、写确认号，不新建', () => {
    const t = createRouteComparisonTrip();
    const before = t.expenses.length;
    const res = applyParsedTicket(t, parseTicketText(SEALINK, 2026));
    expect(res.created).toBe(false);
    expect(t.expenses).toHaveLength(before);
    const e = t.expenses.find((x) => /SeaLink/.test(x.title))!;
    expect(e.amount).toBe(612);
    expect(e.booked).toBe(true);
    expect(e.paid).toBe(true);
    expect(e.note).toContain('KIF8823411');
    expect(e.note).toContain('回程 16:30');
  });
  it('行程里没有的项目就新建一项，并按日期放到那一天', () => {
    const t = createRouteComparisonTrip();
    const p = parseTicketText('Sovereign Hill – Your tickets\nOrder #SH-7781\nSun 20 Dec 2026\nFamily ticket\nTotal paid $199.00', 2026);
    const res = applyParsedTicket(t, p);
    expect(res.created).toBe(true);
    const e = t.expenses.find((x) => x.title.includes('Sovereign'))!;
    expect(e.amount).toBe(199);
    expect(e.dayId).toBe(t.days[8].id);
  });
  it('自动分辨住宿 / 门票渡轮 / 餐厅', () => {
    expect(classifyPaste(SEALINK)).toBe('ticket');
    expect(classifyPaste('Harbour View Motel\nCheck-in 12 Dec 2026\nCheck-out 13 Dec 2026')).toBe('stay');
    expect(classifyPaste('Your table at Bottle of Milk is booked\nParty of 4')).toBe('meal');
  });
});
