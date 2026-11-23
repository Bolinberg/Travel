import { describe, expect, it } from 'vitest';
import { diningSearchLinks, ticketSearchLinks, extractUrl, isBookingPlatform, nameFromUrl, placeQuery, platformOf, staySearchLinks } from './search';

describe('平台搜索链接', () => {
  it('Booking.com 带日期、人数、小孩年龄，按好评排序并筛 8 分以上', () => {
    const [b] = staySearchLinks({ place: 'Robe SA', checkin: '2026-12-12', checkout: '2026-12-13', adults: 2, childAges: [8, 6] });
    const u = new URL(b.href);
    expect(u.hostname).toBe('www.booking.com');
    expect(u.searchParams.get('ss')).toBe('Robe, South Australia, Australia');
    expect(u.searchParams.get('checkin')).toBe('2026-12-12');
    expect(u.searchParams.get('group_children')).toBe('2');
    expect(u.searchParams.getAll('age')).toEqual(['8', '6']);
    expect(u.searchParams.get('order')).toBe('bayesian_review_score');
    expect(u.searchParams.get('nflt')).toBe('review_score=80');
  });
  it('Airbnb 和 Wotif 带入住退房和人数', () => {
    const links = staySearchLinks({ place: 'Halls Gap VIC', checkin: '2026-12-18', checkout: '2026-12-19', adults: 2, childAges: [8] });
    const air = new URL(links.find((l) => l.key === 'airbnb')!.href);
    expect(air.pathname).toContain('Halls%20Gap');
    expect(air.searchParams.get('children')).toBe('1');
    const wotif = new URL(links.find((l) => l.key === 'wotif')!.href);
    expect(wotif.searchParams.get('children')).toBe('1_8');
    expect(wotif.searchParams.get('sort')).toBe('REVIEW');
  });
  it('更多平台：Expedia 系、Agoda、Trip.com、Kayak 都带上日期和人数', () => {
    const links = staySearchLinks({ place: 'Robe SA', checkin: '2026-12-12', checkout: '2026-12-14', adults: 2, childAges: [10, 8] });
    const get = (k: string) => new URL(links.find((l) => l.key === k)!.href);
    expect(get('expedia').hostname).toBe('www.expedia.com.au');
    expect(get('expedia').searchParams.get('children')).toBe('1_10,1_8');
    expect(get('hotelscom').searchParams.get('startDate')).toBe('2026-12-12');
    expect(get('stayz').searchParams.get('endDate')).toBe('2026-12-14');
    expect(get('agoda').searchParams.get('los')).toBe('2');
    expect(get('agoda').searchParams.get('childages')).toBe('10,8');
    expect(get('tripcom').searchParams.get('checkin')).toBe('2026/12/12');
    expect(get('kayak').pathname).toBe('/hotels/Robe,South-Australia,Australia/2026-12-12/2026-12-14/2adults/2children-10-8');
    expect(links.map((l) => l.key)).toEqual(expect.arrayContaining(['booking', 'airbnb', 'wotif', 'expedia', 'hotelscom', 'stayz', 'agoda', 'tripcom', 'kayak', 'parks']));
  });
  it('餐厅更多平台：美食指南、订位、旅游局、小红书', () => {
    const sa = diningSearchLinks('Adelaide SA', '2026-12-14', 4);
    const get = (k: string) => new URL(sa.find((l) => l.key === k)!.href);
    expect(get('goodfood').searchParams.get('q')).toBe('site:goodfood.com.au Adelaide');
    expect(get('tourism').searchParams.get('q')).toContain('southaustralia.com');
    expect(get('xhs').searchParams.get('keyword')).toBe('Adelaide 美食 亲子');
    const vic = diningSearchLinks('Lorne VIC', '2026-12-12', 4);
    expect(new URL(vic.find((l) => l.key === 'tourism')!.href).searchParams.get('q')).toContain('visitvictoria.com');
    expect(platformOf('https://www.xiaohongshu.com/explore/123')).toBe('小红书');
    expect(platformOf('https://www.goodfood.com.au/x')).toBe('Good Food Guide');
  });
  it('门票 / 活动平台', () => {
    const links = ticketSearchLinks('Kangaroo Island', 'Vivonne Bay SA');
    const get = (k: string) => new URL(links.find((l) => l.key === k)!.href);
    expect(get('gyg').searchParams.get('q')).toBe('Kangaroo Island');
    expect(get('viator').searchParams.get('text')).toBe('Kangaroo Island');
    expect(get('klook').searchParams.get('q')).toBe('site:klook.com Kangaroo Island');
    expect(get('parks').hostname).toBe('www.parks.sa.gov.au'); // 南澳的国家公园通票
    expect(get('club').searchParams.get('q')).toContain('raa.com.au');
    const vic = ticketSearchLinks('Grampians', 'Halls Gap VIC');
    expect(new URL(vic.find((l) => l.key === 'club')!.href).searchParams.get('q')).toContain('racv.com.au');
    expect(platformOf('https://www.getyourguide.com/x')).toBe('GetYourGuide');
  });
  it('餐厅搜索和订位人数', () => {
    const links = diningSearchLinks('Adelaide SA', '2026-12-14', 4);
    expect(links.map((l) => l.label)).toContain('Tripadvisor');
    expect(new URL(links.find((l) => l.key === 'opentable')!.href).searchParams.get('covers')).toBe('4');
  });
  it('地名转换', () => {
    expect(placeQuery('Mount Gambier SA')).toBe('Mount Gambier, South Australia, Australia');
    expect(placeQuery('Queenstown, New Zealand')).toBe('Queenstown, New Zealand');
  });
});

