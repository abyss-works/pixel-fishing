// 업데이트 소식 기록 — 기기별(localStorage). 다시 보지 않기로 한 소식 버전·답한 설정 질문.
import { describe, it, expect, beforeEach } from 'vitest';
import {
  getAnnouncements, loadAnnouncements, markPromptsAnswered, resetAnnouncements,
  setDismissedVersion, subscribeAnnouncements,
} from './announcements';

describe('업데이트 소식 기록', () => {
  beforeEach(() => {
    localStorage.clear();
    resetAnnouncements();
  });

  it('처음에는 다시 보지 않기로 한 소식도, 답한 질문도 없다', () => {
    expect(loadAnnouncements()).toEqual({ dismissedVersion: null, answered: [] });
  });

  it('다시 보지 않기 버전과 답한 질문을 기기에 남기고 구독자에게 알린다', () => {
    let calls = 0;
    const off = subscribeAnnouncements(() => { calls++; });
    setDismissedVersion('0.10.0');
    markPromptsAnswered(['fish-art']);
    markPromptsAnswered(['fish-art']); // 중복은 한 번만
    expect(getAnnouncements()).toEqual({ dismissedVersion: '0.10.0', answered: ['fish-art'] });
    expect(loadAnnouncements()).toEqual({ dismissedVersion: '0.10.0', answered: ['fish-art'] });
    setDismissedVersion(null); // 다시 보지 않기 해제
    expect(loadAnnouncements().dismissedVersion).toBeNull();
    expect(calls).toBe(3);
    off();
  });

  it('스냅샷은 바뀔 때만 새 객체다 — 구독 훅이 같은 값으로 다시 그리지 않는다', () => {
    const a = getAnnouncements();
    setDismissedVersion(null);
    markPromptsAnswered([]);
    expect(getAnnouncements()).toBe(a);
  });

  it('깨진 저장값은 기본으로 읽는다', () => {
    localStorage.setItem('pf-announcements', '{not json');
    expect(loadAnnouncements()).toEqual({ dismissedVersion: null, answered: [] });
  });
});
