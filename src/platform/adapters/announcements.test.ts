// 업데이트 소식 기록 — 기기별(localStorage). 다시 보지 않기로 한 소식 버전·답한 설정 질문.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getAnnouncements, loadAnnouncements, markPromptsAnswered, resetAnnouncements,
  setLastSeenVersion, subscribeAnnouncements,
} from './announcements';

describe('업데이트 소식 기록', () => {
  beforeEach(() => {
    localStorage.clear();
    resetAnnouncements();
  });

  it('처음에는 다시 보지 않기로 한 소식도, 답한 질문도 없다', () => {
    expect(loadAnnouncements()).toEqual({ dismissedVersion: null, lastSeenVersion: null, answered: [] });
  });

  it('마지막으로 본 버전과 답한 질문을 기기에 남기고 구독자에게 알린다', () => {
    let calls = 0;
    const off = subscribeAnnouncements(() => { calls++; });
    setLastSeenVersion('0.10.0');
    markPromptsAnswered(['fish-art']);
    markPromptsAnswered(['fish-art']); // 중복은 한 번만
    const expected = { dismissedVersion: null, lastSeenVersion: '0.10.0', answered: ['fish-art'] };
    expect(getAnnouncements()).toEqual(expected);
    expect(loadAnnouncements()).toEqual(expected);
    expect(calls).toBe(2);
    off();
  });

  it('스냅샷은 바뀔 때만 새 객체다 — 구독 훅이 같은 값으로 다시 그리지 않는다', () => {
    setLastSeenVersion('0.10.0');
    const a = getAnnouncements();
    setLastSeenVersion('0.10.0');
    markPromptsAnswered([]);
    expect(getAnnouncements()).toBe(a);
  });

  it('깨진 저장값은 기본으로 읽는다', () => {
    localStorage.setItem('pf-announcements', '{not json');
    expect(loadAnnouncements()).toEqual({ dismissedVersion: null, lastSeenVersion: null, answered: [] });
  });

  it('저장할 때 모르는 필드와 기존 다시 보지 않기 버전을 지우지 않는다', async () => {
    localStorage.setItem('pf-announcements', JSON.stringify({ dismissedVersion: '0.9.0', answered: [], future: { a: 1 } }));
    vi.resetModules();
    const fresh = await import('./announcements'); // 접속 때 저장값을 읽은 상태
    fresh.setLastSeenVersion('0.10.0');
    expect(JSON.parse(localStorage.getItem('pf-announcements') ?? '{}')).toEqual({
      dismissedVersion: '0.9.0', lastSeenVersion: '0.10.0', answered: [], future: { a: 1 },
    });
  });

  it('저장값이 깨졌으면 새로 쓴다', () => {
    localStorage.setItem('pf-announcements', '{not json');
    setLastSeenVersion('0.10.0');
    expect(loadAnnouncements().lastSeenVersion).toBe('0.10.0');
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
