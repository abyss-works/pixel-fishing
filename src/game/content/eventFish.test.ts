import { describe, expect, it } from 'vitest';
import {
  EVENT1_TRIO_TARGETS,
  EVENT2_SETTLEMENT_RATES,
  EVENT2_STANDARD_SPEC,
  EVENT_FISH,
  EVENT_FISH_BY_ID,
  EVENT_HAT_IDS,
  eventFishById,
} from './eventFish';
import { FISH_SPRITES } from './sprites/fishSprites';
import { validateSprite } from './sprites/types';
import { isKnownLocation } from './places';
import { fishById } from './fish';
import { powerReqOf, spotById } from './spots';
import { hatById } from './wardrobe';
import { defaultZoneOfRegion, spotsOfRegion, zoneById } from './zones';

describe('이벤트 2 어종 및 표준 스펙 계약', () => {
  it('전용 어종 9종과 변이 점수가 정본과 일치한다', () => {
    expect(EVENT_FISH).toHaveLength(9);
    expect(EVENT_FISH_BY_ID.size).toBe(9);
    expect(EVENT_FISH.filter(f => f.rarity === 'common')).toHaveLength(3);
    expect(EVENT_FISH.filter(f => f.rarity === 'rare')).toHaveLength(3);
    expect(EVENT_FISH.filter(f => f.rarity === 'epic')).toHaveLength(2);
    expect(EVENT_FISH.filter(f => f.rarity === 'legendary')).toHaveLength(1);
    for (const fish of EVENT_FISH) {
      expect(eventFishById(fish.id)).toBe(fish);
      expect(fish.variant.score).toBe(fish.score * 2);
      expect(fish.lore.length).toBeGreaterThan(0);
      expect(fish.variant.lore.length).toBeGreaterThan(0);
    }
    expect(eventFishById('event-glaaki')?.variant.name).toBe('태고의 글라키');
  });

  it('표준 스펙·10점당 정산 단가·트리오·한정 모자·championship 구역이 정합하다', () => {
    expect(EVENT2_STANDARD_SPEC).toEqual({
      rodLevel: 20,
      power: 105,
      powerReq: 105,
      idleBoost: 5,
      biteMinSec: 2.3,
      biteMaxSec: 4.3,
      weights: [7400, 2000, 500, 100],
      variantEv: 1.25,
    });
    expect(EVENT2_SETTLEMENT_RATES.idle).toEqual([9, 12, 19, 84, 84, 128, 260, 979, 4569, 19534]);
    expect(EVENT2_SETTLEMENT_RATES.manual).toEqual([19, 24, 40, 208, 208, 318, 651, 2602, 12609, 55027]);
    expect(EVENT2_SETTLEMENT_RATES.fame).toBe(4);
    expect(EVENT1_TRIO_TARGETS).toEqual([
      { fishId: 'salmon', form: 'normal' },
      { fishId: 'yellowtail', form: 'normal' },
      { fishId: 'tuna', form: 'normal' },
    ]);
    for (const target of EVENT1_TRIO_TARGETS) {
      expect(fishById(target.fishId), `${target.fishId} fishById 조회`).toBeDefined();
    }
    expect(hatById(EVENT_HAT_IDS.normal)?.source).toBe('event');
    expect(hatById(EVENT_HAT_IDS.variant)?.source).toBe('event');

    expect(isKnownLocation({ kind: 'region', id: 'championship' })).toBe(true);
    expect(spotById('championship')?.powerReq).toBe(105);
    expect(powerReqOf('championship')).toBe(105);
    expect(zoneById('championship')?.shortName).toBe('분지 호수');
    expect(defaultZoneOfRegion('championship')).toBe('championship');
    expect(spotsOfRegion('championship').map(s => s.id)).toEqual(['championship']);
  });

  it('전용 어종 9종의 일반·돌연변이 18개 픽셀 스프라이트가 모두 32×16으로 등록되어 있다', () => {
    for (const fish of EVENT_FISH) {
      for (const key of [fish.id, `${fish.id}.variant`]) {
        const sprite = FISH_SPRITES[key];
        expect(sprite, `${key} 스프라이트 누락`).toBeDefined();
        expect(sprite!.w, `${key} w`).toBe(32);
        expect(sprite!.h, `${key} h`).toBe(16);
        expect(validateSprite(sprite!), `${key} 무결성`).toEqual([]);
      }
    }
  });
});
