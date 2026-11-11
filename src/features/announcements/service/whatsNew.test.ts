// 업데이트 소식 서비스 — 현재 버전의 패치노트 항목이 없는 릴리즈(내부 변경만 있는 버전)에서는 접속 시 소식 단계가 열리지 않고,
// 최근 소식 다시 보기는 항목이 있는 가장 최근 버전의 소식을 체크 없이 연다.
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAnnouncements, markPromptsAnswered, resetAnnouncements, setLastSeenVersion } from '../../../platform/api/announcements';
import { APP_VERSION } from '../../../version';
import { SETTING_PROMPTS } from '../model/whatsNew';
import { reopenWhatsNew, resetWhatsNewSession, useWhatsNew } from './whatsNew';

type TestNote = { version: string; date: string; summary?: string; notes: { tag: '기능' | '기타'; text: string }[] };
const note = (version: string): TestNote => ({
  version, date: '2026-01-01', summary: '요약', notes: [{ tag: '기능', text: '공개 항목' }],
});
const patchNotes = vi.hoisted(() => [] as TestNote[]);
vi.mock('../../../game/content/patchnotes', () => ({ PATCH_NOTES: patchNotes }));

const veteran = { fame: 120, dex: {} };

describe('현재 버전 항목이 없는 릴리즈의 업데이트 소식', () => {
  beforeEach(() => {
    patchNotes.length = 0;
    localStorage.clear();
    resetAnnouncements();
    resetWhatsNewSession();
  });
  afterEach(cleanup);

  it('새 질문까지 모두 답했으면 창을 열지 않는다', () => {
    markPromptsAnswered(SETTING_PROMPTS.map(p => p.id));
    const { result } = renderHook(() => useWhatsNew(veteran, true));
    expect(result.current.open).toBe(false);
    expect(result.current.news).toEqual([]);
  });

  it('답하지 않은 새 질문이 있으면 설정 단계만 연다', () => {
    const { result } = renderHook(() => useWhatsNew(veteran, true));
    expect(result.current.steps).toEqual(['settings']);
    expect(result.current.news).toEqual([]);
  });

  it('다시 보기는 열 항목이 하나도 없으면 열지 않는다', () => {
    const { result } = renderHook(() => useWhatsNew(veteran, false));
    let opened = true;
    act(() => { opened = reopenWhatsNew(); });
    expect(opened).toBe(false);
    expect(result.current.steps).toEqual([]);
    expect(result.current.open).toBe(false);
  });
});

describe('최근 소식 다시 보기', () => {
  beforeEach(() => {
    patchNotes.length = 0;
    localStorage.clear();
    resetAnnouncements();
    resetWhatsNewSession();
  });
  afterEach(cleanup);

  it('현재 버전 항목이 없으면 항목이 있는 가장 최근 버전의 소식을 연다', () => {
    patchNotes.push(note('0.0.2'), note('0.0.1'));
    const { result } = renderHook(() => useWhatsNew(veteran, false));
    let opened = false;
    act(() => { opened = reopenWhatsNew(); });
    expect(opened).toBe(true);
    expect(result.current.steps).toEqual(['news']);
    expect(result.current.news.map(n => n.version)).toEqual(['0.0.2']);
  });

  it('배열 순서가 섞여 있어도 가장 높은 버전을 열고, 현재 버전보다 높은 항목은 열지 않는다', () => {
    patchNotes.push(note('0.0.1'), note('99.0.0'), note('0.0.3'), note('0.0.2'));
    const { result } = renderHook(() => useWhatsNew(veteran, false));
    act(() => { reopenWhatsNew(); });
    expect(result.current.news.map(n => n.version)).toEqual(['0.0.3']);
  });

  it('현재 버전 항목이 있으면 그 소식을 연다', () => {
    patchNotes.push(note(APP_VERSION), note('0.0.1'));
    const { result } = renderHook(() => useWhatsNew(veteran, false));
    act(() => { reopenWhatsNew(); });
    expect(result.current.news.map(n => n.version)).toEqual([APP_VERSION]);
  });

  it('다시 보기로 열고 닫아도 마지막으로 본 버전은 바뀌지 않는다', () => {
    patchNotes.push(note('0.0.1'));
    setLastSeenVersion(APP_VERSION);
    const { result } = renderHook(() => useWhatsNew(veteran, false));
    act(() => { reopenWhatsNew(); });
    act(() => { result.current.close(); });
    expect(getAnnouncements().lastSeenVersion).toBe(APP_VERSION);
  });
});

describe('마지막으로 본 버전 뒤의 소식', () => {
  beforeEach(() => {
    patchNotes.length = 0;
    localStorage.clear();
    resetAnnouncements();
    resetWhatsNewSession();
  });
  afterEach(cleanup);

  it('접속하면 본 버전 뒤부터 현재 버전까지 노트가 있는 버전을 최신 순으로 한 번에 연다', () => {
    patchNotes.push(note('0.0.1'), note(APP_VERSION), note('0.0.2'));
    setLastSeenVersion('0.0.1');
    markPromptsAnswered(SETTING_PROMPTS.map(p => p.id));
    const { result } = renderHook(() => useWhatsNew(veteran, true));
    expect(result.current.steps).toEqual(['news']);
    expect(result.current.news.map(n => n.version)).toEqual([APP_VERSION, '0.0.2']);
  });

  it('창이 보이면 닫기 전에도 보인 가장 높은 버전을 마지막으로 본 버전으로 남긴다', () => {
    patchNotes.push(note(APP_VERSION), note('0.0.2'));
    markPromptsAnswered(SETTING_PROMPTS.map(p => p.id));
    renderHook(() => useWhatsNew(veteran, true));
    expect(getAnnouncements().lastSeenVersion).toBe(APP_VERSION);
  });

  it('닫고 다시 접속하면 그 뒤의 새 버전만 본다', () => {
    patchNotes.push(note('0.0.2'), note('0.0.1'));
    setLastSeenVersion('0.0.1');
    markPromptsAnswered(SETTING_PROMPTS.map(p => p.id));
    const first = renderHook(() => useWhatsNew(veteran, true));
    expect(first.result.current.news.map(n => n.version)).toEqual(['0.0.2']);
    act(() => { first.result.current.close(); });
    resetWhatsNewSession();
    const again = renderHook(() => useWhatsNew(veteran, true));
    expect(again.result.current.news).toEqual([]);
    expect(again.result.current.open).toBe(false);
  });

  it('처음 시작한 플레이어는 창을 열지 않고 현재 버전을 본 것으로 기록한다', () => {
    patchNotes.push(note(APP_VERSION));
    const { result } = renderHook(() => useWhatsNew({ fame: 0, dex: {} }, true));
    expect(result.current.open).toBe(false);
    expect(getAnnouncements().lastSeenVersion).toBe(APP_VERSION);
  });
});
