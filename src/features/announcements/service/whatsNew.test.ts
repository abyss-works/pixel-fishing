// 현재 버전의 패치노트 항목이 없는 릴리즈(내부 변경만 있는 버전)에서는 업데이트 소식 단계가 열리지 않는다.
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { markPromptsAnswered, resetAnnouncements } from '../../../platform/api/announcements';
import { APP_VERSION } from '../../../version';
import { SETTING_PROMPTS } from '../model/whatsNew';
import { hasCurrentNews, reopenWhatsNew, resetWhatsNewSession, useWhatsNew } from './whatsNew';

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

  it('이번 소식 다시 보기는 열 항목이 없어 열지 않는다', () => {
    const { result } = renderHook(() => useWhatsNew(veteran, false));
    let opened = true;
    act(() => { opened = reopenWhatsNew(); });
    expect(opened).toBe(false);
    expect(result.current.steps).toEqual([]);
    expect(result.current.open).toBe(false);
  });

  it('현재 버전 항목이 없으면 이번 소식이 없다고 판정한다', () => {
    expect(hasCurrentNews()).toBe(false);
  });

  it('현재 버전 항목이 있으면 이번 소식이 있다고 판정한다', () => {
    patchNotes.push({ version: APP_VERSION, date: '2026-01-01', summary: '요약', notes: [] });
    expect(hasCurrentNews()).toBe(true);
  });

  it('다른 버전 항목만 있으면 이번 소식이 없다고 판정한다', () => {
    patchNotes.push({ version: '0.0.1', date: '2026-01-01', summary: '요약', notes: [] });
    expect(hasCurrentNews()).toBe(false);
  });
});
