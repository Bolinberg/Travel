import { describe, expect, it } from 'vitest';
import { findDates, looksLikeBookingText, parseBookingText } from './bookingParse';

const BOOKING = `Thanks, Lin! Your booking in Robe is confirmed.
Harbour View Motel
Confirmation number: 4821937765
PIN code: 1234
Check-in
Saturday, 12 December 2026
from 14:00
Check-out
Sunday, 13 December 2026
until 10:00
1 night, 1 room
Total price
AUD 238.50
Address: 2 Sturt Street, Robe, SA 5276, Australia
https://www.booking.com/hotel/au/harbour-view-motel.html`;

const AIRBNB = `Reservation confirmed
Island Time at Vivonne Bay
Entire home hosted by Sue
Check-in Tue, Dec 15, 2026 3:00 PM
Checkout Thu, Dec 17, 2026 10:00 AM
Confirmation code HMABCD1234
$312.00 x 2 nights $624.00
Cleaning fee $80.00
Total (AUD) $741.20`;

const TRIP_CN = `预订成功
酒店名称：Majestic Old Lion Apartments
入住：2026年12月13日 退房：2026年12月15日 共2晚
订单号：1128834567
订单金额 AUD 612
已支付`;

describe('识别粘贴的预订确认', () => {
  it('Booking.com 确认邮件', () => {
    const p = parseBookingText(BOOKING, 2026);
    expect(p.name).toBe('Harbour View Motel');
    expect(p.checkin).toBe('2026-12-12');
    expect(p.checkout).toBe('2026-12-13');
    expect(p.nights).toBe(1);
    expect(p.total).toBe(238.5);
    expect(p.perNight).toBe(239);
    expect(p.confirmation).toBe('4821937765');
    expect(p.confirmed).toBe(true);
    expect(p.address).toContain('Sturt Street');
    expect(p.url).toContain('booking.com');
  });
  it('Airbnb 确认（有清洁费，取总价）', () => {
    const p = parseBookingText(AIRBNB, 2026);
    expect(p.name).toBe('Island Time at Vivonne Bay');
    expect(p.checkin).toBe('2026-12-15');
    expect(p.checkout).toBe('2026-12-17');
    expect(p.nights).toBe(2);
    expect(p.total).toBe(741.2);
    expect(p.confirmation).toBe('HMABCD1234');
  });
  it('中文订单（携程等）', () => {
    const p = parseBookingText(TRIP_CN, 2026);
    expect(p.name).toBe('Majestic Old Lion Apartments');
    expect(p.checkin).toBe('2026-12-13');
    expect(p.checkout).toBe('2026-12-15');
    expect(p.nights).toBe(2);
    expect(p.total).toBe(612);
    expect(p.perNight).toBe(306);
    expect(p.confirmation).toBe('1128834567');
    expect(p.paid).toBe(true);
  });
  it('房源页面（没有确认号）不算已订', () => {
    const p = parseBookingText('Discovery Parks - Robe\n2 Bedroom Cabin, sleeps 6\n$220 per night\n12 Dec – 13 Dec', 2026);
    expect(p.confirmed).toBe(false);
    expect(p.perNight).toBe(220);
    expect(p.checkin).toBe('2026-12-12');
  });
  it('只有链接不当作文字处理', () => {
    expect(looksLikeBookingText('https://www.booking.com/hotel/au/x.html')).toBe(false);
    expect(looksLikeBookingText(BOOKING)).toBe(true);
  });
  it('日期格式', () => {
    expect(findDates('12/12/2026 and Dec 13', 2026).map((d) => d.date)).toEqual(['2026-12-12', '2026-12-13']);
  });
});

describe('开头是“预订已确认”这类套话', () => {
  it('跳过套话行，取下面的住宿名', async () => {
    const { parseBookingText } = await import('./bookingParse');
    const r = parseBookingText('Your booking is confirmed\nThe Barn Accommodation\nConfirmation number: 4821937765\nCheck-in Saturday, 12 December 2026\nCheck-out Sunday, 13 December 2026\nTotal price AUD 289.00', 2026);
    expect(r.name).toBe('The Barn Accommodation');
    expect(r.total).toBe(289);
  });
});
