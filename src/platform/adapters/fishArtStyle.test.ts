// 물고기 그래픽 선택 저장소 — 기기별 표시 설정(localStorage). 세이브·서버와 무관하다.
import { describe, it, expect, beforeEach } from 'vitest';
import {
  FISH_ART_STYLE_KEY, getFishArtStyle, loadFishArtStyle, resetFishArtStyle, setFishArtStyle,
  subscribeFishArtStyle,
} from './fishArtStyle';

describe('물고기 그래픽 선택 저장소', () => {
  beforeEach(() => {
    localStorage.clear();
    resetFishArtStyle();
  });

  it('저장값이 없으면 v1이다', () => {
    expect(loadFishArtStyle()).toBe('v1');
    expect(getFishArtStyle()).toBe('v1');
  });

  it('선택은 기기에 남고 구독자에게 알린다', () => {
    let calls = 0;
    const off = subscribeFishArtStyle(() => { calls++; });
    setFishArtStyle('v2');
    expect(getFishArtStyle()).toBe('v2');
    expect(localStorage.getItem(FISH_ART_STYLE_KEY)).toBe('v2');
    expect(loadFishArtStyle()).toBe('v2');
    setFishArtStyle('v2'); // 같은 값은 알리지 않는다
    expect(calls).toBe(1);
    off();
  });

  it('알 수 없는 저장값은 v1로 읽는다', () => {
    localStorage.setItem(FISH_ART_STYLE_KEY, 'v9');
    expect(loadFishArtStyle()).toBe('v1');
  });
});
