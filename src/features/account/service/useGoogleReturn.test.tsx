// 구글 인증에서 돌아온 직후의 처리 — 복귀 결과를 알리고, 덮어쓰기 확인이 필요하면 묻고, 진행하면 구글 로그인으로 이어 가며, 되돌아가면 계정 관리 창을 다시 연다.
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  isConfigured: true,
  landing: null as { tag: string; error: string | null } | null,
  startGoogle: vi.fn(),
  confirmGoogleSwitch: vi.fn(),
  cancelGoogleSwitch: vi.fn(),
}));

vi.mock('../../../platform/api', () => ({
  api: {
    auth: {
      get isConfigured() { return auth.isConfigured; },
      takeGoogleLanding: () => auth.landing,
      startGoogle: auth.startGoogle,
      confirmGoogleSwitch: auth.confirmGoogleSwitch,
      cancelGoogleSwitch: auth.cancelGoogleSwitch,
    },
  },
}));

import { useGoogleReturn } from './useGoogleReturn';
import { registerNoticeSink } from '../../display/model/toastPolicy';
import type { SystemNoticeInput } from '../../display/model/toastPolicy';
import {
  consumeGoogleOrigin,
  hasPendingSailReturn,
  isSailReturnReady,
  resetSailReturnForTest,
  setPendingGoogleOrigin,
  setPendingSailReturn,
} from './sailReturn';

import type { GuestProgress } from '../model/accountRules';

function setup(answer = true, progress: GuestProgress = 'some') {
  const props = {
    progress,
    setToast: vi.fn(),
    askOverwrite: vi.fn(async () => answer),
    showNotice: vi.fn<(title: string, body: string) => Promise<void>>(async () => {}),
    reopenAccount: vi.fn(),
  };
  const view = renderHook((p: { progress: GuestProgress }) => useGoogleReturn({ ...props, progress: p.progress }), { initialProps: { progress } });
  return Object.assign(props, { rerender: (next: GuestProgress) => view.rerender({ progress: next }) });
}

