import { describe, expect, it } from 'vitest';
import { menuKeys, questBadges, questMenuLabel } from './menuEntries';

describe('메뉴 줄 항목 순서', () => {
  it('의뢰, 길드, 소셜, 우편함 순서이고 의뢰는 늘 있다', () => {
    expect(menuKeys({ guild: true, friends: true, mailbox: true })).toEqual(['quests', 'guild', 'friends', 'mailbox']);
    expect(menuKeys({ guild: false, friends: false, mailbox: false })).toEqual(['quests']);
  });

  it('열 수 없는 입구는 빠지고 나머지 순서는 그대로다', () => {
    expect(menuKeys({ guild: false, friends: true, mailbox: true })).toEqual(['quests', 'friends', 'mailbox']);
    expect(menuKeys({ guild: true, friends: false, mailbox: true })).toEqual(['quests', 'guild', 'mailbox']);
  });
});

describe('의뢰 줄 배지', () => {
  it('일반은 노랑(gold), 네임드는 보라(epic)이고 오늘 남은 횟수를 그대로 쓴다', () => {
    expect(questBadges({ general: 3, named: 1 })).toEqual([
      { tone: 'gold', count: 3 }, { tone: 'epic', count: 1 },
    ]);
  });

  it('남은 횟수가 0인 종류의 배지는 그리지 않는다', () => {
    expect(questBadges({ general: 0, named: 1 })).toEqual([{ tone: 'epic', count: 1 }]);
    expect(questBadges({ general: 2, named: 0 })).toEqual([{ tone: 'gold', count: 2 }]);
    expect(questBadges({ general: 0, named: 0 })).toEqual([]);
  });

  it('남은 횟수를 모르면(불러오는 중, 오프라인) 배지가 없다', () => {
    expect(questBadges(null)).toEqual([]);
  });

  it('접근성 이름은 배지가 있을 때만 남은 클리어를 싣는다', () => {
    expect(questMenuLabel({ general: 3, named: 0 })).toBe('의뢰, 오늘 남은 클리어 일반 3');
    expect(questMenuLabel({ general: 3, named: 1 })).toBe('의뢰, 오늘 남은 클리어 일반 3 네임드 1');
    expect(questMenuLabel({ general: 0, named: 0 })).toBe('의뢰');
    expect(questMenuLabel(null)).toBe('의뢰');
  });
});
