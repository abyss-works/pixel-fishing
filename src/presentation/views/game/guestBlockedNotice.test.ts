// 게스트가 포구에서 되밀렸을 때의 처리 — 안내 줄을 남기고 계정 관리 창을 연다. 다른 창이 떠 있으면 하지 않는다.
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GUEST_VILLAGE_ONLY_TEXT } from '../../../features/gameplay/service/useGame';
import { resetOpenWindows, useOpenWindow } from '../../ui/openWindows';
import { createGuestBlockedNotice } from './guestBlockedNotice';

afterEach(resetOpenWindows);

function setup(accountOpen = false) {
  const setToast = vi.fn();
  const openAccount = vi.fn();
  const notify = createGuestBlockedNotice({ accountOpen, openAccount, setToast });
  return { setToast, openAccount, notify };
}

describe('게스트 출항 차단 처리', () => {
  it('안내 줄을 남기고 계정 관리 창을 연다', () => {
    const p = setup();
    p.notify();
    expect(p.setToast).toHaveBeenCalledWith(GUEST_VILLAGE_ONLY_TEXT, 'warn');
    expect(p.openAccount).toHaveBeenCalledTimes(1);
  });

  it('계정 관리 창이 이미 열려 있으면 안내도 창도 다시 띄우지 않는다', () => {
    const p = setup(true);
    p.notify();
    expect(p.setToast).not.toHaveBeenCalled();
    expect(p.openAccount).not.toHaveBeenCalled();
  });

  it('다른 창이 열려 있으면 안내도 창도 띄우지 않는다', () => {
    renderHook(() => useOpenWindow(() => {}));
    const p = setup();
    p.notify();
    expect(p.setToast).not.toHaveBeenCalled();
    expect(p.openAccount).not.toHaveBeenCalled();
  });
});
