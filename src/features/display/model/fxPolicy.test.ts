import { describe, expect, it } from 'vitest';
import { FX_RENDERERS, createFxMediatorState, fxIntensityOf, mediateFx } from './fxPolicy';
import type { CatchFxKind, CatchFxSubject, FxEnv, FxRequest } from './fxPolicy';
import { DUPLICATE_SUPPRESS_MS, FX_ONLY_RULES, TOAST_POLICY } from './toastPolicy';
import type { FxEventKind, SystemEventKind } from './toastPolicy';

const ALL_KINDS: FxEventKind[] = [
  ...(Object.keys(TOAST_POLICY) as SystemEventKind[]),
  ...(Object.keys(FX_ONLY_RULES) as FxEventKind[]),
];

describe('fxIntensityOf', () => {
  it('사건표의 포획 강도를 직접 행동 여부와 무관하게 돌려준다', () => {
    expect(fxIntensityOf('catch.legendaryOrFirstVariant', true)).toBe('spectacle');
    expect(fxIntensityOf('catch.legendaryOrFirstVariant', false)).toBe('spectacle');
    expect(fxIntensityOf('catch.epicOrRecord', true)).toBe('emphasis');
    expect(fxIntensityOf('catch.variant', false)).toBe('emphasis');
    expect(fxIntensityOf('catch.routine', true)).toBe('confirm');
    expect(fxIntensityOf('catch.routine', false)).toBe('confirm');
    expect(fxIntensityOf('live.peerCatch', false)).toBe('emphasis');
  });

  it('효과 규칙이 없는 사건은 none이다', () => {
    expect(fxIntensityOf('catch.rejected', true)).toBe('none');
    expect(fxIntensityOf('system.criticalError', false)).toBe('none');
  });

  it('모든 사건 종류가 네 강도 중 하나를 돌려준다', () => {
    for (const kind of ALL_KINDS) {
      for (const direct of [true, false]) {
        expect(['none', 'confirm', 'emphasis', 'spectacle']).toContain(fxIntensityOf(kind, direct));
      }
    }
  });
});

describe('FX_RENDERERS', () => {
  it('효과 규칙이 있는 사건 종류 집합과 렌더러 배정 키 집합이 같다', () => {
    const withRule = ALL_KINDS.filter(k => fxIntensityOf(k, true) !== 'none' || fxIntensityOf(k, false) !== 'none');
    expect(Object.keys(FX_RENDERERS).sort()).toEqual([...withRule].sort());
  });

  it('포획 넷은 카드, 필드, PiP이고 다른 플레이어 포획은 필드뿐이다', () => {
    expect(FX_RENDERERS['catch.routine']).toEqual(['catch-card', 'field', 'pip']);
    expect(FX_RENDERERS['live.peerCatch']).toEqual(['field']);
  });
});

const subject = (over: Partial<CatchFxSubject> = {}): CatchFxSubject => ({
  eventId: 'e1', region: 'village', fishId: 'carp', rarity: 'common', form: 'normal', isNew: false,
  from: { x: 1, y: 2 }, to: { x: 3, y: 4 }, holdEndsAt: 10_000, ...over,
});
const catchReq = (kind: CatchFxKind, at: number, over: Partial<CatchFxSubject> = {}, direct = true): FxRequest => ({
  kind, direct, at, subject: subject(over),
});
const env = (over: Partial<FxEnv> = {}): FxEnv => ({ windowsOpen: false, reducedMotion: false, jumpMs: 900, ...over });
const intensities = (r: { directives: { renderer: string; intensity: string }[] }) =>
  Object.fromEntries(r.directives.map(d => [d.renderer, d.intensity]));

