// 업데이트 소식 기록 — 기기별(localStorage). 본 소식 버전·답한 설정 질문·자동 열기 여부.
import { describe, it, expect, beforeEach } from 'vitest';
import {
  getAnnouncements, loadAnnouncements, markNewsSeen, markPromptsAnswered, resetAnnouncements,
  setNewsAutoOpen, subscribeAnnouncements,
} from './announcements';

describe('업데이트 소식 기록', () => {
  beforeEach(() => {
    localStorage.clear();
    resetAnnouncements();
  });

  it('처음에는 본 소식이 없고, 답한 질문이 없고, 자동 열기가 켜져 있다', () => {
    expect(loadAnnouncements()).toEqual({ seenVersion: null, answered: [], autoOpen: true });
  });

  it('본 버전·답한 질문·자동 열기를 기기에 남기고 구독자에게 알린다', () => {
    let calls = 0;
    const off = subscribeAnnouncements(() => { calls++; });
    markNewsSeen('0.10.0');
    markPromptsAnswered(['fish-art']);
    markPromptsAnswered(['fish-art']); // 중복은 한 번만
    setNewsAutoOpen(false);
    expect(getAnnouncements()).toEqual({ seenVersion: '0.10.0', answered: ['fish-art'], autoOpen: false });
    expect(loadAnnouncements()).toEqual({ seenVersion: '0.10.0', answered: ['fish-art'], autoOpen: false });
    expect(calls).toBe(3);
    off();
  });

  it('스냅샷은 바뀔 때만 새 객체다 — 구독 훅이 같은 값으로 다시 그리지 않는다', () => {
    const a = getAnnouncements();
    markNewsSeen(null as unknown as string); // 형식이 틀린 값은 무시
    expect(getAnnouncements()).toBe(a);
  });

  it('깨진 저장값은 기본으로 읽는다', () => {
    localStorage.setItem('pf-announcements', '{not json');
    expect(loadAnnouncements()).toEqual({ seenVersion: null, answered: [], autoOpen: true });
  });
});
