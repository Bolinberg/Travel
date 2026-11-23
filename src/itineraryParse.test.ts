import { describe, expect, it } from 'vitest';
import { looksLikeItinerary, parseItineraryText } from './itineraryParse';
import { createRouteComparisonTrip } from './templateKI';

const t = createRouteComparisonTrip();

const CN = `第一天：墨尔本 → 大洋路 → Apollo Bay，住 Apollo Bay
沿途 Torquay、Lorne 午餐
第二天：Apollo Bay → 十二门徒 → 蓝湖，住甘比尔山
第三天：甘比尔山 → 汉多夫 → 阿德莱德
住阿德莱德
第四天：阿德莱德动物园看熊猫，住阿德莱德
第五天：回家`;

const EN = `Day 1: Melbourne to Port Campbell via Torquay and Lorne. Overnight Port Campbell.
Day 2 - Port Campbell -> Robe (Warrnambool, Port Fairy). Stay in Robe
Day 3: Robe → Adelaide, via Coorong
Day 4: Adelaide → Melbourne`;

describe('行程：粘贴识别', () => {
  it('认得出是一份行程', () => {
    expect(looksLikeItinerary(CN)).toBe(true);
    expect(looksLikeItinerary('就一句话：第一天去海边')).toBe(false);
  });
  it('中文行程', () => {
    const p = parseItineraryText(CN, t);
    expect(p.days).toHaveLength(5);
    expect(p.days[0].from).toBe('Point Cook VIC'); // 墨尔本 = 家
    expect(p.days[0].to).toBe('Apollo Bay VIC');
    expect(p.days[0].stops).toEqual(expect.arrayContaining(['Torquay VIC', 'Lorne VIC']));
    expect(p.days[0].overnight).toBe(true);
    expect(p.days[1].to).toBe('Mount Gambier SA');
    expect(p.days[1].stops).toContain('Twelve Apostles VIC');
    expect(p.days[2].to).toBe('Adelaide SA');
    expect(p.days[2].stops).toContain('Hahndorf SA');
    expect(p.days[3].from).toBe('Adelaide SA');
    expect(p.days[3].to).toBe('Adelaide SA');
    expect(p.days[3].overnight).toBe(true);
    expect(p.days[4].to).toBe('Point Cook VIC');
    expect(p.days[4].overnight).toBe(false);
  });
  it('英文行程', () => {
    const p = parseItineraryText(EN, t);
    expect(p.days.map((d) => d.to)).toEqual(['Port Campbell VIC', 'Robe SA', 'Adelaide SA', 'Point Cook VIC']);
    expect(p.days[0].stops).toEqual(expect.arrayContaining(['Torquay VIC', 'Lorne VIC']));
    expect(p.days[1].stops).toEqual(expect.arrayContaining(['Warrnambool VIC', 'Port Fairy VIC']));
    expect(p.days[2].stops).toContain('Coorong National Park SA');
    expect(p.days[3].overnight).toBe(false);
  });
});