describe('구글 인증 복귀 처리', () => {
  beforeEach(() => {
    auth.isConfigured = true;
    auth.landing = null;
    auth.startGoogle.mockReset();
    auth.startGoogle.mockResolvedValue({ ok: true });
    auth.confirmGoogleSwitch.mockReset();
    auth.confirmGoogleSwitch.mockResolvedValue({ ok: true });
    auth.cancelGoogleSwitch.mockReset();
    auth.cancelGoogleSwitch.mockResolvedValue(undefined);
    sessionStorage.clear();
    resetSailReturnForTest();
  });
  afterEach(() => {
    cleanup();
    sessionStorage.clear();
    resetSailReturnForTest();
  });

  it('구글에서 돌아온 게 아니면 아무것도 하지 않는다', () => {
    const p = setup();
    expect(p.setToast).not.toHaveBeenCalled();
    expect(p.askOverwrite).not.toHaveBeenCalled();
    expect(p.showNotice).not.toHaveBeenCalled();
  });

  it('클라우드가 설정되지 않았으면 복귀 주소를 읽지 않는다', () => {
    auth.isConfigured = false;
    auth.landing = { tag: 'link-guest', error: null };
    const p = setup();
    expect(p.setToast).not.toHaveBeenCalled();
  });

  it('연결 성공은 알림 한 번이다', async () => {
    auth.landing = { tag: 'link-guest', error: null };
    const p = setup();
    await waitFor(() => expect(p.setToast).toHaveBeenCalledTimes(1));
    expect(p.setToast).toHaveBeenCalledWith('구글 계정을 연결했어요. 진행은 이 계정에 저장돼요.', 'info');
  });

  it('기존 계정이 겹친다는 코드는 안내 창으로 알린다', async () => {
    auth.landing = { tag: 'link-guest', error: 'email_account_exists' };
    const p = setup();
    await waitFor(() => expect(p.showNotice).toHaveBeenCalledTimes(1));
    expect(p.showNotice.mock.calls[0][1]).toContain('다른 구글 계정으로 연결');
    expect(p.askOverwrite).not.toHaveBeenCalled();
  });

  it('게스트의 연결 충돌은 확인을 묻고 진행하면 1회용 전환 티켓으로 바로 전환하고 2차 구글 인증으로 보내지 않는다', async () => {
    auth.landing = { tag: 'link-guest', error: 'account_already_linked_to_different_user' };
    const p = setup(true);
    await waitFor(() => expect(auth.confirmGoogleSwitch).toHaveBeenCalledTimes(1));
    expect(auth.confirmGoogleSwitch).toHaveBeenCalledWith('sign-in');
    expect(auth.startGoogle).not.toHaveBeenCalled();
    expect(p.reopenAccount).not.toHaveBeenCalled();
    expect(p.setToast).not.toHaveBeenCalled();
  });

  it('전환 티켓이 만료·누락(fallback: true)이면 기존 2차 구글 로그인으로 폴백한다', async () => {
    auth.landing = { tag: 'link-guest', error: 'account_already_linked_to_different_user' };
    auth.confirmGoogleSwitch.mockResolvedValue({ ok: false, fallback: true, msg: 'expired', code: 'switch_ticket_expired' });
    const p = setup(true);
    await waitFor(() => expect(auth.startGoogle).toHaveBeenCalledTimes(1));
    expect(auth.startGoogle).toHaveBeenCalledWith('sign-in', 'sign-in');
    expect(p.setToast).not.toHaveBeenCalled();
  });

  it('확인에서 되돌아가면 전환 티켓을 취소하고 구글 로그인을 시작하지 않으며 계정 관리 창을 다시 연다', async () => {
    auth.landing = { tag: 'link-guest', error: 'account_already_linked_to_different_user' };
    const p = setup(false);
    await waitFor(() => expect(p.reopenAccount).toHaveBeenCalledTimes(1));
    expect(auth.cancelGoogleSwitch).toHaveBeenCalledTimes(1);
    expect(p.setToast).toHaveBeenCalledWith('연결하지 않았어요. 다른 구글 계정으로 연결해 보세요.', 'info');
    expect(auth.confirmGoogleSwitch).not.toHaveBeenCalled();
    expect(auth.startGoogle).not.toHaveBeenCalled();
  });

  it('진행했는데 폴백 구글 인증 화면을 열지 못하면 경고한다', async () => {
    auth.landing = { tag: 'link-guest', error: 'account_already_linked_to_different_user' };
    auth.confirmGoogleSwitch.mockResolvedValue({ ok: false, fallback: true, msg: 'missing', code: 'switch_ticket_missing' });
    auth.startGoogle.mockResolvedValue({ ok: false, msg: '실패' });
    const p = setup(true);
    await waitFor(() => expect(p.setToast).toHaveBeenCalledTimes(1));
    expect(p.setToast).toHaveBeenCalledWith('구글 계정 선택 화면을 열지 못했어요. 잠시 뒤 다시 시도해 주세요.', 'warn');
  });

  it('전환 티켓 확인이 폴백 불가 오류로 실패하면 2차 구글 인증으로 보내지 않고 전환 실패 문구를 알린다', async () => {
    auth.landing = { tag: 'link-guest', error: 'account_already_linked_to_different_user' };
    auth.confirmGoogleSwitch.mockResolvedValue({ ok: false, fallback: false, msg: '실패', code: 'switch_session_mismatch' });
    const notices: SystemNoticeInput[] = [];
    const setToast = registerNoticeSink(vi.fn(), input => notices.push(input));
    const props = {
      progress: 'some' as GuestProgress,
      setToast,
      askOverwrite: vi.fn(async () => true),
      showNotice: vi.fn<(title: string, body: string) => Promise<void>>(async () => {}),
      reopenAccount: vi.fn(),
    };
    renderHook(() => useGoogleReturn(props));
    await waitFor(() => expect(notices).toHaveLength(1));
    expect(auth.startGoogle).not.toHaveBeenCalled();
    expect(notices[0]).toMatchObject({
      text: '선택한 구글 계정으로 전환하지 못했어요.\n잠시 뒤 다시 시도해 주세요.',
      toastText: '구글 계정 전환 실패',
      tone: 'danger',
    });
  });

  it('전환 티켓 확인이 rate-limited 오류로 실패하면 기존 속도 제한 안내를 유지한다', async () => {
    auth.landing = { tag: 'link-guest', error: 'account_already_linked_to_different_user' };
    auth.confirmGoogleSwitch.mockResolvedValue({
      ok: false,
      fallback: false,
      msg: '요청이 너무 잦아요. 잠시 뒤 다시 시도해 주세요.',
      code: 'rate-limited',
    });
    const notices: SystemNoticeInput[] = [];
    const setToast = registerNoticeSink(vi.fn(), input => notices.push(input));
    const props = {
      progress: 'some' as GuestProgress,
      setToast,
      askOverwrite: vi.fn(async () => true),
      showNotice: vi.fn<(title: string, body: string) => Promise<void>>(async () => {}),
      reopenAccount: vi.fn(),
    };
    renderHook(() => useGoogleReturn(props));
    await waitFor(() => expect(notices).toHaveLength(1));
    expect(auth.startGoogle).not.toHaveBeenCalled();
    expect(notices[0].text).toBe('요청이 너무 잦아요. 잠시 뒤 다시 시도해 주세요.');
    expect(notices[0].toastText).toBeUndefined();
  });

  it('sign-in 표지가 같은 코드를 받으면 확인 없이 안내 창이다', async () => {
    auth.landing = { tag: 'sign-in', error: 'account_already_linked_to_different_user' };
    const p = setup();
    await waitFor(() => expect(p.showNotice).toHaveBeenCalledTimes(1));
    expect(p.askOverwrite).not.toHaveBeenCalled();
  });

  it('unable_to_link_account는 안내 창이다', async () => {
    auth.landing = { tag: 'link-guest', error: 'unable_to_link_account' };
    const p = setup();
    await waitFor(() => expect(p.showNotice).toHaveBeenCalledTimes(1));
  });
});

