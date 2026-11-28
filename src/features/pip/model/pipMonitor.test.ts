import { describe, expect, it } from 'vitest';
import { EVENT_FISH } from '../../../game/content/eventFish';
import { FISH } from '../../../game/content/fish';
import { newState } from '../../../game/rules/logic';
import type { ActionResult } from '../../../game/rules/actions';
import {
  appendPipCatchBuffer,
  buildPipCatchItem,
  computePipLeapFrame,
  computeScaledPipSize,
  formatPipCatchTip,
  formatPipGameClock,
  getPipBagTone,
  initialPipMonitorState,
  nextPipScalePreset,
  normalizePipGameHour,
  parsePipScalePreset,
  PIP_AUTOCLOSE_GRACE_MS,
  PIP_BASE_HEIGHT,
  PIP_BASE_WIDTH,
  PIP_DIORAMA_HEIGHT,
  PIP_JUMP_DURATION_S,
  PIP_JUMP_HEIGHT_PX,
  PIP_RECENT_CATCH_LIMIT,
  pipMonitorReducer,
  resolvePipAvatarLook,
  resolvePipSpotInfo,
  type PipCatchItem,
} from './pipMonitor';

type CatchResult = Extract<ActionResult, { type: 'catch' }>;

function makeCatchResult(overrides: Partial<CatchResult> & { fishId: string }): CatchResult {
  return {
    type: 'catch',
    uid: 'u-1',
    released: [],
    info: {
      form: 'normal',
      size: 24.5,
      percentile: 50,
      isBig: false,
      isNew: false,
    },
    ...overrides,
  };
}

