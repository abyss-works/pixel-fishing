import { describe, it, expect } from 'vitest';
import { newState } from '../../../game/rules/logic';
import type { GameState } from '../../../game/rules/logic';
import { ACHIEVEMENT_TABS, achievementRowById, achievementRows, achievementSummary, canClaim, claimableCount, newlyClaimable, rowStatusOf } from './achievements';

const seed = (over: Partial<GameState> = {}): GameState => ({ ...newState(), ...over });

describe('탭', () => {
  it('탭 순서는 진행, 수집, 네임드와 유물, 횟수다', () => {
    expect(ACHIEVEMENT_TABS.map(t => t.key)).toEqual(['progress', 'collection', 'namedArtifact', 'count']);
  });
});

describe('행 상태', () => {
  it('저장이 없으면 진행 중, claimable이면 받을 수 있음, claimed면 받음이다', () => {
    expect(rowStatusOf(seed(), 'big-50')).toBe('progress');
    expect(rowStatusOf(seed({ achievements: { 'big-50': 'claimable' } }), 'big-50')).toBe('claimable');
    expect(rowStatusOf(seed({ achievements: { 'big-50': 'claimed' } }), 'big-50')).toBe('claimed');
  });
});

describe('행 진척', () => {
  it('진척은 규칙 판정의 현재와 목표다', () => {
    const row = achievementRowById(seed(), 'big-50')!;
    expect(row.progress).toEqual({ current: 0, target: 50 });
    expect(row.status).toBe('progress');
  });
  it('모르는 id는 행을 만들지 않는다', () => {
    expect(achievementRowById(seed(), 'no-such')).toBeUndefined();
  });
});

describe('탭 목록 정렬', () => {
  it('받을 수 있는 업적이 맨 위, 그 아래 진행 중, 마지막에 받은 순이다', () => {
    const state = seed({
      achievements: {
        'named-all': 'claimed',
        'artifact-all': 'claimable',
      },
    });
    const rows = achievementRows(state, 'namedArtifact');
    expect(rows.map(r => [r.def.id, r.status])).toEqual([
      ['artifact-all', 'claimable'],
      ['named-all', 'claimed'],
    ]);
  });
  it('같은 상태 안에서는 정의 순서를 지킨다', () => {
    const rows = achievementRows(seed(), 'collection');
    expect(rows[0].def.id).toBe('variant-village');
    expect(rows[rows.length - 1].def.id).toBe('big-50');
  });
});

describe('요약 줄', () => {
  it('받을 골드와 모자를 claimable 업적의 보상으로 합산하고 받은 수를 센다', () => {
    const state = seed({
      achievements: {
        'zone-basic-pacific': 'claimable',
        'variant-village': 'claimable',
        'zone-full-pacific': 'claimed',
      },
    });
    expect(achievementSummary(state)).toEqual({ claimed: 1, total: 24, gold: 25_000, hats: 1, canClaimAll: true });
  });
  it('받을 수 있는 업적이 없으면 모두 받기는 거짓이다', () => {
    expect(achievementSummary(seed())).toMatchObject({ gold: 0, hats: 0, canClaimAll: false });
  });
  it('게스트는 받을 수 있는 업적이 있어도 모두 받기가 거짓이다', () => {
    const state = seed({ achievements: { 'zone-basic-pacific': 'claimable' } });
    expect(achievementSummary(state, true).canClaimAll).toBe(false);
  });
  it('메뉴 배지 수와 요약 줄의 받을 수 있는 수는 같다', () => {
    const state = seed({ achievements: { 'zone-basic-pacific': 'claimable', 'variant-village': 'claimable' } });
    expect(claimableCount(state)).toBe(2);
  });
});

describe('새로 받을 수 있게 된 업적 감지', () => {
  it('이전에 없거나 진행 중이던 업적이 claimable이 되면 이름표를 뽑는다', () => {
    const before = seed({ achievements: { 'variant-village': 'claimable', 'catch-100000': 'claimed' } });
    const after = seed({
      achievements: {
        'variant-village': 'claimable',
        'catch-100000': 'claimed',
        'zone-basic-pacific': 'claimable',
        'big-50': 'claimable',
      },
    });
    expect(newlyClaimable(before, after)).toEqual(['태평양 도감', '월척 장부']);
  });
  it('이미 claimable이거나 받기로 바뀐 업적은 새 업적이 아니다', () => {
    const before = seed({ achievements: { 'zone-basic-pacific': 'claimable' } });
    const after = seed({ achievements: { 'zone-basic-pacific': 'claimed' } });
    expect(newlyClaimable(before, after)).toEqual([]);
  });
  it('모르는 id가 새로 claimable이 돼도 이름표를 지어내지 않는다', () => {
    const before = seed();
    const after = seed({ achievements: { 'no-such': 'claimable' } });
    expect(newlyClaimable(before, after)).toEqual([]);
  });
});

describe('받기 버튼 판정', () => {
  it('claimable이 아니면 받을 수 없다', () => {
    expect(canClaim(seed(), 'zone-basic-pacific')).toBe(false);
    expect(canClaim(seed({ achievements: { 'zone-basic-pacific': 'claimable' } }), 'zone-basic-pacific')).toBe(true);
  });
  it('게스트는 claimable이어도 받을 수 없다', () => {
    const state = seed({ achievements: { 'zone-basic-pacific': 'claimable' } });
    expect(canClaim(state, 'zone-basic-pacific', true)).toBe(false);
  });
});
