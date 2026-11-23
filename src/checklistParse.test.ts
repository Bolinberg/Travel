import { describe, expect, it } from 'vitest';
import { isDuplicate, parseChecklistText, pickGroup } from './checklistParse';

const GROUPS = ['出发前', '行李', '路上注意', '阿德莱德', '袋鼠岛'];

describe('清单：粘贴识别', () => {
  it('带标题的行李清单，去掉符号、认出已完成', () => {
    const items = parseChecklistText(
      `## 行李
- 防晒霜
- [x] 泳衣
• 充电宝
袋鼠岛：
1. 订 SeaLink 渡轮
2. 带望远镜看海豹`,
      GROUPS,
    );
    expect(items.map((i) => i.text)).toEqual(['防晒霜', '泳衣', '充电宝', '订 SeaLink 渡轮', '带望远镜看海豹']);
    expect(items[1].done).toBe(true);
    expect(items.slice(0, 3).every((i) => i.group === '行李')).toBe(true);
    expect(items[3].group).toBe('袋鼠岛');
  });
  it('没有标题时按内容分组', () => {
    expect(pickGroup('买阿德莱德动物园门票', GROUPS)).toBe('阿德莱德');
    expect(pickGroup('Pack sunscreen and hats', GROUPS)).toBe('行李');
    expect(pickGroup('检查轮胎和机油', GROUPS)).toBe('出发前');
    expect(pickGroup('黄昏后别开车', GROUPS)).toBe('路上注意');
  });
  it('一行里用顿号分开的短条目也拆开', () => {
    const items = parseChecklistText('帽子、太阳镜、雨伞', GROUPS);
    expect(items.map((i) => i.text)).toEqual(['帽子', '太阳镜', '雨伞']);
  });
  it('带序号的打勾项也算已完成', () => {
    const [it1] = parseChecklistText('4. ✅ 订 SeaLink 渡轮', GROUPS);
    expect(it1.text).toBe('订 SeaLink 渡轮');
    expect(it1.done).toBe(true);
  });
  it('认出已有的条目', () => {
    expect(isDuplicate('防晒霜', ['防晒霜、帽子、太阳镜'])).toBe(true);
    expect(isDuplicate('儿童安全座椅', ['儿童安全座椅'])).toBe(true);
    expect(isDuplicate('望远镜', ['防晒霜'])).toBe(false);
  });
});
