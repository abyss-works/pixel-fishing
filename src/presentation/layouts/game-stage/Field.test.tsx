import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError, fail } from '../../../core/errors';
import { newState } from '../../../game/rules/logic';
import { FISH } from '../../../game/content/fish';
import { CHAMPIONSHIP_SCHOOLS } from '../../../game/world';
import { setSchoolDay } from '../../../features/gameplay/service/schoolDay';
import * as soundEvents from '../../../features/sound/service/soundEvents';
import { resetKeyScopes } from '../../ui/hotkeys';

const layout = vi.hoisted(() => ({ mobile: false }));
vi.mock('../useMobileLayout', () => ({ useMobileLayout: () => layout.mobile }));

import Field from './Field';

const POND_SHORE = { x: 214, y: 92 };
const SCHOOL_DAY = '2026-10-18';

beforeEach(() => {
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
});