describe('구글 로그인 복귀의 성공', () => {
  beforeEach(() => {
    auth.isConfigured = true;
    auth.landing = { tag: 'sign-in', error: null };
  });
  afterEach(cleanup);

  it('따로 알리지 않는다 (부팅의 진행 불러오기 알림과 겹치지 않게)', () => {
    const p = setup();
    expect(p.setToast).not.toHaveBeenCalled();
    expect(p.showNotice).not.toHaveBeenCalled();
  });
});

describe('버릴 진행이 없는 게스트의 구글 로그인', () => {
  beforeEach(() => {
    auth.isConfigured = true;
    auth.landing = { tag: 'link-guest', error: 'account_already_linked_to_different_user' };
    auth.startGoogle.mockReset();
    auth.startGoogle.mockResolvedValue({ ok: true });
    auth.confirmGoogleSwitch.mockReset();
    auth.confirmGoogleSwitch.mockResolvedValue({ ok: true });
    auth.cancelGoogleSwitch.mockReset();
    auth.cancelGoogleSwitch.mockResolvedValue(undefined);
  });
  afterEach(cleanup);

  it('진행이 없으면 확인 없이 바로 1회용 전환 티켓으로 로그인한다', async () => {
    const p = setup(false, 'nothing');
    await waitFor(() => expect(auth.confirmGoogleSwitch).toHaveBeenCalledWith('sign-in'));
    expect(auth.startGoogle).not.toHaveBeenCalled();
    expect(p.askOverwrite).not.toHaveBeenCalled();
    expect(p.reopenAccount).not.toHaveBeenCalled();
  });

  it('진행이 없으면 티켓 만료 시에만 2차 구글 로그인으로 폴백한다', async () => {
    auth.confirmGoogleSwitch.mockResolvedValue({ ok: false, fallback: true, msg: 'expired', code: 'switch_ticket_expired' });
    const p = setup(false, 'nothing');
    await waitFor(() => expect(auth.startGoogle).toHaveBeenCalledWith('sign-in', 'sign-in'));
    expect(p.askOverwrite).not.toHaveBeenCalled();
  });

  it('진행이 있으면 확인을 묻는다', async () => {
    const p = setup(true, 'some');
    await waitFor(() => expect(p.askOverwrite).toHaveBeenCalledTimes(1));
  });

  it('상태를 읽는 동안은 결정하지 않고, 읽은 결과가 진행 없음이면 확인 없이 시작한다', async () => {
    const p = setup(false, 'reading');
    await new Promise(r => setTimeout(r, 20));
    expect(p.askOverwrite).not.toHaveBeenCalled();
    expect(auth.confirmGoogleSwitch).not.toHaveBeenCalled();
    expect(auth.startGoogle).not.toHaveBeenCalled();
    p.rerender('nothing');
    await waitFor(() => expect(auth.confirmGoogleSwitch).toHaveBeenCalledTimes(1));
    expect(p.askOverwrite).not.toHaveBeenCalled();
  });

  it('상태를 읽는 동안 기다리다 진행이 있다고 읽히면 확인을 묻는다', async () => {
    const p = setup(true, 'reading');
    p.rerender('some');
    await waitFor(() => expect(p.askOverwrite).toHaveBeenCalledTimes(1));
  });

  it('판정이 바뀌어도 한 번만 처리한다', async () => {
    const p = setup(true, 'nothing');
    await waitFor(() => expect(auth.confirmGoogleSwitch).toHaveBeenCalledTimes(1));
    p.rerender('some');
    p.rerender('nothing');
    await new Promise(r => setTimeout(r, 20));
    expect(auth.confirmGoogleSwitch).toHaveBeenCalledTimes(1);
    expect(p.askOverwrite).not.toHaveBeenCalled();
  });

  it('확인을 건너뛴 로그인에서 폴백 구글 시작이 실패하면 구글 화면을 열지 못했다는 안내를 보인다', async () => {
    auth.confirmGoogleSwitch.mockResolvedValue({ ok: false, fallback: true, msg: 'expired', code: 'switch_ticket_expired' });
    auth.startGoogle.mockResolvedValue({ ok: false, msg: '실패' });
    const p = setup(false, 'nothing');
    await waitFor(() => expect(p.setToast).toHaveBeenCalledWith('구글 계정 선택 화면을 열지 못했어요. 잠시 뒤 다시 시도해 주세요.', 'warn'));
  });

  it('확인을 건너뛴 로그인을 시작하다 던져도 구글 계정 전환 실패 안내를 보인다', async () => {
    auth.confirmGoogleSwitch.mockRejectedValue(new Error('network'));
    const p = setup(false, 'nothing');
    await waitFor(() => expect(p.setToast).toHaveBeenCalledWith('선택한 구글 계정으로 전환하지 못했어요.\n잠시 뒤 다시 시도해 주세요.', 'warn'));
    expect(p.setToast).toHaveBeenCalledTimes(1);
  });

  it('확인에서 진행한 로그인을 시작하다 던져도 구글 계정 전환 실패 안내를 보인다', async () => {
    auth.confirmGoogleSwitch.mockRejectedValue(new Error('network'));
    const p = setup(true, 'some');
    await waitFor(() => expect(p.setToast).toHaveBeenCalledWith('선택한 구글 계정으로 전환하지 못했어요.\n잠시 뒤 다시 시도해 주세요.', 'warn'));
  });

  it('다른 오류 코드는 진행 판정과 관계없이 복귀 안내를 보이고 로그인을 시작하지 않는다', async () => {
    auth.landing = { tag: 'sign-in', error: 'account_already_linked_to_different_user' };
    const p = setup(false, 'nothing');
    await waitFor(() => expect(p.showNotice).toHaveBeenCalledTimes(1));
    expect(auth.confirmGoogleSwitch).not.toHaveBeenCalled();
    expect(auth.startGoogle).not.toHaveBeenCalled();
  });
});

