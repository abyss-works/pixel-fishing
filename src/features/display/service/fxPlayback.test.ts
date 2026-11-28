import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  activeFieldDirectives, bindFxEnvironment, clearFx, fieldFxFrame, getFxDirective, requestFx, resetFxPlayback, subscribeFx,
} from './fxPlayback';
import { JUDGMENT_MS } from '../model/fxPolicy';
import type { CatchFxKind, FxRequest, PeerCatchFxSubject } from '../model/fxPolicy';

const catchReq = (kind: CatchFxKind, at: number, over: { holdEndsAt?: number; region?: 'village' | 'world' } = {}): FxRequest => ({
  kind, direct: true, at,
  subject: {
    eventId: 'e', region: over.region ?? 'village', fishId: 'carp', rarity: 'common', form: 'normal', isNew: false,
    from: { x: 1, y: 2 }, to: { x: 3, y: 4 }, holdEndsAt: over.holdEndsAt ?? at + 1500,
  },
});
const peerReq = (at: number, over: Partial<PeerCatchFxSubject> = {}): FxRequest => ({
  kind: 'live.peerCatch', direct: false, at,
  subject: { region: 'world', fishId: 'carp', from: { x: 1, y: 1 }, ...over },
});

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(1_000_000); resetFxPlayback(); });
afterEach(() => { vi.useRealTimers(); resetFxPlayback(); });

describe('requestFx', () => {
  it('포획 요청이 카드와 PiP 지시를 남기고 구독자를 깨운다', () => {
    const listener = vi.fn();
    subscribeFx(listener);
    requestFx(catchReq('catch.epicOrRecord', Date.now()));
    expect(getFxDirective('catch-card')?.intensity).toBe('large');
    expect(getFxDirective('pip')?.intensity).toBe('large');
    expect(listener).toHaveBeenCalled();
  });

  it('지시가 만료되면 null이다', () => {
    requestFx(catchReq('catch.routine', Date.now(), { holdEndsAt: Date.now() + 1500 }));
    expect(getFxDirective('catch-card')).not.toBeNull();
    vi.setSystemTime(1_000_000 + 1500);
    expect(getFxDirective('catch-card')).toBeNull();
  });

  it('필드 지시만 생기는 요청은 구독자를 깨우지 않는다', () => {
    const listener = vi.fn();
    subscribeFx(listener);
    requestFx(peerReq(Date.now()));
    expect(listener).not.toHaveBeenCalled();
    expect(activeFieldDirectives('world', Date.now())).toHaveLength(1);
  });

  it('구독을 해제하면 더 깨우지 않는다', () => {
    const listener = vi.fn();
    subscribeFx(listener)();
    requestFx(catchReq('catch.routine', Date.now()));
    expect(listener).not.toHaveBeenCalled();
  });

  it('차단 창 판정을 묶으면 필드 강도만 작게로 낮아지고 카드는 그대로이며 해제하면 창 없음으로 본다', () => {
    const unbind = bindFxEnvironment({ windowsOpen: () => true });
    requestFx(catchReq('catch.epicOrRecord', Date.now(), { region: 'world' }));
    expect(getFxDirective('catch-card')?.intensity).toBe('large');
    expect(fieldFxFrame('world', Date.now()).localJumps[0].intensity).toBe('small');
    expect(getFxDirective('pip')?.intensity).toBe('large');
    unbind();
    vi.setSystemTime(1_000_000 + 10_000);
    requestFx(catchReq('catch.epicOrRecord', Date.now(), { region: 'world' }));
    expect(fieldFxFrame('world', Date.now()).localJumps.at(-1)?.intensity).toBe('large');
  });

  it('새 요청이 같은 렌더러의 이전 지시를 대체하고 순번이 늘어난다', () => {
    requestFx(catchReq('catch.routine', Date.now()));
    const first = getFxDirective('catch-card');
    requestFx(catchReq('catch.epicOrRecord', Date.now()));
    expect(getFxDirective('catch-card')!.seq).toBeGreaterThan(first!.seq);
  });
});

