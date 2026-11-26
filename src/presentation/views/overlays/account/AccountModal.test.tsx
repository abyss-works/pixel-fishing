// 계정 관리 창의 동작 계약 - 게스트의 구글 연결 시작, 계정 사용자 구성, 계정 확인 실패 처리.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const actions = vi.hoisted(() => ({
  connectGoogle: vi.fn(),
  configured: true,
}));

vi.mock('../../../../features/account/service/accountActions', async importOriginal => ({
  ...await importOriginal<object>(),
  isAccountConfigured: () => actions.configured,
  connectGoogle: actions.connectGoogle,
}));

import AccountModal from './AccountModal';
import { ACCOUNT_CHECK_FAILED_COPY } from '../../../../features/account/model/accountRules';
import {
  consumeGoogleOrigin,
  hasPendingSailReturn,
  resetSailReturnForTest,
  setPendingSailReturn,
} from '../../../../features/account/service/sailReturn';

beforeEach(() => {
  actions.connectGoogle.mockReset();
  actions.connectGoogle.mockResolvedValue({ ok: true });
  actions.configured = true;
  sessionStorage.clear();
  resetSailReturnForTest();
});
afterEach(() => {
  cleanup();
  sessionStorage.clear();
  resetSailReturnForTest();
});

const open = (
  account: string | null,
  accountFailed = false,
  sailReturn = false,
  mode: 'manage' | 'connect' = 'manage',
  sync: { syncState?: string; syncLabel?: string | null } = {},
) => {
  const setToast = vi.fn();
  const onAuthChanged = vi.fn(async () => {});
  const onClose = vi.fn();
  const view = render(
    <AccountModal layer={mode === 'connect' ? 'stage' : 'app'} mode={mode} setToast={setToast} onAuthChanged={onAuthChanged} onClose={onClose}
                  account={account} accountFailed={accountFailed} sailReturn={sailReturn}
                  syncLabel={'syncLabel' in sync ? sync.syncLabel : '클라우드 저장 켜짐'}
                  syncState={sync.syncState ?? 'on'} />,
  );
  return { setToast, onAuthChanged, onClose, unmount: view.unmount };
};

