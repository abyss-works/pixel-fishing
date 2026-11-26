import { describe, expect, it } from 'vitest';
import { FISH } from '../content/fish.js';
import { SPOTS } from '../content/spots.js';
import { fmtGold as uiFmtGold, fmtSize as uiFmtSize } from '../../presentation/ui/format.js';
import { fmtGold, fmtSize } from '../../shared/lib/format.js';
import {
  DEFAULT_WIDGET_SEA_THEME,
  SPOT_SEA_THEME,
  WIDGET_CLIENT_HEADER,
  WIDGET_CLIENT_VALUE,
  WIDGET_IDLE_TIMEOUT_MS,
  WIDGET_MIN_CLIENT_VERSION,
  WIDGET_RECENT_CATCH_LIMIT,
  WIDGET_SSE_KEEPALIVE_MS,
  WIDGET_VERSION_HEADER,
  buildWidgetBagSummary,
  buildWidgetCatchItem,
  computeBagPercent,
  deriveFishFallbackColors,
  isMinWidgetVersionSupported,
  resolveSpotSeaTheme,
} from './widget.js';

const HEX_RE = /^#[0-9a-f]{6}$/;

describe('widget shared contract — 헤더·상수', () => {
  it('위젯 클라이언트·버전 헤더와 최소 지원 버전을 고정한다', () => {
    expect(WIDGET_CLIENT_HEADER).toBe('x-widget-client');
    expect(WIDGET_CLIENT_VALUE).toBe('desktop');
    expect(WIDGET_VERSION_HEADER).toBe('x-widget-version');
    expect(WIDGET_MIN_CLIENT_VERSION).toBe('0.1.0');
    expect(WIDGET_IDLE_TIMEOUT_MS).toBe(90_000);
    expect(WIDGET_SSE_KEEPALIVE_MS).toBe(25_000);
    expect(WIDGET_RECENT_CATCH_LIMIT).toBe(4);
  });
});

describe('widget shared contract — 해역 테마 매핑', () => {
  it('전체 15개 해역(SpotId)이 모두 매핑되고 미지 값은 deep으로 폴백한다', () => {
    expect(SPOTS).toHaveLength(15);
    expect(Object.keys(SPOT_SEA_THEME).sort()).toEqual(SPOTS.map(s => s.id).sort());
    for (const spot of SPOTS) {
      expect(SPOT_SEA_THEME[spot.id]).toBe('deep');
      expect(resolveSpotSeaTheme(spot.id)).toBe('deep');
    }
    expect(resolveSpotSeaTheme(undefined)).toBe(DEFAULT_WIDGET_SEA_THEME);
    expect(resolveSpotSeaTheme(null)).toBe(DEFAULT_WIDGET_SEA_THEME);
    expect(resolveSpotSeaTheme('')).toBe(DEFAULT_WIDGET_SEA_THEME);
    expect(resolveSpotSeaTheme('unknown-spot')).toBe('deep');
    expect(resolveSpotSeaTheme('toString')).toBe('deep');
    expect(resolveSpotSeaTheme('__proto__')).toBe('deep');
  });
});

describe('widget shared contract — 공용 포맷 동치', () => {
  it('shared/lib/format의 fmtSize와 fmtGold는 UI format과 100% 동일하다', () => {
    for (const cm of [0, 0.5, 12.34, 99.94, 99.99, 100, 385.2, 1085]) {
      expect(fmtSize(cm)).toBe(uiFmtSize(cm));
    }
    for (const gold of [0, 3, 60, 500, 1200, 15_000, 1_234_567]) {
      expect(fmtGold(gold)).toBe(uiFmtGold(gold));
    }
  });
});

