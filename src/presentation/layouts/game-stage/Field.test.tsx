import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newState } from '../../../game/rules/logic';
import { FISH } from '../../../game/content/fish';
import { setSchoolDay } from '../../../features/gameplay/service/schoolDay';
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
