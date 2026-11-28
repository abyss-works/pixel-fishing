import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError, fail } from '../../../core/errors';
import { newState } from '../../../game/rules/logic';
import { FISH } from '../../../game/content/fish';
import { CHAMPIONSHIP_SCHOOLS, V_SCHOOLS } from '../../../game/world';
import type { RegionId } from '../../../game/world';
import { setSchoolDay } from '../../../features/gameplay/service/schoolDay';
import * as soundEvents from '../../../features/sound/service/soundEvents';
import { getFxDirective, resetFxPlayback } from '../../../features/display/service/fxPlayback';
import * as liveService from '../../../features/live/service/useLive';
import { resetKeyScopes } from '../../ui/hotkeys';

const layout = vi.hoisted(() => ({ mobile: false }));
vi.mock('../useMobileLayout', () => ({ useMobileLayout: () => layout.mobile }));

import Field from './Field';

const POND_SHORE = { x: 214, y: 92 };
const SCHOOL_DAY = '2026-10-18';

beforeEach(() => {
  resetFxPlayback();
  setSchoolDay(SCHOOL_DAY);
  resetKeyScopes();
  vi.useFakeTimers();
  vi.spyOn(Math, 'random').mockReturnValue(0);
});

afterEach(() => {
  cleanup();
  layout.mobile = false;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('Field 낚시 상태 띠 슬롯 포털', () => {
  it.each([false, true])('PC와 모바일(mobile=%s) 모두 낚시 상태 띠를 공용 statusSlot으로만 공급하고 idle에서는 비워 둔다', mobile => {
    layout.mobile = mobile;
    const slot = document.createElement('div');
    document.body.appendChild(slot);
    try {
      const { container } = render(
        <Field region="village" game={newState()} dispatch={() => ({ status: 'ok', result: {} as never, state: newState() })}
               setToast={() => {}} onScene={() => {}} initialPos={POND_SHORE} statusSlot={slot} />,
      );
      expect(slot.childElementCount).toBe(0);

      fireEvent.keyDown(document, { code: 'Space' });
      expect(slot.childElementCount).toBe(1);
      expect(slot.textContent).toContain('입질을 기다리는 중');
      expect(slot.firstElementChild!.className).toContain('z-(--z-stage-status)');
      expect(slot.firstElementChild!.className).not.toContain('z-(--z-stage-hud)');
      // 게임 프레임 내부에 상태 띠를 중복 배치하지 않는다
      expect(container.textContent).not.toContain('입질을 기다리는 중');

      act(() => { vi.advanceTimersByTime(4000); });
      expect(slot.childElementCount).toBe(1);
      expect(slot.textContent).toContain('지금 눌러 주세요');
    } finally {
      slot.remove();
    }
  });

  it.each([false, true])('PC와 모바일(mobile=%s) 모두 획득 순간에는 상태 띠를 비우고 catchSlot으로만 CatchCard를 공급한다', mobile => {
    layout.mobile = mobile;
    const statusSlot = document.createElement('div');
    const catchSlot = document.createElement('div');
    document.body.append(statusSlot, catchSlot);
    const fish = FISH[0];
    try {
      const { container } = render(
        <Field region="village" game={newState()}
               dispatch={() => ({
                 status: 'ok',
                 state: newState(),
                 result: {
                   type: 'catch',
                   fishId: fish.id,
                   uid: 'f1',
                   info: { form: 'normal', size: 30, percentile: 50, isBig: false, isNew: false },
                   released: [],
                 },
               })}
               setToast={() => {}} onScene={() => {}} initialPos={POND_SHORE}
               statusSlot={statusSlot} catchSlot={catchSlot} />,
      );
      fireEvent.keyDown(document, { code: 'Space' });
      act(() => { vi.advanceTimersByTime(4000); });
      fireEvent.keyDown(document, { code: 'Space' });

      expect(statusSlot.childElementCount).toBe(0);
      expect(catchSlot.childElementCount).toBe(1);
      expect(catchSlot.querySelector('[data-rarity]')).not.toBeNull();
      expect(container.querySelector('[data-rarity]')).toBeNull();
    } finally {
      statusSlot.remove();
      catchSlot.remove();
    }
  });
});

describe('Field 포획 효과 요청', () => {
  const catchOf = (fishId: string, info: Record<string, unknown>) => ({
    status: 'ok' as const,
    state: newState(),
    result: { type: 'catch' as const, fishId, uid: 'fx-1', info: { form: 'normal', size: 30, percentile: 50, isBig: false, isNew: false, ...info }, released: [] },
  });
  const catchOnce = (fishId: string, info: Record<string, unknown>, catchSlot: HTMLElement) => {
    const utils = render(
      <Field region="village" game={newState()} dispatch={() => catchOf(fishId, info) as never}
             setToast={() => {}} onScene={() => {}} initialPos={POND_SHORE} catchSlot={catchSlot} />,
    );
    fireEvent.keyDown(document, { code: 'Space' });
    act(() => { vi.advanceTimersByTime(4000); });
    fireEvent.keyDown(document, { code: 'Space' });
    return utils;
  };

  it('포획 사건이 분류 종류와 강도로 효과를 요청하고 홀드 종료까지 지시가 유효하다', () => {
    const catchSlot = document.createElement('div');
    document.body.appendChild(catchSlot);
    try {
      catchOnce(FISH[0].id, {}, catchSlot);
      const directive = getFxDirective('catch-card');
      expect(directive?.intensity).toBe('small');
      expect(directive?.request.kind).toBe('catch.routine');
      expect(directive?.request.subject).toMatchObject({ eventId: 'fx-1', region: 'village', fishId: FISH[0].id });
      expect(directive!.endsAt).toBeGreaterThan(Date.now());
    } finally {
      catchSlot.remove();
    }
  });

  it('영웅 포획은 첫 렌더부터 크게 레이어(모서리 발광)를 그린다', () => {
    const catchSlot = document.createElement('div');
    document.body.appendChild(catchSlot);
    const epic = FISH.find(f => f.rarity === 'epic')!;
    try {
      catchOnce(epic.id, {}, catchSlot);
      expect(getFxDirective('catch-card')?.intensity).toBe('large');
      expect(catchSlot.querySelector('[data-catch-corner]')).not.toBeNull();
    } finally {
      catchSlot.remove();
    }
  });

  it('일반 포획은 등장 움직임만 남기고 모서리 발광을 그리지 않는다', () => {
    const catchSlot = document.createElement('div');
    document.body.appendChild(catchSlot);
    try {
      catchOnce(FISH[0].id, {}, catchSlot);
      expect(catchSlot.querySelector('[data-catch-corner]')).toBeNull();
    } finally {
      catchSlot.remove();
    }
  });
});

describe('Field 일시적 429(rate-limited) 낚시 세션 유지', () => {
  it('진행 중인 낚시(wait·bite)에서 일시적 rate-limited 실패가 발생해도 낚시 세션을 강제 중단하지 않는다', () => {
    const slot = document.createElement('div');
    document.body.appendChild(slot);
    try {
      const { container } = render(
        <Field region="village" game={newState()}
               dispatch={() => ({ status: 'ok', result: {} as never, state: newState() })}
               setToast={() => {}} onScene={() => {}} initialPos={POND_SHORE} statusSlot={slot} />,
      );
      fireEvent.keyDown(document, { code: 'Space' });
      expect(container.querySelector('[data-phase="wait"]')).not.toBeNull();

      act(() => { fail(new AppError('rate-limited', 'too-fast')); });
      expect(container.querySelector('[data-phase="wait"]')).not.toBeNull();

      act(() => { vi.advanceTimersByTime(4000); });
      expect(container.querySelector('[data-phase="bite"]')).not.toBeNull();

      act(() => { fail(new AppError('rate-limited', 'too-fast', { action: 'sendLetter' })); });
      expect(container.querySelector('[data-phase="bite"]')).not.toBeNull();

      // 네트워크 등 다른 오류는 기존처럼 낚시를 중단한다
      act(() => { fail(new AppError('network', 'offline')); });
      expect(container.querySelector('[data-phase]')).toBeNull();
    } finally {
      slot.remove();
    }
  });

  it('catch 요청이 rate-limited로 실패해도 낚시 세션을 idle로 끊거나 catch에 멈추지 않고 대기 상태로 복구한다', () => {
    const slot = document.createElement('div');
    document.body.appendChild(slot);
    try {
      const { container } = render(
        <Field region="village" game={newState()}
               dispatch={() => new Promise(() => {}) as never}
               setToast={() => {}} onScene={() => {}} initialPos={POND_SHORE} statusSlot={slot} />,
      );
      fireEvent.keyDown(document, { code: 'Space' });
      act(() => { vi.advanceTimersByTime(4000); });
      fireEvent.keyDown(document, { code: 'Space' });
      expect(container.querySelector('[data-phase="catch"]')).not.toBeNull();

      act(() => { fail(new AppError('rate-limited', 'too-fast', { action: 'catch' })); });
      expect(container.querySelector('[data-phase="wait"]')).not.toBeNull();
    } finally {
      slot.remove();
    }
  });

  it('catch 대기 중 action이 지정되지 않은(undefined) rate-limited 오류는 wait로 되돌리지 않는다', () => {
    const slot = document.createElement('div');
    document.body.appendChild(slot);
    try {
      const { container } = render(
        <Field region="village" game={newState()}
               dispatch={() => new Promise(() => {}) as never}
               setToast={() => {}} onScene={() => {}} initialPos={POND_SHORE} statusSlot={slot} />,
      );
      fireEvent.keyDown(document, { code: 'Space' });
      act(() => { vi.advanceTimersByTime(4000); });
      fireEvent.keyDown(document, { code: 'Space' });
      expect(container.querySelector('[data-phase="catch"]')).not.toBeNull();

      act(() => { fail(new AppError('rate-limited', 'too-fast')); });
      expect(container.querySelector('[data-phase="catch"]')).not.toBeNull();
      expect(container.querySelector('[data-phase="wait"]')).toBeNull();
    } finally {
      slot.remove();
    }
  });
});

describe('Field 이벤트 구역 호환과 낚시 효과음 전달', () => {
  it('region의 shortName을 캔버스 aria-label로 쓰고 championship 어종 획득 카드를 오류 없이 그린다', () => {
    const catchSlot = document.createElement('div');
    document.body.appendChild(catchSlot);
    const school = CHAMPIONSHIP_SCHOOLS[0];
    try {
      const { getByLabelText } = render(
        <Field
          region="championship"
          game={{ ...newState(), location: { kind: 'region', id: 'championship' } }}
          dispatch={() => ({
            status: 'ok',
            state: newState(),
            result: {
              type: 'catch',
              fishId: 'event-glaaki',
              uid: 'ev-1',
              info: { form: 'normal', size: 120, percentile: 50, isBig: false, isNew: true },
              released: [],
            },
          })}
          setToast={() => {}}
          onScene={() => {}}
          initialPos={{ x: school.x, y: school.y }}
          catchSlot={catchSlot}
        />,
      );
      expect(getByLabelText('분지 호수')).toBeInTheDocument();
      fireEvent.keyDown(document, { code: 'Space' });
      act(() => { vi.advanceTimersByTime(4500); });
      fireEvent.keyDown(document, { code: 'Space' });
      expect(catchSlot.textContent).toContain('글라키');
    } finally {
      catchSlot.remove();
    }
  });

  it('수동 낚시 효과음(cast·bite·hit·catch)과 방치 전환 후 무음 규칙을 soundEvents로 전달한다', () => {
    const castSpy = vi.spyOn(soundEvents, 'emitCastSound').mockReturnValue(true);
    const biteSpy = vi.spyOn(soundEvents, 'emitBiteSound').mockReturnValue(true);
    const hitSpy = vi.spyOn(soundEvents, 'emitHitSound').mockReturnValue(true);
    const catchSpy = vi.spyOn(soundEvents, 'emitCatchSound').mockReturnValue(true);
    const fish = FISH[0];

    render(
      <Field
        region="village"
        game={newState()}
        dispatch={() => ({
          status: 'ok',
          state: newState(),
          result: {
            type: 'catch',
            fishId: fish.id,
            uid: 'f1',
            info: { form: 'normal', size: 30, percentile: 50, isBig: false, isNew: false },
            released: [],
          },
        })}
        setToast={() => {}}
        onScene={() => {}}
        initialPos={POND_SHORE}
      />,
    );

    fireEvent.keyDown(document, { code: 'Space' });
    expect(castSpy).toHaveBeenCalledWith(true);

    act(() => { vi.advanceTimersByTime(4000); });
    expect(biteSpy).toHaveBeenCalledWith(true);

    fireEvent.keyDown(document, { code: 'Space' });
    expect(hitSpy).toHaveBeenCalledTimes(1);
    expect(catchSpy).toHaveBeenCalledWith(expect.objectContaining({ manual: true, rarity: fish.rarity, isMutation: false }));

    // 다음 획득 대기 후 입질 타임아웃(auto) 시 다음 cycle의 bite·catch는 manual=false로 전달된다
    act(() => { vi.advanceTimersByTime(2500); });
    act(() => { vi.advanceTimersByTime(4000); });
    act(() => { vi.advanceTimersByTime(15000); });
    expect(catchSpy).toHaveBeenLastCalledWith(expect.objectContaining({ manual: false }));
  });

  it('방치 어획 직후 이어진 입질에서 수동 챔질로 줄이 끊기면(line-cut) 수동 효과음으로 전달한다', () => {
    const snapSpy = vi.spyOn(soundEvents, 'emitLineSnapSound').mockReturnValue(true);
    const riverSchool = V_SCHOOLS.find(s => s.spot === 'river')!;
    const fish = FISH[0];

    const { container } = render(
      <Field
        region="village"
        game={newState()}
        dispatch={() => ({
          status: 'ok',
          state: newState(),
          result: {
            type: 'catch',
            fishId: fish.id,
            uid: 'f1',
            info: { form: 'normal', size: 30, percentile: 50, isBig: false, isNew: false },
            released: [],
          },
        })}
        setToast={() => {}}
        onScene={() => {}}
        initialPos={{ x: riverSchool.x, y: riverSchool.y }}
      />,
    );

    const advanceUntilPhase = (phase: string) => {
      for (let i = 0; i < 40; i++) {
        if (container.querySelector(`[data-phase="${phase}"]`)) return;
        act(() => { vi.advanceTimersByTime(500); });
      }
    };

    // 첫 던짐: 방치 타임아웃으로 auto 어획 완료 -> 다음 cycle은 auto 모드
    fireEvent.keyDown(document, { code: 'Space' });
    advanceUntilPhase('bite');
    expect(container.querySelector('[data-phase="bite"]')).not.toBeNull();
    advanceUntilPhase('catch');
    expect(container.querySelector('[data-phase="catch"]')).not.toBeNull();

    // 획득 카드 종료 후 다음 입질 대기 -> 입질 진입
    advanceUntilPhase('wait');
    advanceUntilPhase('bite');
    expect(container.querySelector('[data-phase="bite"]')).not.toBeNull();
    snapSpy.mockClear();

    // 방치 입질 중 사용자가 수동으로 챔질(파워 부족 수역) -> line-cut은 manual: true여야 한다
    fireEvent.keyDown(document, { code: 'Space' });
    expect(snapSpy).toHaveBeenCalledWith({ manual: true, underpowered: true });
  });
});

describe('Field 구역 강제 모자 실시간 송신', () => {
  it('championship 구역에서는 readPosition이 santa-hat을 송신하고, 구역을 벗어나면 game.look으로 복원한다', () => {
    const spy = vi.spyOn(liveService, 'useLivePosition');
    const game = { ...newState(), look: { shirt: 2, pants: 3, hat: 'cap-red' } };
    try {
      const { rerender } = render(
        <Field
          region={'championship' as RegionId}
          game={game}
          dispatch={() => ({ status: 'ok', result: {} as never, state: game })}
          setToast={() => {}}
          onScene={() => {}}
        />,
      );
      expect(spy.mock.calls.at(-1)?.[0]().look).toEqual({ shirt: 2, pants: 3, hat: 'santa-hat' });

      rerender(
        <Field
          region="village"
          game={game}
          dispatch={() => ({ status: 'ok', result: {} as never, state: game })}
          setToast={() => {}}
          onScene={() => {}}
        />,
      );
      expect(spy.mock.calls.at(-1)?.[0]().look).toEqual({ shirt: 2, pants: 3, hat: 'cap-red' });
    } finally {
      spy.mockRestore();
    }
  });
});
