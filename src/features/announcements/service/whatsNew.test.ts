// 업데이트 소식 서비스 — 현재 버전의 패치노트 항목이 없는 릴리즈(내부 변경만 있는 버전)에서는 접속 시 소식 단계가 열리지 않고,
// 최근 소식 다시 보기는 항목이 있는 가장 최근 버전의 소식을 열며 다시 보지 않기 기록은 그 소식의 버전으로 남는다.
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAnnouncements, markPromptsAnswered, resetAnnouncements, setDismissedVersion } from '../../../platform/api/announcements';
import { APP_VERSION } from '../../../version';
import { SETTING_PROMPTS } from '../model/whatsNew';
import { reopenWhatsNew, resetWhatsNewSession, useWhatsNew } from './whatsNew';

const note = (version: string) => ({ version, date: '2026-01-01', summary: '요약', notes: [] as [] });
const patchNotes = vi.hoisted(() => [] as { version: string; date: string; summary: string; notes: [] }[]);
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
    expect(result.current.news).toBeNull();
  });

  it('답하지 않은 새 질문이 있으면 설정 단계만 연다', () => {
    const { result } = renderHook(() => useWhatsNew(veteran, true));
    expect(result.current.steps).toEqual(['settings']);
    expect(result.current.news).toBeNull();
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
    expect(result.current.news?.version).toBe('0.0.2');
  });

  it('배열 순서가 섞여 있어도 가장 높은 버전을 열고, 현재 버전보다 높은 항목은 열지 않는다', () => {
    patchNotes.push(note('0.0.1'), note('99.0.0'), note('0.0.3'), note('0.0.2'));
    const { result } = renderHook(() => useWhatsNew(veteran, false));
    act(() => { reopenWhatsNew(); });
    expect(result.current.news?.version).toBe('0.0.3');
  });

  it('현재 버전 항목이 있으면 그 소식을 연다', () => {
    patchNotes.push(note(APP_VERSION), note('0.0.1'));
    const { result } = renderHook(() => useWhatsNew(veteran, false));
    act(() => { reopenWhatsNew(); });
    expect(result.current.news?.version).toBe(APP_VERSION);
  });

  it('다시 보기로 연 소식의 다시 보지 않기는 그 소식의 버전으로 남는다', () => {
    patchNotes.push(note('0.0.1'));
    setDismissedVersion(APP_VERSION);
    const { result } = renderHook(() => useWhatsNew(veteran, false));
    act(() => { reopenWhatsNew(); });
    expect(result.current.dismiss).toBe(false);
    act(() => { result.current.setDismiss(true); });
    act(() => { result.current.close(); });
    expect(getAnnouncements().dismissedVersion).toBe('0.0.1');
  });

  it('그 소식을 이미 다시 보지 않기로 했으면 체크된 채로 열린다', () => {
    patchNotes.push(note('0.0.1'));
    setDismissedVersion('0.0.1');
    const { result } = renderHook(() => useWhatsNew(veteran, false));
    act(() => { reopenWhatsNew(); });
    expect(result.current.dismiss).toBe(true);
  });

  it('체크하고 닫은 소식을 다시 열면 체크된 채로 시작한다', () => {
    patchNotes.push(note('0.0.1'));
    const { result } = renderHook(() => useWhatsNew(veteran, false));
    act(() => { reopenWhatsNew(); });
    act(() => { result.current.setDismiss(true); });
    act(() => { result.current.close(); });
    expect(getAnnouncements().dismissedVersion).toBe('0.0.1');
    act(() => { reopenWhatsNew(); });
    expect(result.current.dismiss).toBe(true);
  });
});