describe('출항 복귀 표지 처리', () => {
  beforeEach(() => {
    auth.isConfigured = true;
    auth.landing = null;
    auth.startGoogle.mockReset();
    auth.startGoogle.mockResolvedValue({ ok: true });
    auth.confirmGoogleSwitch.mockReset();
    auth.confirmGoogleSwitch.mockResolvedValue({ ok: true });
    auth.cancelGoogleSwitch.mockReset();
    auth.cancelGoogleSwitch.mockResolvedValue(undefined);
    sessionStorage.clear();
    resetSailReturnForTest();
  });
  afterEach(() => {
    cleanup();
    sessionStorage.clear();
    resetSailReturnForTest();
  });

  it('link-guest 성공 시 출항 대기를 소비 가능 상태로 활성화한다', async () => {
    setPendingSailReturn();
    auth.landing = { tag: 'link-guest', error: null };
    setup();
    await waitFor(() => expect(isSailReturnReady()).toBe(true));
  });

  it('sign-in 성공 시 출항 대기를 소비 가능 상태로 활성화한다', async () => {
    setPendingSailReturn();
    auth.landing = { tag: 'sign-in', error: null };
    setup();
    await waitFor(() => expect(isSailReturnReady()).toBe(true));
  });

  it('취소나 오류 복귀 시 출항 대기를 지운다', async () => {
    setPendingSailReturn();
    auth.landing = { tag: 'link-guest', error: 'access_denied' };
    const p = setup();
    await waitFor(() => expect(p.setToast).toHaveBeenCalledTimes(1));
    expect(hasPendingSailReturn()).toBe(false);
    expect(isSailReturnReady()).toBe(false);
  });

  it('landing 없이 마운트되면 남아 있던 출항 대기를 지운다', () => {
    setPendingSailReturn();
    setup();
    expect(hasPendingSailReturn()).toBe(false);
    expect(isSailReturnReady()).toBe(false);
  });

  it('덮어쓰기 확인을 진행해 전환 티켓 확인이 시작되면 출항 대기를 유지한다', async () => {
    setPendingSailReturn();
    auth.landing = { tag: 'link-guest', error: 'account_already_linked_to_different_user' };
    setup(true, 'some');
    await waitFor(() => expect(auth.confirmGoogleSwitch).toHaveBeenCalledTimes(1));
    expect(hasPendingSailReturn()).toBe(true);
    expect(isSailReturnReady()).toBe(false);
  });

  it('덮어쓰기 확인에서 취소하면 출항 대기를 지운다', async () => {
    setPendingSailReturn();
    auth.landing = { tag: 'link-guest', error: 'account_already_linked_to_different_user' };
    const p = setup(false, 'some');
    await waitFor(() => expect(p.reopenAccount).toHaveBeenCalledTimes(1));
    expect(hasPendingSailReturn()).toBe(false);
  });

  it('덮어쓰기 확인 후 폴백 sign-in 재인증 시작이 실패하면 출항 대기를 지운다', async () => {
    setPendingSailReturn();
    auth.landing = { tag: 'link-guest', error: 'account_already_linked_to_different_user' };
    auth.confirmGoogleSwitch.mockResolvedValue({ ok: false, fallback: true, msg: 'expired', code: 'switch_ticket_expired' });
    auth.startGoogle.mockResolvedValue({ ok: false, msg: '실패' });
    const p = setup(true, 'some');
    await waitFor(() => expect(p.setToast).toHaveBeenCalledTimes(1));
    expect(hasPendingSailReturn()).toBe(false);
  });

  it('설정 계정 관리에서 시작해 충돌 후 되돌아가면 manage 출처로 복귀한다', async () => {
    setPendingGoogleOrigin('manage');
    auth.landing = { tag: 'link-guest', error: 'account_already_linked_to_different_user' };
    const p = setup(false, 'some');
    await waitFor(() => expect(p.reopenAccount).toHaveBeenCalledWith('manage'));
    expect(consumeGoogleOrigin()).toBeNull();
  });

  it('출항 연결 창에서 시작해 충돌 후 되돌아가면 connect 출처로 복귀한다', async () => {
    setPendingGoogleOrigin('connect');
    auth.landing = { tag: 'link-guest', error: 'account_already_linked_to_different_user' };
    const p = setup(false, 'some');
    await waitFor(() => expect(p.reopenAccount).toHaveBeenCalledWith('connect'));
    expect(consumeGoogleOrigin()).toBeNull();
  });
});
