import { describe, expect, it } from 'vitest';
import { FX_RENDERERS, JUDGMENT_MS, createFxMediatorState, fxIntensityOf, mediateFx } from './fxPolicy';
import type { CatchFxKind, CatchFxSubject, FxEnv, FxRequest } from './fxPolicy';
import { DUPLICATE_SUPPRESS_MS, FX_ONLY_RULES, TOAST_POLICY } from './toastPolicy';
import type { FxEventKind, SystemEventKind } from './toastPolicy';

const ALL_KINDS: FxEventKind[] = [
  ...(Object.keys(TOAST_POLICY) as SystemEventKind[]),
  ...(Object.keys(FX_ONLY_RULES) as FxEventKind[]),
];

describe('fxIntensityOf', () => {
  it('사건표의 포획 강도를 직접 행동 여부와 무관하게 돌려준다', () => {
    expect(fxIntensityOf('catch.legendaryOrFirstVariant', true)).toBe('largest');
    expect(fxIntensityOf('catch.legendaryOrFirstVariant', false)).toBe('largest');
    expect(fxIntensityOf('catch.epicOrRecord', true)).toBe('large');
    expect(fxIntensityOf('catch.variant', false)).toBe('large');
    expect(fxIntensityOf('catch.routine', true)).toBe('small');
    expect(fxIntensityOf('catch.routine', false)).toBe('small');
    expect(fxIntensityOf('live.peerCatch', false)).toBe('large');
  });

  it('챔질 판정은 직접 행동일 때만 작게다', () => {
    expect(fxIntensityOf('catch.judgment', true)).toBe('small');
    expect(fxIntensityOf('catch.judgment', false)).toBe('none');
  });

  it('효과 규칙이 없는 사건은 none이다', () => {
    expect(fxIntensityOf('catch.rejected', true)).toBe('none');
    expect(fxIntensityOf('system.criticalError', false)).toBe('none');
  });

  it('모든 사건 종류가 네 강도 중 하나를 돌려준다', () => {
    for (const kind of ALL_KINDS) {
      for (const direct of [true, false]) {
        expect(['none', 'small', 'large', 'largest']).toContain(fxIntensityOf(kind, direct));
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
  it('챔질 판정은 필드 지시 하나가 되고 판정 글자 길이만큼 유지된다', () => {
    const request: FxRequest = { kind: 'catch.judgment', direct: true, at: 500, subject: { region: 'world', judgment: 'perfect' } };
    const r = mediateFx(createFxMediatorState(), request, env({ windowsOpen: true }));
    expect(r.directives).toHaveLength(1);
    expect(r.directives[0]).toMatchObject({ renderer: 'field', intensity: 'small', startAt: 500, endsAt: 500 + JUDGMENT_MS });
    expect(FX_RENDERERS['catch.judgment']).toEqual(['field']);
  });

  it('강도가 none이면 지시가 없다', () => {
    const r = mediateFx(createFxMediatorState(), { ...catchReq('catch.routine', 0), kind: 'catch.rejected' as never }, env());
    expect(r.directives).toEqual([]);
  });

  it('요청 하나가 렌더러별 지시가 되고 순번이 늘어난다', () => {
    const r = mediateFx(createFxMediatorState(), catchReq('catch.epicOrRecord', 100), env());
    expect(r.directives.map(d => d.renderer)).toEqual(['catch-card', 'field', 'pip']);
    expect(r.directives.map(d => d.seq)).toEqual([0, 1, 2]);
    expect(intensities(r)).toEqual({ 'catch-card': 'large', field: 'large', pip: 'large' });
    const byRenderer = Object.fromEntries(r.directives.map(d => [d.renderer, d]));
    expect(byRenderer['catch-card'].endsAt).toBe(10_000);
    expect(byRenderer.pip.endsAt).toBe(10_000);
    expect(byRenderer.field.endsAt).toBe(100 + 900);
    expect(byRenderer.field.startAt).toBe(100);
    expect(r.state.nextSeq).toBe(3);
  });

  it('차단 창이 떠 있으면 필드만 작게로 낮추고 카드와 PiP는 그대로 둔다', () => {
    const r = mediateFx(createFxMediatorState(), catchReq('catch.legendaryOrFirstVariant', 0), env({ windowsOpen: true }));
    expect(intensities(r)).toEqual({ 'catch-card': 'largest', field: 'small', pip: 'largest' });
  });

  it('가장 크게 점유 중에 같은 화면의 가장 크게가 오면 크게로 낮추고 화면이 다르면 독립이다', () => {
    const first = mediateFx(createFxMediatorState(), catchReq('catch.legendaryOrFirstVariant', 0), env());
    expect(intensities(first)).toEqual({ 'catch-card': 'largest', field: 'largest', pip: 'largest' });
    const second = mediateFx(first.state, catchReq('catch.legendaryOrFirstVariant', 5000, { holdEndsAt: 20_000 }), env());
    expect(intensities(second)).toEqual({ 'catch-card': 'large', field: 'large', pip: 'large' });
  });

  it('한 요청의 카드와 필드는 같은 점유를 공유한다', () => {
    const r = mediateFx(createFxMediatorState(), catchReq('catch.legendaryOrFirstVariant', 0), env());
    expect(r.state.largestUntil).toEqual({ main: 10_000, pip: 10_000 });
  });

  it('차단 창이 떠 있어도 카드의 가장 크게는 화면을 점유한다', () => {
    const blocked = mediateFx(createFxMediatorState(), catchReq('catch.legendaryOrFirstVariant', 0), env({ windowsOpen: true }));
    expect(blocked.state.largestUntil).toEqual({ main: 10_000, pip: 10_000 });
    const next = mediateFx(blocked.state, catchReq('catch.legendaryOrFirstVariant', 100), env());
    expect(intensities(next)['catch-card']).toBe('large');
  });

  it('점유가 끝난 뒤의 가장 크게는 다시 가장 크게다', () => {
    const first = mediateFx(createFxMediatorState(), catchReq('catch.legendaryOrFirstVariant', 0), env());
    const later = mediateFx(first.state, catchReq('catch.legendaryOrFirstVariant', 10_000, { holdEndsAt: 30_000 }), env());
    expect(intensities(later)['catch-card']).toBe('largest');
  });

  it('같은 종류의 크게가 중복 억제 시간 안에 겹치면 두 번째부터 작게로 낮춘다', () => {
    const first = mediateFx(createFxMediatorState(), catchReq('catch.variant', 1000), env());
    expect(intensities(first).field).toBe('large');
    const second = mediateFx(first.state, catchReq('catch.variant', 1000 + DUPLICATE_SUPPRESS_MS - 1), env());
    expect(intensities(second)).toEqual({ 'catch-card': 'small', field: 'small', pip: 'small' });
    const third = mediateFx(second.state, catchReq('catch.variant', 1000 + DUPLICATE_SUPPRESS_MS), env());
    expect(intensities(third).field).toBe('large');
  });

  it('낮아진 크게는 억제 시간을 늘리지 않고 다른 종류는 서로 묶지 않는다', () => {
    const first = mediateFx(createFxMediatorState(), catchReq('catch.variant', 0), env());
    const dup = mediateFx(first.state, catchReq('catch.variant', 1500), env());
    const after = mediateFx(dup.state, catchReq('catch.variant', 2000), env());
    expect(intensities(after).field).toBe('large');
    const other = mediateFx(first.state, catchReq('catch.epicOrRecord', 100), env());
    expect(intensities(other).field).toBe('large');
  });

  it('작게는 겹쳐도 낮추지 않는다', () => {
    const first = mediateFx(createFxMediatorState(), catchReq('catch.routine', 0), env());
    const second = mediateFx(first.state, catchReq('catch.routine', 10), env());
    expect(intensities(second).field).toBe('small');
  });

  it('동작 축소 판정을 지시에 싣고 강도는 바꾸지 않는다', () => {
    const r = mediateFx(createFxMediatorState(), catchReq('catch.epicOrRecord', 0), env({ reducedMotion: true }));
    expect(r.directives.every(d => d.reducedMotion)).toBe(true);
    expect(intensities(r).field).toBe('large');
  });

  it('다른 플레이어 포획은 필드 지시 하나이고 차단 창이면 작게가 된다', () => {
    const req: FxRequest = { kind: 'live.peerCatch', direct: false, at: 50, subject: { region: 'world', fishId: 'carp', from: { x: 1, y: 1 } } };
    const r = mediateFx(createFxMediatorState(), req, env());
    expect(r.directives.map(d => [d.renderer, d.intensity, d.endsAt])).toEqual([['field', 'large', 950]]);
    const blocked = mediateFx(createFxMediatorState(), req, env({ windowsOpen: true }));
    expect(intensities(blocked)).toEqual({ field: 'small' });
  });

  it('입력 상태를 바꾸지 않는다', () => {
    const state = createFxMediatorState();
    mediateFx(state, catchReq('catch.variant', 0), env());
    expect(state).toEqual(createFxMediatorState());
  });
});
