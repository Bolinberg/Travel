import { describe, expect, it } from 'vitest';
import { geocodeCandidates } from './geo';

describe('地址查不到时换几种写法', () => {
  it('门牌号 + 州名缩写 + 邮编', () => {
    const c = geocodeCandidates('2 Bridge St, Murray Bridge SA 5253');
    expect(c[0]).toBe('2 Bridge St, Murray Bridge SA 5253');
    expect(c).toContain('2 Bridge St, Murray Bridge South Australia 5253, Australia');
    expect(c).toContain('2 Bridge St, Murray Bridge South Australia, Australia');
    expect(c).toContain('Bridge St, Murray Bridge South Australia, Australia');
    expect(c).toContain('Murray Bridge South Australia, Australia');
    expect(c[c.length - 1]).toBe('Murray Bridge SA');
  });
  it('从确认信息里取住宿 / 餐厅地址', async () => {
    const { addressFrom } = await import('./poi');
    expect(addressFrom('确认号：123\n地址：2 Bridge St, Murray Bridge SA 5253\n链接：x')).toBe('2 Bridge St, Murray Bridge SA 5253');
    expect(addressFrom('订位 18:30 · 4 人 · 确认号 AB12 · 15 Pier St, Port Lincoln SA')).toBe('15 Pier St, Port Lincoln SA');
    expect(addressFrom('温水泳池、儿童游乐场，离海滩约 100 米')).toBe('');
  });
  it('城镇里括号带的地址拆出来', async () => {
    const { splitWhere } = await import('./poi');
    expect(splitWhere('Mount Gambier（Ob Flat，747 Glenelg River Rd）')).toEqual({ town: 'Mount Gambier', address: '747 Glenelg River Rd, Ob Flat, Mount Gambier' });
    expect(splitWhere('North Adelaide')).toEqual({ town: 'North Adelaide', address: '' });
    expect(splitWhere('Kingscote（海边）')).toEqual({ town: 'Kingscote', address: '' });
  });
  it('普通地名不乱改', () => {
    expect(geocodeCandidates('Vivonne Bay')).toEqual(['Vivonne Bay']);
    expect(geocodeCandidates('Robe SA')).toEqual(['Robe SA', 'Robe South Australia, Australia']);
  });
});
