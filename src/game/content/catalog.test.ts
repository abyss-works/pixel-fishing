import { describe, expect, it } from 'vitest';
import { EVENT_FISH } from './eventFish';
import { FISH } from './fish';
import { CATALOG_FISH, catalogFishById, catalogFishOfSpot, catalogValueOf } from './catalog';

describe('단일 어종 카탈로그(catalog)', () => {
  it('상시 어종과 이벤트 어종을 원본 배열 분리 상태로 통합 조회한다', () => {
    expect(CATALOG_FISH).toHaveLength(FISH.length + EVENT_FISH.length);
    const carp = catalogFishById('carp');
    expect(carp?.catalog).toBe('regular');
    expect(carp?.valueOf('normal')).toEqual({ kind: 'gold', amount: FISH.find(f => f.id === 'carp')!.price });

    const glaaki = catalogFishById('event-glaaki');
    expect(glaaki?.catalog).toBe('event');
    expect(glaaki?.spot).toBe('championship');
    expect(glaaki?.valueOf('normal')).toEqual({ kind: 'score', amount: 400 });
    expect(glaaki?.valueOf('variant')).toEqual({ kind: 'score', amount: 800 });
  });

  it('해역별 어종 조회가 일반 해역과 이벤트 구역을 모두 지원한다', () => {
    expect(catalogFishOfSpot('championship')).toHaveLength(EVENT_FISH.length);
    expect(catalogFishOfSpot('pond').length).toBeGreaterThan(0);
    expect(catalogValueOf('unknown-id')).toBeNull();
  });
});
