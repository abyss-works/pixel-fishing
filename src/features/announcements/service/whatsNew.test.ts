// 현재 버전의 패치노트 항목이 없는 릴리즈(내부 변경만 있는 버전)에서는 업데이트 소식 단계가 열리지 않는다.
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetAnnouncements, markPromptsAnswered } from '../../../platform/adapters/announcements';
import { SETTING_PROMPTS } from '../model/whatsNew';
import { reopenWhatsNew, resetWhatsNewSession, useWhatsNew } from './whatsNew';

vi.mock('../../../game/content/patchnotes', () => ({ PATCH_NOTES: [] }));

const veteran = { fame: 120, dex: {} };

describe('현재 버전 항목이 없는 릴리즈의 업데이트 소식', () => {
  beforeEach(() => {
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
    let opened = true;
    act(() => { opened = reopenWhatsNew(); });
    expect(opened).toBe(false);
  });
});