describe('게스트의 구글 연결', () => {
  it('구글 버튼은 연결을 시작하고 이메일 로그인 폼은 없다', async () => {
    open(null);
    expect(screen.queryByRole('button', { name: '기존 이메일 계정으로 로그인' })).toBeNull();
    expect(screen.queryByLabelText('이메일')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Google로 계속하기' }));
    await waitFor(() => expect(actions.connectGoogle).toHaveBeenCalledTimes(1));
  });

  it('시작하지 못하면 경고하고 버튼을 다시 쓸 수 있다', async () => {
    actions.connectGoogle.mockResolvedValue({ ok: false, msg: '실패' });
    const { setToast } = open(null);
    const button = screen.getByRole('button', { name: 'Google로 계속하기' });
    fireEvent.click(button);
    await waitFor(() => expect(setToast).toHaveBeenCalledWith('구글 계정 선택 화면을 열지 못했어요. 잠시 뒤 다시 시도해 주세요.', 'warn'));
    await waitFor(() => expect(button).toBeEnabled());
  });

  it('고지 한 줄에 이용약관과 개인정보 처리방침 링크가 새 탭 아이콘과 함께 있다', () => {
    open(null);
    for (const name of ['이용약관', '개인정보 처리방침']) {
      const link = screen.getByRole('link', { name });
      expect(link).toHaveAttribute('target', '_blank');
      expect(link.querySelector('[data-glyph="external"]')).not.toBeNull();
    }
  });

  it('설정 계정 관리 창에서 게스트에게는 공용 최초 연결 선물 카드 3종과 우측 정렬 게스트 행이 보이고, 로그인 계정에는 보이지 않는다', () => {
    open(null);
    expect(screen.getByText('게스트')).toHaveClass('text-right');
    const giftTitle = screen.getByText('최초 연결 선물');
    expect(giftTitle).toHaveClass('text-gold');
    const mailTag = screen.getByText('우편함 지급');
    expect(mailTag).toHaveClass('text-text-dim');
    expect(mailTag.className).not.toContain('border');
    expect(screen.getByText('작은 바다 영약')).toBeInTheDocument();
    expect(screen.getByText('(특수)')).toHaveAttribute('data-rarity', 'special');
    expect(screen.getByText('생선 탈리')).toBeInTheDocument();
    expect(screen.getByText('용연향 미끼')).toBeInTheDocument();
    expect(screen.getAllByText('(전설)')).toHaveLength(2);
    expect(screen.getByText('하루 동안 희귀 이상, 판매가, 네임드 조우가 조금 올라요.')).toHaveClass('text-xs');

    fireEvent.mouseEnter(screen.getByText('용연향 미끼'));
    const tip = screen.getByRole('tooltip');
    expect(tip).toHaveTextContent('용연향 미끼(전설)');
    expect(tip).toHaveTextContent('미끼');
    expect(tip).toHaveTextContent('지속');
    expect(tip).toHaveTextContent('수동 5분');

    cleanup();
    open('me@gmail.test');
    expect(screen.queryByText('최초 연결 선물')).toBeNull();
    expect(screen.queryByText('우편함 지급')).toBeNull();
  });

  it('설정 계정 관리 창과 출항 연결 창에서 구글 로그인 시작 시 각각의 출처를 저장하고 실패·취소 시 비운다', async () => {
    open(null, false, false, 'manage');
    fireEvent.click(screen.getByRole('button', { name: 'Google로 계속하기' }));
    await waitFor(() => expect(actions.connectGoogle).toHaveBeenCalledTimes(1));
    expect(consumeGoogleOrigin()).toBe('manage');

    cleanup();
    actions.connectGoogle.mockResolvedValueOnce({ ok: false, msg: '실패' });
    open(null, false, false, 'connect');
    fireEvent.click(screen.getByRole('button', { name: 'Google로 계속하기' }));
    await waitFor(() => expect(actions.connectGoogle).toHaveBeenCalledTimes(2));
    expect(consumeGoogleOrigin()).toBeNull();
  });
});

describe('로그인 상태별 구성', () => {
  it('구글 계정 사용자는 별도 클라우드 저장 구획·중복 안내 없이 전폭 로그아웃과 실선 법무 링크 3종을 보인다', () => {
    open('me@gmail.test');
    expect(screen.queryByRole('button', { name: 'Google로 계속하기' })).toBeNull();
    expect(screen.queryByText('진행은 이 계정에 저장돼요.')).toBeNull();
    expect(screen.queryByText('클라우드 저장 켜짐')).toBeNull();
    expect(screen.queryByRole('tooltip')).toBeNull();

    const logout = screen.getByRole('button', { name: '로그아웃' });
    expect(logout).toBeInTheDocument();
    expect(logout).toHaveClass('full');

    for (const [name, href] of [['이용약관', '/terms'], ['개인정보 처리방침', '/privacy'], ['운영정책', '/policy']]) {
      const link = screen.getByRole('link', { name });
      expect(link).toHaveAttribute('href', href);
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveClass('decoration-solid');
      expect(link).not.toHaveClass('decoration-dotted');
      expect(link.querySelector('[data-glyph="external"]')).not.toBeNull();
    }
  });

  it('구름 아이콘은 호버·포커스·터치 누르기 시에만 2줄 상태 툴팁을 열고 Esc로 닫힌다', () => {
    open('me@gmail.test');
    const trigger = screen.getByRole('button', { name: '클라우드 저장 켜짐' });
    expect(trigger.querySelector('[data-glyph="cloudOk"]')).not.toBeNull();
    expect(screen.queryByRole('tooltip')).toBeNull();

    fireEvent.mouseEnter(trigger);
    const tip = screen.getByRole('tooltip');
    expect(tip).toHaveTextContent('클라우드 저장 켜짐');
    expect(tip).toHaveTextContent('진행 상황이 계정에 자동 저장되고 있어요.');
    fireEvent.mouseLeave(trigger);
    expect(screen.queryByRole('tooltip')).toBeNull();

    fireEvent.focus(trigger);
    expect(screen.getByRole('tooltip')).toHaveTextContent('클라우드 저장 켜짐');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('터치(coarse pointer)에서 구름 아이콘을 누르면 툴팁이 열리고 다시 누르면 닫힌다', () => {
    const origMatchMedia = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query === '(pointer: coarse)',
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
    try {
      open('me@gmail.test');
      const trigger = screen.getByRole('button', { name: '클라우드 저장 켜짐' });
      fireEvent.click(trigger);
      expect(screen.getByRole('tooltip')).toHaveTextContent('진행 상황이 계정에 자동 저장되고 있어요.');
      fireEvent.click(trigger);
      expect(screen.queryByRole('tooltip')).toBeNull();
    } finally {
      window.matchMedia = origMatchMedia;
    }
  });

  it.each([
    ['connecting', '클라우드 저장 연결 중', 'cloudSyncing', '계정 저장 상태를 확인하고 있어요.'],
    ['error', '클라우드 저장 연결 실패', 'cloudError', '저장 서버에 닿지 않았어요. 잠시 뒤 다시 시도해 주세요.'],
  ] as const)('클라우드 상태(%s)에 맞는 구름 아이콘과 2줄 툴팁을 보인다', (syncState, label, glyph, desc) => {
    open('me@gmail.test', false, false, 'manage', { syncState, syncLabel: label });
    const trigger = screen.getByRole('button', { name: label });
    expect(trigger.querySelector(`[data-glyph="${glyph}"]`)).not.toBeNull();
    fireEvent.mouseEnter(trigger);
    const tip = screen.getByRole('tooltip');
    expect(tip).toHaveTextContent(label);
    expect(tip).toHaveTextContent(desc);
  });

  it('게임 서버가 없는 로컬 모드에서는 구름 아이콘 없이 안내가 보이고 계정 동작 버튼이 비활성이다', () => {
    actions.configured = false;
    open('dev@localhost');
    expect(screen.queryByRole('button', { name: /클라우드 저장/ })).toBeNull();
    expect(screen.getByText(/오프라인 상태에서는 계정 기능이 동작하지 않아요/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '로그아웃' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '계정 삭제' })).toBeDisabled();
  });

  it('계정 삭제 진행 중(busy)에는 로그아웃 버튼도 비활성이다', async () => {
    open('me@gmail.test');
    const logoutBtn = screen.getByRole('button', { name: '로그아웃' });
    const deleteBtn = screen.getByRole('button', { name: '계정 삭제' });
    expect(logoutBtn).toBeEnabled();

    fireEvent.click(deleteBtn);
    const deleteDialog = await screen.findByRole('dialog', { name: '계정 삭제' });
    expect(logoutBtn).toBeDisabled();
    expect(deleteBtn).toBeDisabled();

    fireEvent.click(within(deleteDialog).getAllByRole('button', { name: '닫기' })[0]);
    await waitFor(() => expect(logoutBtn).toBeEnabled());
  });
});

describe('계정 확인 실패', () => {
  it('게스트 화면 대신 확인 실패 안내와 다시 확인 버튼만 보이고, 계정 변경 동작은 없다', () => {
    open(null, true);
    expect(screen.getByText(ACCOUNT_CHECK_FAILED_COPY.label)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: ACCOUNT_CHECK_FAILED_COPY.retry })).toBeInTheDocument();
    expect(screen.queryByText('게스트')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Google로 계속하기' })).toBeNull();
    expect(screen.queryByRole('button', { name: '로그아웃' })).toBeNull();
    expect(screen.queryByRole('button', { name: '계정 삭제' })).toBeNull();
    expect(screen.queryByText('이용약관')).toBeNull();
    expect(screen.queryByText('개인정보 처리방침')).toBeNull();
  });

  it('다시 확인을 누르면 계정 확인을 새로 요청한다', async () => {
    const { onAuthChanged } = open(null, true);
    fireEvent.click(screen.getByRole('button', { name: ACCOUNT_CHECK_FAILED_COPY.retry }));
    await waitFor(() => expect(onAuthChanged).toHaveBeenCalledTimes(1));
  });

  it('다시 확인하는 동안에는 버튼이 눌리지 않는다', async () => {
    let release = () => {};
    const view = open(null, true);
    view.onAuthChanged.mockImplementation(() => new Promise<void>(r => { release = r; }));
    const button = screen.getByRole('button', { name: ACCOUNT_CHECK_FAILED_COPY.retry });
    fireEvent.click(button);
    await waitFor(() => expect(button).toBeDisabled());
    release();
    await waitFor(() => expect(button).not.toBeDisabled());
  });

  it('layer="stage"에서 확인 대화상자는 ModalCard 바깥 형제로 마운트돼 스테이지 전체를 덮는다', async () => {
    render(
      <div data-testid="stage">
        <AccountModal layer="stage" setToast={vi.fn()} onAuthChanged={vi.fn(async () => {})} onClose={vi.fn()}
                      account={null} accountFailed={false} />
      </div>,
    );
    fireEvent.click(screen.getByRole('button', { name: '계정 삭제' }));

    const accountDialog = screen.getByRole('dialog', { name: '계정 관리' });
    const deleteDialog = await screen.findByRole('dialog', { name: '계정 삭제' });
    const stage = screen.getByTestId('stage');
    expect(accountDialog).not.toBe(deleteDialog);
    expect(accountDialog.contains(deleteDialog)).toBe(false);
    expect(stage).toContainElement(deleteDialog);
  });
});

describe('출항 차단 후 로그인 의도 표지', () => {
  it('출항 의도로 열린 창에서 구글 로그인을 시작하면 출항 대기를 저장한다', async () => {
    open(null, false, true);
    fireEvent.click(screen.getByRole('button', { name: 'Google로 계속하기' }));
    await waitFor(() => expect(actions.connectGoogle).toHaveBeenCalledTimes(1));
    expect(hasPendingSailReturn()).toBe(true);
  });

  it('출항 의도로 열린 창에서 구글 로그인 시작이 실패하면 출항 대기를 지운다', async () => {
    actions.connectGoogle.mockResolvedValue({ ok: false, msg: '실패' });
    open(null, false, true);
    fireEvent.click(screen.getByRole('button', { name: 'Google로 계속하기' }));
    await waitFor(() => expect(actions.connectGoogle).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(hasPendingSailReturn()).toBe(false));
  });

  it('출항 의도로 열린 창을 로그인 없이 닫으면 출항 대기를 지우고 닫는다', () => {
    setPendingSailReturn();
    const { onClose } = open(null, false, true);
    fireEvent.click(screen.getByRole('button', { name: '닫기' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(hasPendingSailReturn()).toBe(false);
  });

  it('일반 계정 관리 창(설정 등)에서는 구글 로그인을 눌러도 출항 대기를 저장하지 않는다', async () => {
    open(null, false, false);
    fireEvent.click(screen.getByRole('button', { name: 'Google로 계속하기' }));
    await waitFor(() => expect(actions.connectGoogle).toHaveBeenCalledTimes(1));
    expect(hasPendingSailReturn()).toBe(false);
  });
});

describe('출항 전용 연결 창 (mode="connect")', () => {
  it('게스트 상태에서는 420px 메인 창과 우측 220px 애드온(하늘색 제목, @min-[880px]), 최초 연결 선물 3종, 약관 아이콘 링크를 보인다', () => {
    open(null, false, true, 'connect');
    const dialog = screen.getByRole('dialog', { name: '태평양 출항 준비' });
    expect(dialog).toBeInTheDocument();
    expect(dialog.parentElement!.className).toContain('w-[min(420px,calc(100%-32px))]');

    const heroTitle = within(dialog).getByText('태평양 너머 넓은 바다로 나갈 준비가 되었어요.');
    const heroCard = heroTitle.closest('.pf-notch');
    expect(heroCard).toHaveClass('bg-(--inset-light)');

    expect(within(dialog).getByText('최초 연결 선물')).toHaveClass('text-gold');
    expect(within(dialog).getByText('우편함 지급').className).not.toContain('border');
    expect(within(dialog).getByText('작은 바다 영약')).toBeInTheDocument();
    expect(within(dialog).getByText('생선 탈리')).toBeInTheDocument();
    expect(within(dialog).getByText('용연향 미끼')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Google로 계속하기' })).toBeInTheDocument();
    for (const name of ['이용약관', '개인정보 처리방침']) {
      const link = within(dialog).getByRole('link', { name });
      expect(link).toHaveAttribute('target', '_blank');
      expect(link.querySelector('[data-glyph="external"]')).not.toBeNull();
    }
    expect(within(dialog).getByRole('button', { name: '나중에 하기' })).toBeInTheDocument();

    const asideHeading = screen.getByText('연결하면 열리는 것');
    expect(asideHeading).toHaveClass('text-accent', 'font-bold');
    expect(dialog.contains(asideHeading)).toBe(false);
    const asideFrame = asideHeading.closest('.pf-frame')!;
    expect(asideFrame).toHaveClass('w-[220px]');
    expect(asideFrame.parentElement!.className).toContain('@min-[880px]:block');
    expect(asideFrame.querySelectorAll('.pf-notch')).toHaveLength(0);
    expect(screen.getByText('태평양과 세계 해역 개방')).toBeInTheDocument();
    expect(screen.getByText('업적 보상과 소셜 기능 해금')).toBeInTheDocument();
    expect(screen.getByText('현재 마을 진행 그대로 유지')).toBeInTheDocument();

    expect(screen.queryByText('게스트')).toBeNull();
    expect(screen.queryByText('클라우드 저장 켜짐')).toBeNull();
    expect(screen.queryByRole('button', { name: '로그아웃' })).toBeNull();
    expect(screen.queryByRole('button', { name: '계정 삭제' })).toBeNull();
    expect(screen.queryByRole('link', { name: '운영정책' })).toBeNull();
  });

  it('연결 창 보상 행에 호버하면 TipCard 제목줄(등급·종류)과 지속·효과 목록 툴팁이 열리고 빈 라벨이 없다', () => {
    open(null, false, true, 'connect');
    const potion = screen.getByText('작은 바다 영약');
    fireEvent.mouseEnter(potion);
    let tip = screen.getByRole('tooltip');
    expect(tip).toHaveTextContent('작은 바다 영약(특수)');
    expect(tip).toHaveTextContent('비약');
    expect(tip).toHaveTextContent('지속');
    expect(tip).toHaveTextContent('하루 동안');
    expect(tip).toHaveTextContent('효과');
    expect(tip).toHaveTextContent('모든 행운 효과 ×1.05');
    fireEvent.mouseLeave(potion);
    expect(screen.queryByRole('tooltip')).toBeNull();

    fireEvent.mouseEnter(screen.getByText('생선 탈리'));
    tip = screen.getByRole('tooltip');
    const rows = tip.querySelectorAll('.justify-between');
    expect(rows).toHaveLength(4);
    expect(rows[0]).toHaveTextContent('생선 탈리(전설)도시락');
    expect(rows[1]).toHaveTextContent('지속방치 9시간');
    expect(rows[2]).toHaveTextContent('효과입질 대기 −5%');
    expect(rows[3]).toHaveTextContent('효과희귀 이상 +5%');
    expect(within(tip).getByText('희귀')).toHaveAttribute('data-rarity', 'rare');
    expect(tip).not.toHaveTextContent('입질 대기 −5%, 희귀 이상 +5%');
  });

  it('터치(coarse pointer)에서 연결 창 보상 행을 누르면 툴팁이 열리고 다시 누르면 닫힌다', () => {
    const origMatchMedia = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query === '(pointer: coarse)',
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
    try {
      open(null, false, true, 'connect');
      const target = screen.getByText('작은 바다 영약');
      fireEvent.click(target);
      const tip = screen.getByRole('tooltip');
      expect(tip).toHaveTextContent('작은 바다 영약(특수)');
      expect(tip).toHaveTextContent('모든 행운 효과 ×1.05');
      fireEvent.click(target);
      expect(screen.queryByRole('tooltip')).toBeNull();
    } finally {
      window.matchMedia = origMatchMedia;
    }
  });

  it('연결 창의 우측 애드온 패널을 닫았다가 연결 혜택 보기 버튼으로 다시 열 수 있다', () => {
    const { onClose } = open(null, false, true, 'connect');
    expect(screen.getByText('연결하면 열리는 것')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '연결 안내 닫기' }));
    expect(screen.queryByText('연결하면 열리는 것')).toBeNull();
    const dialog = screen.getByRole('dialog', { name: '태평양 출항 준비' });
    expect(dialog).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    const reopenBtn = within(dialog)
      .getAllByRole('button', { name: '연결 혜택 보기' })
      .find(btn => !btn.hasAttribute('aria-expanded'));
    expect(reopenBtn).toBeDefined();
    fireEvent.click(reopenBtn!);
    expect(screen.getByText('연결하면 열리는 것')).toBeInTheDocument();
  });

  it('좁은 화면/모바일용 연결 혜택 보기 버튼으로 메인 창 내부 혜택 드로어를 접고 펼 수 있다', () => {
    open(null, false, true, 'connect');
    const dialog = screen.getByRole('dialog', { name: '태평양 출항 준비' });
    const drawerToggle = within(dialog)
      .getAllByRole('button', { name: '연결 혜택 보기' })
      .find(btn => btn.getAttribute('aria-expanded') === 'false');
    expect(drawerToggle).toBeDefined();
    expect(within(dialog).queryByText('태평양과 세계 해역 개방')).toBeNull();

    fireEvent.click(drawerToggle!);
    expect(drawerToggle).toHaveAttribute('aria-expanded', 'true');
    expect(drawerToggle).toHaveTextContent('연결 혜택 접기');
    expect(within(dialog).getByText('태평양과 세계 해역 개방')).toBeInTheDocument();

    fireEvent.click(drawerToggle!);
    expect(drawerToggle).toHaveAttribute('aria-expanded', 'false');
    expect(within(dialog).queryByText('태평양과 세계 해역 개방')).toBeNull();
  });

  it('나중에 하기를 누르면 출항 대기를 지우고 창을 닫는다', () => {
    setPendingSailReturn();
    const { onClose } = open(null, false, true, 'connect');
    fireEvent.click(screen.getByRole('button', { name: '나중에 하기' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(hasPendingSailReturn()).toBe(false);
  });

  it('연결 창에서 구글 로그인을 시작하면 sailReturn 표지를 저장한다', async () => {
    open(null, false, true, 'connect');
    fireEvent.click(screen.getByRole('button', { name: 'Google로 계속하기' }));
    await waitFor(() => expect(actions.connectGoogle).toHaveBeenCalledTimes(1));
    expect(hasPendingSailReturn()).toBe(true);
  });

  it('세션 확인 실패 상태에서는 출항 전용 창에서도 확인 실패 안내와 다시 확인 버튼만 둔다', () => {
    open(null, true, false, 'connect');
    expect(screen.getByRole('dialog', { name: '태평양 출항 준비' })).toBeInTheDocument();
    expect(screen.getByText(ACCOUNT_CHECK_FAILED_COPY.label)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: ACCOUNT_CHECK_FAILED_COPY.retry })).toBeInTheDocument();
    expect(screen.queryByText('최초 연결 선물')).toBeNull();
    expect(screen.queryByText('연결하면 열리는 것')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Google로 계속하기' })).toBeNull();
    expect(screen.queryByRole('button', { name: '나중에 하기' })).toBeNull();
    expect(screen.queryByRole('button', { name: '계정 삭제' })).toBeNull();
  });
});