describe('认出平台和名字', () => {
  it('平台', () => {
    expect(platformOf('https://www.booking.com/hotel/au/barn-accommodation.html?aid=1')).toBe('Booking.com');
    expect(platformOf('https://www.airbnb.com.au/rooms/123')).toBe('Airbnb');
    expect(platformOf('https://www.barn.com.au/')).toBe('官网');
    expect(isBookingPlatform('https://www.wotif.com/x')).toBe(true);
    expect(isBookingPlatform('https://www.tripadvisor.com.au/x')).toBe(false);
  });
  it('名字', () => {
    expect(nameFromUrl('https://www.booking.com/hotel/au/barn-accommodation.html?aid=1')).toBe('Barn Accommodation');
    expect(nameFromUrl('https://www.booking.com/hotel/au/port-campbell-parkview-motel-amp-apartments.html')).toBe('Port Campbell Parkview Motel & Apartments');
    expect(nameFromUrl('https://www.tripadvisor.com.au/Restaurant_Review-g255096-d123-Reviews-The_Barn_Steakhouse-Mount_Gambier.html')).toBe('The Barn Steakhouse');
    expect(nameFromUrl('https://www.expedia.com.au/Ob-Flat-Hotels-The-Barn.h5947839.Hotel-Information')).toBe('The Barn');
    expect(nameFromUrl('https://www.google.com/maps/place/Robe+Hotel/@-37.1,139.7')).toBe('Robe Hotel');
    expect(nameFromUrl('https://www.airbnb.com.au/rooms/123')).toBe('');
  });
  it('从分享的文字里取链接', () => {
    expect(extractUrl('看看这家 Robe Marina https://www.booking.com/hotel/au/robe.html 不错')).toEqual({
      url: 'https://www.booking.com/hotel/au/robe.html',
      title: '看看这家 Robe Marina 不错',
    });
  });
});

import { guessCategory, parseQuick } from './Bookings';
describe('记一笔', () => {
  it('一句话拆出名称和金额', () => {
    expect(parseQuick('停车 25')).toEqual({ title: '停车', amount: 25 });
    expect(parseQuick('Glenelg 冰淇淋 $18.5')).toEqual({ title: 'Glenelg 冰淇淋', amount: 18.5 });
    expect(parseQuick('纪念品')).toEqual({ title: '纪念品', amount: 0 });
  });
  it('按名称猜类别', () => {
    expect(guessCategory('停车')).toBe('transport');
    expect(guessCategory('海豚船票')).toBe('activity');
    expect(guessCategory('冰淇淋')).toBe('food');
    expect(guessCategory('纪念品')).toBe('shopping');
  });
});