describe('mediateFx', () => {
  it('강도가 none이면 지시가 없다', () => {
    const r = mediateFx(createFxMediatorState(), { ...catchReq('catch.routine', 0), kind: 'catch.rejected' as never }, env());
    expect(r.directives).toEqual([]);
  });

  it('요청 하나가 렌더러별 지시가 되고 순번이 늘어난다', () => {
    const r = mediateFx(createFxMediatorState(), catchReq('catch.epicOrRecord', 100), env());
    expect(r.directives.map(d => d.renderer)).toEqual(['catch-card', 'field', 'pip']);
    expect(r.directives.map(d => d.seq)).toEqual([0, 1, 2]);
    expect(intensities(r)).toEqual({ 'catch-card': 'emphasis', field: 'emphasis', pip: 'emphasis' });
    const byRenderer = Object.fromEntries(r.directives.map(d => [d.renderer, d]));
    expect(byRenderer['catch-card'].endsAt).toBe(10_000);
    expect(byRenderer.pip.endsAt).toBe(10_000);
    expect(byRenderer.field.endsAt).toBe(100 + 900);
    expect(byRenderer.field.startAt).toBe(100);
    expect(r.state.nextSeq).toBe(3);
  });

  it('차단 창이 떠 있으면 필드만 확인으로 낮추고 카드와 PiP는 그대로 둔다', () => {
    const r = mediateFx(createFxMediatorState(), catchReq('catch.legendaryOrFirstVariant', 0), env({ windowsOpen: true }));
    expect(intensities(r)).toEqual({ 'catch-card': 'spectacle', field: 'confirm', pip: 'spectacle' });
  });

  it('연출 중에 같은 화면의 연출이 오면 강조로 낮추고 화면이 다르면 독립이다', () => {
    const first = mediateFx(createFxMediatorState(), catchReq('catch.legendaryOrFirstVariant', 0), env());
    expect(intensities(first)).toEqual({ 'catch-card': 'spectacle', field: 'spectacle', pip: 'spectacle' });
    const second = mediateFx(first.state, catchReq('catch.legendaryOrFirstVariant', 5000, { holdEndsAt: 20_000 }), env());
    expect(intensities(second)).toEqual({ 'catch-card': 'emphasis', field: 'emphasis', pip: 'emphasis' });
  });

  it('한 요청의 카드와 필드는 같은 점유를 공유한다', () => {
    const r = mediateFx(createFxMediatorState(), catchReq('catch.legendaryOrFirstVariant', 0), env());
    expect(r.state.spectacleUntil).toEqual({ main: 10_000, pip: 10_000 });
  });

  it('차단 창이 떠 있어도 카드의 연출은 화면을 점유한다', () => {
    const blocked = mediateFx(createFxMediatorState(), catchReq('catch.legendaryOrFirstVariant', 0), env({ windowsOpen: true }));
    expect(blocked.state.spectacleUntil).toEqual({ main: 10_000, pip: 10_000 });
    const next = mediateFx(blocked.state, catchReq('catch.legendaryOrFirstVariant', 100), env());
    expect(intensities(next)['catch-card']).toBe('emphasis');
  });

  it('점유가 끝난 뒤의 연출은 다시 연출이다', () => {
    const first = mediateFx(createFxMediatorState(), catchReq('catch.legendaryOrFirstVariant', 0), env());
    const later = mediateFx(first.state, catchReq('catch.legendaryOrFirstVariant', 10_000, { holdEndsAt: 30_000 }), env());
    expect(intensities(later)['catch-card']).toBe('spectacle');
  });

  it('같은 종류의 강조가 중복 억제 시간 안에 겹치면 두 번째부터 확인으로 낮춘다', () => {
    const first = mediateFx(createFxMediatorState(), catchReq('catch.variant', 1000), env());
    expect(intensities(first).field).toBe('emphasis');
    const second = mediateFx(first.state, catchReq('catch.variant', 1000 + DUPLICATE_SUPPRESS_MS - 1), env());
    expect(intensities(second)).toEqual({ 'catch-card': 'confirm', field: 'confirm', pip: 'confirm' });
    const third = mediateFx(second.state, catchReq('catch.variant', 1000 + DUPLICATE_SUPPRESS_MS), env());
    expect(intensities(third).field).toBe('emphasis');
  });

  it('낮아진 강조는 억제 시간을 늘리지 않고 다른 종류는 서로 묶지 않는다', () => {
    const first = mediateFx(createFxMediatorState(), catchReq('catch.variant', 0), env());
    const dup = mediateFx(first.state, catchReq('catch.variant', 1500), env());
    const after = mediateFx(dup.state, catchReq('catch.variant', 2000), env());
    expect(intensities(after).field).toBe('emphasis');
    const other = mediateFx(first.state, catchReq('catch.epicOrRecord', 100), env());
    expect(intensities(other).field).toBe('emphasis');
  });

  it('확인 강도는 겹쳐도 낮추지 않는다', () => {
    const first = mediateFx(createFxMediatorState(), catchReq('catch.routine', 0), env());
    const second = mediateFx(first.state, catchReq('catch.routine', 10), env());
    expect(intensities(second).field).toBe('confirm');
  });

  it('동작 축소 판정을 지시에 싣고 강도는 바꾸지 않는다', () => {
    const r = mediateFx(createFxMediatorState(), catchReq('catch.epicOrRecord', 0), env({ reducedMotion: true }));
    expect(r.directives.every(d => d.reducedMotion)).toBe(true);
    expect(intensities(r).field).toBe('emphasis');
  });

  it('다른 플레이어 포획은 필드 지시 하나이고 차단 창이면 확인이 된다', () => {
    const req: FxRequest = { kind: 'live.peerCatch', direct: false, at: 50, subject: { region: 'world', fishId: 'carp', from: { x: 1, y: 1 } } };
    const r = mediateFx(createFxMediatorState(), req, env());
    expect(r.directives.map(d => [d.renderer, d.intensity, d.endsAt])).toEqual([['field', 'emphasis', 950]]);
    const blocked = mediateFx(createFxMediatorState(), req, env({ windowsOpen: true }));
    expect(intensities(blocked)).toEqual({ field: 'confirm' });
  });

  it('입력 상태를 바꾸지 않는다', () => {
    const state = createFxMediatorState();
    mediateFx(state, catchReq('catch.variant', 0), env());
    expect(state).toEqual(createFxMediatorState());
  });
});
