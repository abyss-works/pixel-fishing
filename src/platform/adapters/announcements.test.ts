// 업데이트 소식 기록 — 기기별(localStorage). 다시 보지 않기로 한 소식 버전·답한 설정 질문.
import { describe, it, expect, beforeEach } from 'vitest';
import {
  getAnnouncements, loadAnnouncements, markPromptsAnswered, resetAnnouncements,
  setDismissedVersion, setLastSeenVersion, subscribeAnnouncements,
} from './announcements';

describe('업데이트 소식 기록', () => {
  beforeEach(() => {
    localStorage.clear();
    resetAnnouncements();
  });

  it('처음에는 다시 보지 않기로 한 소식도, 답한 질문도 없다', () => {
    expect(loadAnnouncements()).toEqual({ dismissedVersion: null, lastSeenVersion: null, answered: [] });
  });

  it('다시 보지 않기 버전과 답한 질문을 기기에 남기고 구독자에게 알린다', () => {
    let calls = 0;
    const off = subscribeAnnouncements(() => { calls++; });
    setDismissedVersion('0.10.0');
    markPromptsAnswered(['fish-art']);
    markPromptsAnswered(['fish-art']); // 중복은 한 번만
    expect(getAnnouncements()).toEqual({ dismissedVersion: '0.10.0', lastSeenVersion: null, answered: ['fish-art'] });
    expect(loadAnnouncements()).toEqual({ dismissedVersion: '0.10.0', lastSeenVersion: null, answered: ['fish-art'] });
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
    expect(loadAnnouncements()).toEqual({ dismissedVersion: null, lastSeenVersion: null, answered: [] });
  });

  it('마지막으로 본 버전은 다시 보지 않기와 따로 남고 구독자에게 알린다', () => {
    let calls = 0;
    const off = subscribeAnnouncements(() => { calls++; });
    setLastSeenVersion('0.10.1');
    setLastSeenVersion('0.10.1'); // 같은 값은 알리지 않는다
    expect(getAnnouncements().lastSeenVersion).toBe('0.10.1');
    expect(getAnnouncements().dismissedVersion).toBeNull();
    expect(loadAnnouncements().lastSeenVersion).toBe('0.10.1');
    expect(calls).toBe(1);
    off();
  });

  it('마지막으로 본 버전 필드가 없는 기존 저장값은 그 필드만 비워 읽고 나머지는 보존한다', () => {
    localStorage.setItem('pf-announcements', JSON.stringify({ dismissedVersion: '0.9.0', answered: ['fish-art'] }));
    expect(loadAnnouncements()).toEqual({ dismissedVersion: '0.9.0', lastSeenVersion: null, answered: ['fish-art'] });
  });

  it('형식이 다른 마지막으로 본 버전 값은 비워 읽는다', () => {
    localStorage.setItem('pf-announcements', JSON.stringify({ lastSeenVersion: 3, dismissedVersion: '0.9.0', answered: [] }));
    expect(loadAnnouncements().lastSeenVersion).toBeNull();
    expect(loadAnnouncements().dismissedVersion).toBe('0.9.0');
  });
});