describe('필드 지시', () => {
  it('지역으로 거르고 만료된 지시를 정리한다', () => {
    requestFx(catchReq('catch.routine', Date.now(), { region: 'village' }));
    requestFx(peerReq(Date.now(), { region: 'world' }));
    expect(activeFieldDirectives('village', Date.now()).map(d => d.request.kind)).toEqual(['catch.routine']);
    expect(activeFieldDirectives('world', Date.now()).map(d => d.request.kind)).toEqual(['live.peerCatch']);
    vi.setSystemTime(1_000_000 + 900);
    expect(activeFieldDirectives('village', Date.now())).toEqual([]);
    expect(activeFieldDirectives('world', Date.now())).toEqual([]);
  });

  it('다른 플레이어 지시는 12건까지만 남기고 오래된 것부터 버린다', () => {
    for (let i = 0; i < 15; i++) requestFx(peerReq(Date.now(), { fishId: `f${i}`, from: { x: i, y: 0 } }));
    const peers = activeFieldDirectives('world', Date.now());
    expect(peers).toHaveLength(12);
    expect((peers[0].request.subject as PeerCatchFxSubject).fishId).toBe('f3');
  });

  it('clearFx는 그 종류의 지시만 비운다', () => {
    requestFx(peerReq(Date.now()));
    requestFx(catchReq('catch.routine', Date.now(), { region: 'world' }));
    clearFx('live.peerCatch');
    expect(activeFieldDirectives('world', Date.now()).map(d => d.request.kind)).toEqual(['catch.routine']);
  });

  it('resetFxPlayback이 지시와 중재 상태를 모두 비운다', () => {
    requestFx(catchReq('catch.legendaryOrFirstVariant', Date.now(), { holdEndsAt: Date.now() + 5000 }));
    resetFxPlayback();
    expect(getFxDirective('catch-card')).toBeNull();
    expect(activeFieldDirectives('village', Date.now())).toEqual([]);
    requestFx(catchReq('catch.legendaryOrFirstVariant', Date.now()));
    expect(getFxDirective('catch-card')?.intensity).toBe('largest');
  });
});

describe('fieldFxFrame', () => {
  it('내 포획과 다른 플레이어 포획을 점프로 바꾸고 경과 초와 강도를 싣는다', () => {
    requestFx(catchReq('catch.epicOrRecord', Date.now(), { region: 'world' }));
    requestFx(peerReq(Date.now(), { form: 'variant', to: { x: 9, y: 9 } }));
    requestFx(peerReq(Date.now(), { fishId: 'no-target' }));
    const frame = fieldFxFrame('world', Date.now() + 300);
    expect(frame.reducedMotion).toBe(false);
    expect(frame.localJumps).toEqual([
      { x: 1, y: 2, toX: 3, toY: 4, fishId: 'carp', form: 'normal', t: 0.3, intensity: 'large', reducedMotion: false },
    ]);
    expect(frame.peerJumps).toEqual([
      { x: 1, y: 1, toX: 9, toY: 9, fishId: 'carp', form: 'variant', t: 0.3, intensity: 'large', reducedMotion: false },
      // 같은 종류 크게가 겹치면 두 번째부터 작게다
      { x: 1, y: 1, fishId: 'no-target', t: 0.3, intensity: 'small', reducedMotion: false },
    ]);
  });

  it('다른 지역과 만료된 점프는 담지 않는다', () => {
    requestFx(catchReq('catch.routine', Date.now(), { region: 'village' }));
    expect(fieldFxFrame('world', Date.now()).localJumps).toEqual([]);
    expect(fieldFxFrame('village', Date.now() + 900).localJumps).toEqual([]);
  });

  it('동작 축소가 켜져 있으면 프레임과 각 점프가 그 값을 싣는다', () => {
    vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) });
    try {
      requestFx(catchReq('catch.routine', Date.now(), { region: 'world' }));
      requestFx(peerReq(Date.now()));
      const frame = fieldFxFrame('world', Date.now());
      expect(frame.reducedMotion).toBe(true);
      expect(frame.localJumps[0].reducedMotion).toBe(true);
      expect(frame.peerJumps[0].reducedMotion).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('챔질 판정은 점프가 아니라 판정 글자로 프레임에 실린다', () => {
    requestFx({ kind: 'catch.judgment', direct: true, at: Date.now(), subject: { region: 'world', judgment: 'good' } });
    const frame = fieldFxFrame('world', Date.now() + 200);
    expect(frame.judgment).toEqual({ grade: 'good', t: 0.2 });
    expect(frame.localJumps).toEqual([]);
    expect(frame.peerJumps).toEqual([]);
    expect(fieldFxFrame('village', Date.now()).judgment).toBeNull();
    expect(fieldFxFrame('world', Date.now() + JUDGMENT_MS).judgment).toBeNull();
  });

  it('필드가 작게로 낮춘 요청은 작게 강도 점프가 된다', () => {
    const unbind = bindFxEnvironment({ windowsOpen: () => true });
    requestFx(catchReq('catch.legendaryOrFirstVariant', Date.now(), { region: 'world' }));
    expect(fieldFxFrame('world', Date.now()).localJumps[0].intensity).toBe('small');
    unbind();
  });
});
