import { describe, expect, it } from 'vitest';
import { ARTIFACT_MAX_LEVEL, artifactById, artifactLevelCost } from '../../../game/content/artifacts';
import { newState } from '../../../game/rules/logic';
import type { GameState } from '../../../game/rules/logic';
import { LEVEL_UP_TEXT, levelUpToast, selectArtifactLevel } from './artifactLevel';

const art = (id: string) => artifactById(id)!;
const seed = (over: Partial<GameState> = {}): GameState => ({ ...newState(), ...over });

describe('유물 레벨 보기 데이터', () => {
  it('갖지 않은 유물은 unowned이고 레벨 0, 효과는 Lv1 기준이다', () => {
    const v = selectArtifactLevel(seed(), art('wreck-compass'));
    expect(v.status).toBe('unowned');
    expect(v.level).toBe(0);
    expect(v.effects.sail).toBeCloseTo(0.1, 10);
    expect(v.next).toBeNull();
  });

  it('전설 유물은 legendary이고 레벨 줄이 없다', () => {
    const v = selectArtifactLevel(seed({ artifacts: ['mami-wata-mirror'] }), art('mami-wata-mirror'));
    expect(v.status).toBe('legendary');
    expect(v.hasLevel).toBe(false);
    expect(v.next).toBeNull();
  });

  it('레벨 맵이 없으면 Lv1이고 다음 레벨 재료 수와 보유량, 다음 효과를 낸다', () => {
    const v = selectArtifactLevel(seed({ artifacts: ['wreck-compass'], items: { 'mat-wreck-compass': 0 } }), art('wreck-compass'));
    expect(v.level).toBe(1);
    expect(v.status).toBe('short');
    expect(v.material).toEqual({ id: 'mat-wreck-compass', name: '이끼 낀 나침반', have: 0 });
    expect(v.next?.level).toBe(2);
    expect(v.next?.cost).toBe(artifactLevelCost(2));
    expect(v.next?.effects.sail).toBeCloseTo(0.125, 10);
  });

  it('재료가 충분하면 ready다', () => {
    const g = seed({ artifacts: ['wreck-compass'], artifactLevels: { 'wreck-compass': 3 }, items: { 'mat-wreck-compass': 4 } });
    const v = selectArtifactLevel(g, art('wreck-compass'));
    expect(v.status).toBe('ready');
    expect(v.next).toMatchObject({ level: 4, cost: artifactLevelCost(4) });
  });

  it('최고 레벨이면 max이고 다음 단계가 없다', () => {
    const g = seed({ artifacts: ['wreck-compass'], artifactLevels: { 'wreck-compass': ARTIFACT_MAX_LEVEL }, items: { 'mat-wreck-compass': 99 } });
    const v = selectArtifactLevel(g, art('wreck-compass'));
    expect(v.status).toBe('max');
    expect(v.next).toBeNull();
    expect(v.effects.sail).toBeCloseTo(0.2, 10);
  });
});

describe('유물 레벨 문구', () => {
  it('상태별 거부 문구와 성공 토스트가 문안과 같다', () => {
    expect(LEVEL_UP_TEXT.notice.short).toBe('교환 재료가 부족해요. 네임드를 토벌해 보세요.');
    expect(LEVEL_UP_TEXT.notice.max).toBe('이미 최고 레벨이에요.');
    expect(LEVEL_UP_TEXT.notice.unowned).toBe('아직 가지지 않은 유물이에요. 먼저 교환해 주세요.');
    expect(LEVEL_UP_TEXT.notice.legendary).toBe('전설 유물은 레벨이 없어요. 가지고만 있어도 효과가 계속돼요.');
    expect(levelUpToast(art('wreck-compass'), 3)).toBe('침선의 나침반의 레벨이 Lv.3까지 올랐어요!');
  });
});