describe('pipMonitor 순수 모델', () => {
  it('일반 어종 포획을 골드 가치·등급명·FishArtSubject 포함 항목으로 조립한다', () => {
    const crucian = FISH[0];
    const item = buildPipCatchItem(
      makeCatchResult({
        fishId: crucian.id,
        uid: 'u-regular-1',
        info: { form: 'variant', size: 32.1, percentile: 95, isBig: true, isNew: true },
      }),
      1_700_000_000_000,
    );

    expect(item).not.toBeNull();
    expect(item!.eventId).toBe('u-regular-1');
    expect(item!.name).toBe(crucian.variant.name);
    expect(item!.rarity).toBe(crucian.rarity);
    expect(item!.rarityLabel).toBe('일반');
    expect(item!.isBig).toBe(true);
    expect(item!.isMutant).toBe(true);
    expect(item!.form).toBe('variant');
    expect(item!.priceText).toMatch(/G$/);
    expect(item!.fishSubject.id).toBe(crucian.id);
    expect(item!.fishSubject.variant.color).toBe(crucian.variant.color);
  });

  it('이벤트 어종 포획은 일반/돌연변이 점수를 N점 형식으로 직렬화하고 점수가 없으면 -를 쓴다', () => {
    const ef = EVENT_FISH[0];
    const normalItem = buildPipCatchItem(
      makeCatchResult({ fishId: ef.id, uid: 'ev-1' }),
      1_700_000_000_100,
    );
    const variantItem = buildPipCatchItem(
      makeCatchResult({
        fishId: ef.id,
        uid: 'ev-2',
        info: { form: 'variant', size: 19.2, percentile: 40, isBig: false, isNew: false },
      }),
      1_700_000_000_200,
    );
    expect(normalItem!.priceText).toBe(`${ef.score.toLocaleString('ko-KR')}점`);
    expect(variantItem!.priceText).toBe(`${ef.variant.score.toLocaleString('ko-KR')}점`);

    const highEf = EVENT_FISH[EVENT_FISH.length - 1];
    const highVariant = buildPipCatchItem(
      makeCatchResult({
        fishId: highEf.id,
        uid: 'ev-3',
        info: { form: 'variant', size: 110.0, percentile: 99, isBig: true, isNew: true },
      }),
      1_700_000_000_300,
    );
    expect(highVariant!.priceText).toBe(`${highEf.variant.score.toLocaleString('ko-KR')}점`);

    const missing = buildPipCatchItem(makeCatchResult({ fishId: 'no-such-fish', uid: 'x' }), 1);
    expect(missing).toBeNull();
  });

  it('점수가 0 이하인 이벤트 포획이 들어와도 formatWidgetCatchValue 규칙에 따라 -를 표시한다', () => {
    const ef = EVENT_FISH[0];
    const origScore = ef.score;
    try {
      (ef as { score: number }).score = 0;
      const zeroItem = buildPipCatchItem(makeCatchResult({ fishId: ef.id, uid: 'ev-zero' }), 10);
      expect(zeroItem!.priceText).toBe('-');

      (ef as { score: number }).score = -5;
      const negItem = buildPipCatchItem(makeCatchResult({ fishId: ef.id, uid: 'ev-neg' }), 11);
      expect(negItem!.priceText).toBe('-');
    } finally {
      (ef as { score: number }).score = origScore;
    }
  });

  it('전체 129종(일반+이벤트) 어종과 일반·돌연변이 폼을 빠짐없이 조립한다', () => {
    const totalSpecies = FISH.length + EVENT_FISH.length;
    expect(totalSpecies).toBe(129);
    for (const f of FISH) {
      for (const form of ['normal', 'variant'] as const) {
        const item = buildPipCatchItem(
          makeCatchResult({
            fishId: f.id,
            uid: `${f.id}-${form}`,
            info: { form, size: 15, percentile: 50, isBig: false, isNew: false },
          }),
          100,
        );
        expect(item, `${f.id}:${form}`).not.toBeNull();
        expect(item!.fishSubject.id).toBe(f.id);
      }
    }
    for (const ef of EVENT_FISH) {
      for (const form of ['normal', 'variant'] as const) {
        const item = buildPipCatchItem(
          makeCatchResult({
            fishId: ef.id,
            uid: `${ef.id}-${form}`,
            info: { form, size: 15, percentile: 50, isBig: false, isNew: false },
          }),
          100,
        );
        expect(item, `${ef.id}:${form}`).not.toBeNull();
        expect(item!.fishSubject.id).toBe(ef.id);
      }
    }
  });

  it('최근 포획 버퍼는 중복 eventId를 무시하고 최대 4건을 유지한다', () => {
    let buf: PipCatchItem[] = [];
    for (let i = 1; i <= 5; i++) {
      const item = buildPipCatchItem(makeCatchResult({ fishId: FISH[0].id, uid: `u-${i}` }), i * 1000)!;
      buf = appendPipCatchBuffer(buf, item);
    }
    expect(buf).toHaveLength(PIP_RECENT_CATCH_LIMIT);
    expect(buf.map(i => i.eventId)).toEqual(['u-5', 'u-4', 'u-3', 'u-2']);

    const dup = appendPipCatchBuffer(buf, buf[1]);
    expect(dup).toBe(buf);
  });

  it('배율 프리셋 순환, 파싱, 목표 창 크기를 명세 수치대로 계산한다', () => {
    expect(PIP_BASE_WIDTH).toBe(420);
    expect(PIP_BASE_HEIGHT).toBe(156);
    expect(PIP_DIORAMA_HEIGHT).toBe(90);
    expect(PIP_AUTOCLOSE_GRACE_MS).toBe(250);
    expect(nextPipScalePreset(85)).toBe(100);
    expect(nextPipScalePreset(100)).toBe(125);
    expect(nextPipScalePreset(125)).toBe(85);

    expect(parsePipScalePreset('85')).toBe(85);
    expect(parsePipScalePreset(125)).toBe(125);
    expect(parsePipScalePreset('999')).toBe(100);
    expect(parsePipScalePreset(null)).toBe(100);

    expect(computeScaledPipSize(85)).toEqual({ width: 357, height: 133, zoom: 0.85 });
    expect(computeScaledPipSize(100)).toEqual({ width: 420, height: 156, zoom: 1 });
    expect(computeScaledPipSize(125)).toEqual({ width: 525, height: 195, zoom: 1.25 });
  });

  it('가방 게이지 톤 임계값(75%, 95%)을 정확히 나눈다', () => {
    expect(getPipBagTone(0)).toBe('gold');
    expect(getPipBagTone(74)).toBe('gold');
    expect(getPipBagTone(75)).toBe('warn');
    expect(getPipBagTone(94)).toBe('warn');
    expect(getPipBagTone(95)).toBe('danger');
    expect(getPipBagTone(100)).toBe('danger');
  });

  it('게임 시각 정규화와 HH:MM 시계 문자열을 계산한다', () => {
    expect(normalizePipGameHour(-2)).toBe(22);
    expect(normalizePipGameHour(26.5)).toBe(2.5);
    expect(normalizePipGameHour(Number.NaN)).toBe(0);
    expect(formatPipGameClock(6.5)).toBe('06:30');
    expect(formatPipGameClock(23.999)).toBe('23:59');
    expect(formatPipGameClock(0)).toBe('00:00');
  });

  it('0.6초 도약 프레임과 정점 통과 후 좌우 반전을 계산한다', () => {
    expect(computePipLeapFrame(-0.1).active).toBe(false);
    expect(computePipLeapFrame(PIP_JUMP_DURATION_S).active).toBe(false);

    const early = computePipLeapFrame(0.15);
    expect(early.active).toBe(true);
    expect(early.flipped).toBe(false);
    expect(early.offsetWorldPx).toBe(Math.round(Math.sin((0.15 / PIP_JUMP_DURATION_S) * Math.PI) * PIP_JUMP_HEIGHT_PX));

    const peak = computePipLeapFrame(PIP_JUMP_DURATION_S / 2);
    expect(peak.offsetWorldPx).toBe(PIP_JUMP_HEIGHT_PX);
    expect(peak.flipped).toBe(false);

    const descend = computePipLeapFrame(0.45);
    expect(descend.active).toBe(true);
    expect(descend.flipped).toBe(true);
  });

  it('play는 도약 지시에 강도를 싣고 append는 도약을 만들지 않는다', () => {
    const item = buildPipCatchItem(makeCatchResult({ fishId: FISH[0].id, uid: 'c-1' }), 100)!;
    let s = pipMonitorReducer(initialPipMonitorState, { type: 'append', item });
    expect(s.leapTrigger).toBeNull();
    s = pipMonitorReducer(s, { type: 'play', item, intensity: 'largest' });
    expect(s.leapTrigger).toEqual({ seq: 1, item, intensity: 'largest' });
    expect(s.recentCatches).toHaveLength(1);
    const next = pipMonitorReducer(s, { type: 'play', item, intensity: 'small' });
    expect(next.leapTrigger).toEqual({ seq: 2, item, intensity: 'small' });
  });

  it('같은 항목을 다시 append해도 상태가 바뀌지 않는다', () => {
    const item = buildPipCatchItem(makeCatchResult({ fishId: FISH[0].id, uid: 'c-1' }), 100)!;
    const once = pipMonitorReducer(initialPipMonitorState, { type: 'append', item });
    expect(pipMonitorReducer(once, { type: 'append', item })).toBe(once);
  });

  it('리듀서가 5번째 포획 시 4번째 항목을 exitingLogItem으로 내보내고 clear_exiting_log로 정리한다', () => {
    let s = initialPipMonitorState;
    for (let i = 1; i <= 4; i++) {
      const item = buildPipCatchItem(makeCatchResult({ fishId: FISH[0].id, uid: `c-${i}` }), i * 100)!;
      s = pipMonitorReducer(s, { type: 'append', item });
      expect(s.exitingLogItem).toBeNull();
    }
    expect(s.recentCatches.map(i => i.eventId)).toEqual(['c-4', 'c-3', 'c-2', 'c-1']);

    const fifth = buildPipCatchItem(makeCatchResult({ fishId: FISH[1].id, uid: 'c-5' }), 500)!;
    s = pipMonitorReducer(s, { type: 'append', item: fifth });
    expect(s.recentCatches.map(i => i.eventId)).toEqual(['c-5', 'c-4', 'c-3', 'c-2']);
    expect(s.exitingLogItem?.eventId).toBe('c-1');
    expect(s.leapTrigger).toBeNull();
    expect(s.catchFxSeq).toBe(5);

    const cleared = pipMonitorReducer(s, { type: 'clear_exiting_log' });
    expect(cleared.exitingLogItem).toBeNull();

    const hydrated = pipMonitorReducer(s, { type: 'hydrate', recentCatches: s.recentCatches });
    expect(hydrated.catchFxSeq).toBe(0);
    expect(hydrated.leapTrigger).toBeNull();
    expect(hydrated.exitingLogItem).toBeNull();
    expect(hydrated.recentCatches).toHaveLength(PIP_RECENT_CATCH_LIMIT);

    const tip = formatPipCatchTip(fifth);
    expect(tip).not.toMatch(/[·—–]/);
  });

  it('아바타 외형 해석은 일반 해역·거점에서는 원 외형을 유지하고 챔피언십에서는 강제 모자를 적용한다', () => {
    const customLook = { shirt: 3, pants: 5, hat: 'cap-red' };
    expect(resolvePipAvatarLook(customLook, { kind: 'region', id: 'world' })).toEqual(customLook);
    expect(resolvePipAvatarLook(customLook, { kind: 'region', id: 'championship' })).toEqual({
      shirt: 3,
      pants: 5,
      hat: 'santa-hat',
    });
    expect(resolvePipAvatarLook(customLook, { kind: 'base', id: 'harbor' })).toEqual(customLook);
  });

  it('해역 정보 해석이 이벤트 구역, 일반 어군, 구역, 거점 폴백을 구분한다', () => {
    const game = newState();

    const champ = resolvePipSpotInfo({
      scene: { kind: 'region', id: 'championship' },
      currentSpot: { spot: null, zone: null },
      game,
    });
    expect(champ).toEqual({
      spotId: 'championship',
      spotName: '강태공 분지 호수',
      seaTheme: 'deep',
      inRegion: true,
    });

    const spotHit = resolvePipSpotInfo({
      scene: { kind: 'region', id: 'world' },
      currentSpot: { spot: 'deep', zone: 'pacific' },
      game,
    });
    expect(spotHit).toEqual({
      spotId: 'deep',
      spotName: '마리아나 해구',
      seaTheme: 'deep',
      inRegion: true,
    });

    const zoneFallback = resolvePipSpotInfo({
      scene: { kind: 'region', id: 'world' },
      currentSpot: { spot: null, zone: 'indian' },
      game,
    });
    expect(zoneFallback.spotName).toBe('인도양');
    expect(zoneFallback.inRegion).toBe(true);

    const base = resolvePipSpotInfo({
      scene: { kind: 'base', id: 'harbor' },
      currentSpot: { spot: null, zone: null },
      game,
    });
    expect(base.spotName).toBe('부산항');
    expect(base.inRegion).toBe(false);
  });
});
