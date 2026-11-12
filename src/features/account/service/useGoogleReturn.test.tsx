// 구글 인증에서 돌아온 직후의 처리 — 복귀 결과를 알리고, 덮어쓰기 확인이 필요하면 묻고, 진행하면 구글 로그인으로 이어 가며, 되돌아가면 계정 관리 창을 다시 연다.
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  isConfigured: true,
  landing: null as { tag: string; error: string | null } | null,
  startGoogle: vi.fn(),
}));

vi.mock('../../../platform/api', () => ({
  api: {
    auth: {
      get isConfigured() { return auth.isConfigured; },
      takeGoogleLanding: () => auth.landing,
      startGoogle: auth.startGoogle,
    },
  },
}));

import { useGoogleReturn } from './useGoogleReturn';

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
  });
  afterEach(cleanup);

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

  it('이메일 계정이 겹친다는 코드는 안내 창으로 알린다', async () => {
    auth.landing = { tag: 'link-guest', error: 'email_account_exists' };
    const p = setup();
    await waitFor(() => expect(p.showNotice).toHaveBeenCalledTimes(1));
    expect(p.showNotice.mock.calls[0][1]).toContain('계정 관리');
    expect(p.askOverwrite).not.toHaveBeenCalled();
  });

  it('게스트의 연결 충돌은 확인을 묻고 진행하면 구글 로그인을 시작한다', async () => {
    auth.landing = { tag: 'link-guest', error: 'account_already_linked_to_different_user' };
    const p = setup(true);
    await waitFor(() => expect(auth.startGoogle).toHaveBeenCalledTimes(1));
    expect(auth.startGoogle).toHaveBeenCalledWith('sign-in', 'sign-in');
    expect(p.reopenAccount).not.toHaveBeenCalled();
    expect(p.setToast).not.toHaveBeenCalled();
  });

  it('확인에서 되돌아가면 구글 로그인을 시작하지 않고 계정 관리 창을 다시 연다', async () => {
    auth.landing = { tag: 'link-guest', error: 'account_already_linked_to_different_user' };
    const p = setup(false);
    await waitFor(() => expect(p.reopenAccount).toHaveBeenCalledTimes(1));
    expect(p.setToast).toHaveBeenCalledWith('연결하지 않았어요. 다른 구글 계정으로 연결해 보세요.', 'info');
    expect(auth.startGoogle).not.toHaveBeenCalled();
  });

  it('진행했는데 구글 인증 화면을 열지 못하면 경고한다', async () => {
    auth.landing = { tag: 'link-guest', error: 'account_already_linked_to_different_user' };
    auth.startGoogle.mockResolvedValue({ ok: false, msg: '실패' });
    const p = setup(true);
    await waitFor(() => expect(p.setToast).toHaveBeenCalledTimes(1));
    expect(p.setToast).toHaveBeenCalledWith('구글 계정 선택 화면을 열지 못했어요. 잠시 뒤 다시 시도해 주세요.', 'warn');
  });

  it('이메일 계정이 같은 코드를 받으면 확인 없이 안내 창이다', async () => {
    auth.landing = { tag: 'link-email', error: 'account_already_linked_to_different_user' };
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
  });
  afterEach(cleanup);

  it('진행이 없으면 확인 없이 바로 구글 로그인을 시작한다', async () => {
    const p = setup(false, 'nothing');
    await waitFor(() => expect(auth.startGoogle).toHaveBeenCalledWith('sign-in', 'sign-in'));
    expect(p.askOverwrite).not.toHaveBeenCalled();
    expect(p.reopenAccount).not.toHaveBeenCalled();
  });

  it('진행이 있으면 확인을 묻는다', async () => {
    const p = setup(true, 'some');
    await waitFor(() => expect(p.askOverwrite).toHaveBeenCalledTimes(1));
  });

  it('상태를 읽는 동안은 결정하지 않고, 읽은 결과가 진행 없음이면 확인 없이 시작한다', async () => {
    const p = setup(false, 'reading');
    await new Promise(r => setTimeout(r, 20));
    expect(p.askOverwrite).not.toHaveBeenCalled();
    expect(auth.startGoogle).not.toHaveBeenCalled();
    p.rerender('nothing');
    await waitFor(() => expect(auth.startGoogle).toHaveBeenCalledTimes(1));
    expect(p.askOverwrite).not.toHaveBeenCalled();
  });

  it('상태를 읽는 동안 기다리다 진행이 있다고 읽히면 확인을 묻는다', async () => {
    const p = setup(true, 'reading');
    p.rerender('some');
    await waitFor(() => expect(p.askOverwrite).toHaveBeenCalledTimes(1));
  });

  it('판정이 바뀌어도 한 번만 처리한다', async () => {
    const p = setup(true, 'nothing');
    await waitFor(() => expect(auth.startGoogle).toHaveBeenCalledTimes(1));
    p.rerender('some');
    p.rerender('nothing');
    await new Promise(r => setTimeout(r, 20));
    expect(auth.startGoogle).toHaveBeenCalledTimes(1);
    expect(p.askOverwrite).not.toHaveBeenCalled();
  });

  it('확인을 건너뛴 로그인을 시작하지 못하면 기존 실패 안내를 보인다', async () => {
    auth.startGoogle.mockResolvedValue({ ok: false, msg: '실패' });
    const p = setup(false, 'nothing');
    await waitFor(() => expect(p.setToast).toHaveBeenCalledWith('구글 계정 선택 화면을 열지 못했어요. 잠시 뒤 다시 시도해 주세요.', 'warn'));
  });

  it('이메일 계정이나 다른 오류 코드는 진행 판정과 관계없이 지금처럼 처리한다', async () => {
    auth.landing = { tag: 'link-email', error: 'account_already_linked_to_different_user' };
    const p = setup(false, 'nothing');
    await waitFor(() => expect(p.showNotice).toHaveBeenCalledTimes(1));
    expect(auth.startGoogle).not.toHaveBeenCalled();
  });
});
