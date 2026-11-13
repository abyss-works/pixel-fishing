import { describe, it, expect } from 'vitest';
import {
  isFreshPlayer, latestNewsAtOrBelow, pendingPrompts, planWhatsNew, SETTING_PROMPTS, unseenNews,
} from './whatsNew';
import type { PatchNote } from '../../../game/content/patchnotes';
import { newState } from '../../../game/rules/logic';

const note = (version: string): PatchNote => ({
  version, date: '2026-10-16', summary: '요약', notes: [{ tag: '기능', text: '공개 항목' }],
});
const NOTES = [note('0.10.0'), note('0.9.0')];

const rec = (lastSeenVersion: string | null, dismissedVersion: string | null = null) => ({ lastSeenVersion, dismissedVersion });

describe('아직 보지 않은 소식', () => {
  it('마지막으로 본 버전 뒤부터 현재 버전까지 노트가 있는 버전을 최신 순으로 모두 돌려준다', () => {
    const notes = [note('0.9.0'), note('0.10.2'), note('0.10.0'), note('0.10.1')];
    expect(unseenNews(notes, '0.10.2', rec('0.9.0')).map(n => n.version)).toEqual(['0.10.2', '0.10.1', '0.10.0']);
  });

  it('현재 버전보다 높은 노트와 본 버전 이하의 노트는 넣지 않는다', () => {
    const notes = [note('0.11.0'), note('0.10.0'), note('0.9.0')];
    expect(unseenNews(notes, '0.10.0', rec('0.9.0')).map(n => n.version)).toEqual(['0.10.0']);
  });

  it('현재 버전 노트가 없어도 그 사이 버전이 있으면 보인다', () => {
    expect(unseenNews([note('0.10.1'), note('0.9.0')], '0.10.3', rec('0.9.0')).map(n => n.version)).toEqual(['0.10.1']);
  });

  it('현재 버전까지 봤거나 사이에 노트가 없으면 비어 있다', () => {
    expect(unseenNews(NOTES, '0.10.0', rec('0.10.0'))).toEqual([]);
    expect(unseenNews(NOTES, '0.11.0', rec('0.10.0'))).toEqual([]);
    expect(unseenNews([], '0.10.0', rec(null))).toEqual([]);
  });

  it('본 기록이 없으면 현재 버전 노트 하나만 돌려준다', () => {
    expect(unseenNews(NOTES, '0.10.0', rec(null)).map(n => n.version)).toEqual(['0.10.0']);
    expect(unseenNews(NOTES, '0.11.0', rec(null))).toEqual([]);
  });

  it('마지막으로 본 버전 기록이 없는 기존 저장값은 다시 보지 않기 버전을 본 버전으로 쓴다', () => {
    const notes = [note('0.10.1'), note('0.10.0'), note('0.9.0')];
    expect(unseenNews(notes, '0.10.1', rec(null, '0.9.0')).map(n => n.version)).toEqual(['0.10.1', '0.10.0']);
  });

  it('마지막으로 본 버전 기록이 있으면 기존 다시 보지 않기 버전은 무시한다', () => {
    const notes = [note('0.10.1'), note('0.10.0'), note('0.9.0')];
    expect(unseenNews(notes, '0.10.1', rec('0.10.0', '0.9.0')).map(n => n.version)).toEqual(['0.10.1']);
  });
});

describe('가장 최근 소식', () => {
  it('배열 순서와 무관하게 현재 버전 이하에서 가장 높은 버전이다', () => {
    const notes = [note('0.9.0'), note('0.10.1'), note('0.10.0'), note('0.2.0')];
    expect(latestNewsAtOrBelow(notes, '0.10.1')?.version).toBe('0.10.1');
    expect(latestNewsAtOrBelow(notes, '0.10.5')?.version).toBe('0.10.1');
  });

  it('숫자로 비교한다 — 0.10.0은 0.9.0보다 높다', () => {
    expect(latestNewsAtOrBelow([note('0.9.0'), note('0.10.0')], '1.0.0')?.version).toBe('0.10.0');
  });

  it('현재 버전보다 높은 항목은 고르지 않는다', () => {
    expect(latestNewsAtOrBelow([note('0.11.0'), note('0.9.0')], '0.10.0')?.version).toBe('0.9.0');
    expect(latestNewsAtOrBelow([note('0.11.0')], '0.10.0')).toBeNull();
  });

  it('항목이 없으면 없다', () => {
    expect(latestNewsAtOrBelow([], '0.10.0')).toBeNull();
  });
});

describe('새 설정 질문', () => {
  it('등록된 질문은 선택지마다 값·이름이 있고 기본 선택지가 정확히 하나다', () => {
    expect(SETTING_PROMPTS.map(p => p.id)).toContain('fish-art');
    for (const p of SETTING_PROMPTS) {
      expect(p.options.length, p.id).toBeGreaterThanOrEqual(2);
      expect(p.options.filter(o => o.badge === '기본').length, p.id).toBe(1);
    }
  });

  it('답한 질문은 빠진다', () => {
    expect(pendingPrompts(SETTING_PROMPTS, new Set())).toHaveLength(SETTING_PROMPTS.length);
    expect(pendingPrompts(SETTING_PROMPTS, new Set(['fish-art'])).map(p => p.id)).not.toContain('fish-art');
  });
});

describe('처음 시작한 플레이어', () => {
  it('명성 0이고 도감이 비었으면 처음이다', () => {
    expect(isFreshPlayer(newState())).toBe(true);
    expect(isFreshPlayer({ ...newState(), fame: 10 })).toBe(false);
    expect(isFreshPlayer({ ...newState(), dex: { carp: { normal: { count: 1, maxSize: null, first: null } } } })).toBe(false);
  });
});

describe('소식 창 단계 계획', () => {
  const prompts = SETTING_PROMPTS;

  it('소식과 미답 질문이 있으면 소식 → 새 설정 순서다', () => {
    expect(planWhatsNew({ news: [note('0.10.0')], prompts, fresh: false })).toEqual(['news', 'settings']);
  });

  it('소식만 남았으면 소식 한 단계다 — 질문은 한 번만 묻는다', () => {
    expect(planWhatsNew({ news: [note('0.10.0')], prompts: [], fresh: false })).toEqual(['news']);
  });

  it('보여줄 것이 없으면 열지 않는다', () => {
    expect(planWhatsNew({ news: [], prompts: [], fresh: false })).toEqual([]);
  });

  it('현재 버전 소식이 없고 새 질문만 남으면 설정 단계만 보여준다', () => {
    expect(planWhatsNew({ news: [], prompts: SETTING_PROMPTS, fresh: false })).toEqual(['settings']);
  });

  it('처음 시작한 플레이어에게는 열지 않는다 — 기본 설정으로 시작한다', () => {
    expect(planWhatsNew({ news: [note('0.10.0')], prompts, fresh: true })).toEqual([]);
  });
});
