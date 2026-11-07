import { describe, expect, it } from 'vitest';
import { BASE_PACKS } from './index';
import { facilityLabelText } from './facilityLabel';

describe('거점 시설 라벨', () => {
  it('제목과 설명을 구조로 나누어 가지며 구분 문자를 포함하지 않는다', () => {
    for (const pack of Object.values(BASE_PACKS)) {
      for (const f of pack.furniture) {
        const label = f.label({ rod: 3, boatName: '통통배' });
        expect(label.title.length).toBeGreaterThan(0);
        expect(label.title).not.toContain('·');
        expect(label.sub ?? '').not.toContain('·');
      }
    }
  });

  it('동적 값은 설명 쪽에 들어간다', () => {
    const rod = BASE_PACKS.harbor.furniture.find(f => f.id === 'rod')!;
    expect(rod.label({ rod: 7, boatName: '' })).toEqual({ title: '공방', sub: '낚싯대 Lv.7' });
  });

  it('설명이 없는 라벨은 제목만 가진다', () => {
    const wardrobe = BASE_PACKS.home.furniture.find(f => f.id === 'wardrobe')!;
    expect(wardrobe.label({ rod: 1, boatName: '' })).toEqual({ title: '옷장' });
  });

  it('한 줄 문자열은 제목과 설명을 공백으로 잇고 구분 문자를 쓰지 않는다', () => {
    expect(facilityLabelText({ title: '공방', sub: '낚싯대 Lv.1' })).toBe('공방 낚싯대 Lv.1');
    expect(facilityLabelText({ title: '옷장' })).toBe('옷장');
  });
});
