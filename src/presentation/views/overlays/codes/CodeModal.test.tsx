import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { newState, REJECT_TEXT } from '../../../../game/rules/logic';
import { registerNoticeSink, type SystemNoticeInput } from '../../../../features/display/model/toastPolicy';
import type { DispatchResult } from '../../../../features/gameplay/service/types';
import { resetKeyScopes } from '../../../ui/hotkeys';
import SettingsTab from '../../game/tabs/settings/SettingsTab';
import CodeModal from './CodeModal';

afterEach(() => {
  cleanup();
  resetKeyScopes();
});

function createRecordedToast() {
  const notices: SystemNoticeInput[] = [];
  const raw = vi.fn();
  const sink = registerNoticeSink(raw, input => {
    notices.push(input);
  });
  return { notices, raw, sink };
}

function submitCoupon(code: string, result: DispatchResult) {
  const dispatch = vi.fn(() => result);
  const recorded = createRecordedToast();
  render(<CodeModal dispatch={dispatch} setToast={recorded.sink} onClose={vi.fn()} />);

  fireEvent.change(screen.getByLabelText('쿠폰 코드'), { target: { value: code } });
  fireEvent.click(screen.getByRole('button', { name: '쿠폰 코드 사용' }));

  return { dispatch, ...recorded };
}

describe('CodeModal', () => {
  it('쿠폰 팁은 골드와 아이템 지급 동작을 1줄로 안내한다', () => {
    render(<CodeModal dispatch={vi.fn()} setToast={vi.fn()} onClose={vi.fn()} />);
    fireEvent.focus(screen.getByText('쿠폰'));
    expect(screen.getByText('공지나 이벤트로 받은 쿠폰 코드를 넣으면 골드나 아이템을 받아요.')).toBeInTheDocument();
  });

  it('골드만 지급하는 쿠폰을 사용하면 골드 보상 안내와 토스트를 알린다', () => {
    const { dispatch, notices } = submitCoupon('OPEN500', {
      status: 'ok',
      state: newState(),
      result: { type: 'coupon', gold: 500, desc: '오픈 기념' },
    });

    expect(dispatch).toHaveBeenCalledWith({ type: 'redeemCoupon', code: 'OPEN500' });
    expect(notices).toEqual([
      expect.objectContaining({
        kind: 'social.modalAction',
        tone: 'gold',
        text: '쿠폰을 사용했어요! 500G를 받았어요.',
        toastText: '쿠폰 500G 받음!',
      }),
    ]);
    expect(screen.getByLabelText('쿠폰 코드')).toHaveValue('');
  });

  it('출항준비 쿠폰을 사용하면 300G와 작은 바다 영약 1개를 함께 알린다', () => {
    const { dispatch, notices } = submitCoupon('출항준비', {
      status: 'ok',
      state: newState(),
      result: {
        type: 'coupon',
        gold: 300,
        items: [{ id: 'luck-small', qty: 1 }],
        desc: '출항 지원금과 작은 바다 영약',
      },
    });

    expect(dispatch).toHaveBeenCalledWith({ type: 'redeemCoupon', code: '출항준비' });
    expect(notices).toEqual([
      expect.objectContaining({
        kind: 'social.modalAction',
        tone: 'gold',
        text: '쿠폰을 사용했어요! 300G와 작은 바다 영약 1개를 받았어요.',
        toastText: '쿠폰 300G와 작은 바다 영약 1개 받음!',
      }),
    ]);
    expect(notices[0]?.text).not.toMatch(/[()·—–]/);
    expect(notices[0]?.toastText).not.toMatch(/[()·—–]/);
    expect(screen.getByLabelText('쿠폰 코드')).toHaveValue('');
  });

  it('아이템만 지급하는 쿠폰을 사용하면 아이템 이름과 수량을 알린다', () => {
    const { notices } = submitCoupon('POTION2', {
      status: 'ok',
      state: newState(),
      result: {
        type: 'coupon',
        gold: 0,
        items: [{ id: 'luck-small', qty: 2 }],
        desc: '비약 선물',
      },
    });

    expect(notices).toEqual([
      expect.objectContaining({
        kind: 'social.modalAction',
        tone: 'gold',
        text: '쿠폰을 사용했어요! 작은 바다 영약 2개를 받았어요.',
        toastText: '쿠폰 작은 바다 영약 2개 받음!',
      }),
    ]);
  });

  it('게스트가 다른 쿠폰으로 account-only 거부를 받으면 공용 거부 문구를 띄우고 입력을 남긴다', () => {
    const { notices } = submitCoupon('SECRET', {
      status: 'rejected',
      error: 'account-only',
    });

    expect(notices).toEqual([
      expect.objectContaining({
        kind: 'system.modalRejected',
        text: REJECT_TEXT['account-only'],
      }),
    ]);
    expect(screen.getByLabelText('쿠폰 코드')).toHaveValue('SECRET');
  });

  it('게스트 상태의 설정 탭에서도 코드 입력 창을 열어 출항준비 쿠폰을 보낼 수 있다', () => {
    const dispatch = vi.fn(() => ({
      status: 'ok' as const,
      state: newState(),
      result: {
        type: 'coupon' as const,
        gold: 300,
        items: [{ id: 'luck-small', qty: 1 }],
        desc: '출항 지원금과 작은 바다 영약',
      },
    }));
    const recorded = createRecordedToast();

    render(
      <SettingsTab
        autoLockOnCatch={newState().autoLockOnCatch}
        dispatch={dispatch}
        setToast={recorded.sink}
        syncLabel={null}
        syncState="off"
        account={null}
        accountFailed={false}
        uid={null}
        onAuthChanged={async () => {}}
        nickname={null}
        profileStatus="loaded"
        onRename={async () => null}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '코드 입력' }));
    fireEvent.change(screen.getByLabelText('쿠폰 코드'), { target: { value: '출항준비' } });
    fireEvent.click(screen.getByRole('button', { name: '쿠폰 코드 사용' }));

    expect(dispatch).toHaveBeenCalledWith({ type: 'redeemCoupon', code: '출항준비' });
    expect(recorded.notices[0]?.text).toBe('쿠폰을 사용했어요! 300G와 작은 바다 영약 1개를 받았어요.');
  });
});
