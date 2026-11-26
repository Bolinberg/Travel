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
  it('普通地名不乱改', () => {
    expect(geocodeCandidates('Vivonne Bay')).toEqual(['Vivonne Bay']);
    expect(geocodeCandidates('Robe SA')).toEqual(['Robe SA', 'Robe South Australia, Australia']);
  });
});