describe('widget shared contract — 최소 버전 semver 판정', () => {
  it('최소 버전 이상이면 true, 미만·누락·비정규 문자열이면 false를 돌려준다', () => {
    expect(isMinWidgetVersionSupported('0.1.0', '0.1.0')).toBe(true);
    expect(isMinWidgetVersionSupported('0.1.1', '0.1.0')).toBe(true);
    expect(isMinWidgetVersionSupported('0.2.0', '0.1.0')).toBe(true);
    expect(isMinWidgetVersionSupported('1.0.0', '0.9.9')).toBe(true);
    expect(isMinWidgetVersionSupported('0.10.0', '0.2.0')).toBe(true);
    expect(isMinWidgetVersionSupported('0.1.0+build.1', '0.1.0')).toBe(true);

    expect(isMinWidgetVersionSupported('0.0.9', '0.1.0')).toBe(false);
    expect(isMinWidgetVersionSupported('0.1.0', '0.2.0')).toBe(false);
    expect(isMinWidgetVersionSupported('0.1.9', '0.2.0')).toBe(false);
    expect(isMinWidgetVersionSupported('0.1.0-rc.1', '0.1.0')).toBe(false);
    expect(isMinWidgetVersionSupported('0.1.0-rc.1', '0.1.0-rc.2')).toBe(false);
    expect(isMinWidgetVersionSupported('0.1.0-rc.2', '0.1.0-rc.1')).toBe(true);
    expect(isMinWidgetVersionSupported('', '0.1.0')).toBe(false);
    expect(isMinWidgetVersionSupported(null, '0.1.0')).toBe(false);
    expect(isMinWidgetVersionSupported(undefined, '0.1.0')).toBe(false);
    expect(isMinWidgetVersionSupported('0.1', '0.1.0')).toBe(false);
    expect(isMinWidgetVersionSupported('v0.1.0', '0.1.0')).toBe(false);
    expect(isMinWidgetVersionSupported('invalid', '0.1.0')).toBe(false);
  });
});

describe('widget shared contract — 폴백 팔레트·가방·포획 조립', () => {
  it('모든 어종의 일반·변이 폴백 색상이 유효한 6자리 hex 팔레트를 돌려준다', () => {
    for (const fish of FISH) {
      const normal = deriveFishFallbackColors(fish);
      const mutant = deriveFishFallbackColors(fish, true);
      for (const pal of [normal, mutant]) {
        expect(pal.body).toMatch(HEX_RE);
        expect(pal.fin).toMatch(HEX_RE);
        expect(pal.belly).toMatch(HEX_RE);
        expect(pal.eye).toMatch(HEX_RE);
        expect(pal.fin).not.toBe(pal.body);
        expect(pal.eye).not.toBe(pal.body);
      }
      expect(normal.body).toBe(fish.color.toLowerCase());
      expect(mutant.body).toBe(fish.variant.color.toLowerCase());
    }
  });

  it('가방 내림 백분율과 위젯 포획 아이템을 명세 규격대로 조립한다', () => {
    expect(computeBagPercent(0, 1500)).toBe(0);
    expect(computeBagPercent(840, 1500)).toBe(56);
    expect(computeBagPercent(1499, 1500)).toBe(99);
    expect(computeBagPercent(1800, 1500)).toBe(100);
    expect(computeBagPercent(10, 0)).toBe(0);
    expect(buildWidgetBagSummary(840, 1500)).toEqual({ count: 840, cap: 1500, percent: 56 });

    const kraken = FISH.find(f => f.id === 'kraken') ?? FISH[0];
    const item = buildWidgetCatchItem({
      eventId: 'evt-1',
      fish: kraken,
      form: 'variant',
      sizeCm: 342,
      priceGold: 2000,
      isBig: true,
      caughtAtMs: 1_795_700_000_000,
    });
    expect(item).toEqual({
      eventId: 'evt-1',
      spriteKey: kraken.id,
      name: kraken.variant.name,
      rarity: kraken.rarity,
      sizeText: '3.42m',
      priceText: '2,000G',
      isBig: true,
      isMutant: true,
      caughtAtMs: 1_795_700_000_000,
      fallbackColors: deriveFishFallbackColors(kraken, true),
    });
  });
});
