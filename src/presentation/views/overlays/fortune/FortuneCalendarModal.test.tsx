import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DailyFortune } from '../../../../game/rules/fortune';
import type { FortuneHistory } from '../../../../platform/api';
import { currentGameDay, fortunePhrase } from '../../../../features/fortune/model/fortune';
import { sessionKey } from '../../../../features/account/service/session';

const apiMock = vi.hoisted(() => ({
  readFortuneHistory: vi.fn(),
  isConfigured: true,
}));

vi.mock('../../../../platform/api', async importOriginal => {
  const mod = await importOriginal<typeof import('../../../../platform/api')>();
  return {
    ...mod,
    readFortuneHistory: apiMock.readFortuneHistory,
    api: {
      ...mod.api,
      auth: {
        ...mod.api.auth,
        get isConfigured() { return apiMock.isConfigured; },
        ensureSession: vi.fn(async () => 'u1'),
      },
    },
  };
});

import FortuneCalendarModal from './FortuneCalendarModal';

const NOV_HISTORY: FortuneHistory = {
  month: '2026-11',
  firstMonth: '2026-10',
  currentDay: '2026-11-25',
  today: { day: '2026-11-25', kind: 'fish', index: 5 },
  days: [
    { day: '2026-11-19', kind: 'gold', index: 3 },
    { day: '2026-11-20', kind: 'fish', index: 5 },
    { day: '2026-11-21', kind: 'shadow', index: 3 },
    { day: '2026-11-25', kind: 'fish', index: 5 },
  ],
};

const OCT_HISTORY: FortuneHistory = {
  month: '2026-10',
  firstMonth: '2026-10',
  currentDay: '2026-11-25',
  today: { day: '2026-11-25', kind: 'fish', index: 5 },
  days: [
    { day: '2026-10-30', kind: 'shadow', index: 5 },
  ],
};

function renderWithQuery(node: ReactNode, uid: string | null = 'u1') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0 } } });
  client.setQueryData(sessionKey, uid);
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

describe('운세 월간 달력 창 (FortuneCalendarModal)', () => {
  beforeEach(() => {
    apiMock.isConfigured = true;
    apiMock.readFortuneHistory.mockReset();
  });

  afterEach(() => cleanup());

  it('좌우 2단 고정 레이아웃으로 오늘의 운세 미니 카드, 6행 달력, 선택 날짜 상세를 표시하고 월간 통계·중첩 스크롤·구형 표기를 쓰지 않는다', async () => {
    apiMock.readFortuneHistory.mockResolvedValue(NOV_HISTORY);
    renderWithQuery(
      <FortuneCalendarModal gameFortune={NOV_HISTORY.today} accountState="account" onClose={vi.fn()} />,
    );

    await waitFor(() => expect(screen.getByRole('region', { name: '2026년 11월 운세 달력' })).toBeInTheDocument());

    const dialog = screen.getByRole('dialog', { name: '운세' });
    expect(dialog.className).toContain('h-[min(500px,calc(100%-32px))]');
    expect(dialog.className).toContain('mobile:h-[min(552px,calc(100%-48px))]');
    expect(dialog.firstElementChild).toHaveClass('flex-1');
    expect(dialog.querySelector('.pf-vscroll')).toBeNull();

    // 오늘의 운세 미니 카드 (상단 중복 TodayFortuneBanner 없음)
    const todayCard = screen.getByLabelText('오늘의 운세 요약');
    expect(within(todayCard).getByText('오늘의 운세')).toBeInTheDocument();
    expect(within(todayCard).getByText('풍어운')).toBeInTheDocument();
    expect(within(todayCard).getByText('좋은 운')).toBeInTheDocument();
    expect(within(todayCard).getByText('×1.05')).toBeInTheDocument();
    expect(screen.queryByText('오늘의 풍어운')).toBeNull();

    // 제거 항목 검증: 월간 운세 집계, 안내 문구, 미기록/기록 없음, 지수/만날 확률/%p/보너스 대상, 셀 내 단독 숫자 3/5
    expect(screen.queryByLabelText('월간 운세 집계')).toBeNull();
    expect(screen.queryByText(/이번 달 기록/)).toBeNull();
    expect(screen.queryByText(/매일 새벽 이후 첫 접속부터/)).toBeNull();
    expect(screen.queryByText(/미기록|기록 없음/)).toBeNull();
    expect(screen.queryByText(/지수|만날 확률|보너스 대상|%p/i)).toBeNull();

    const detail = screen.getByLabelText('선택한 날짜 운세 상세');
    expect(within(detail).getByText('2026년 11월 25일')).toBeInTheDocument();
    expect(within(detail).getByText('좋은 운')).toBeInTheDocument();
    expect(within(detail).getByText('희귀')).toHaveAttribute('data-rarity', 'rare');
    expect(within(detail).getByText(/이상 출현 비중/)).toBeInTheDocument();
    expect(within(detail).getByText('×1.05')).toBeInTheDocument();

    // 과거 기록 날짜 선택 (재물운)
    fireEvent.click(screen.getByRole('button', { name: /2026년 11월 19일/ }));
    expect(within(detail).getByText('2026년 11월 19일')).toBeInTheDocument();
    expect(within(detail).getByText('재물운')).toBeInTheDocument();
    expect(within(detail).getByText('적당한 운')).toBeInTheDocument();
    expect(within(detail).getByText('판매가')).toBeInTheDocument();
    expect(within(detail).getByText('×1.03')).toBeInTheDocument();
    const phraseEl = within(detail).getByText(fortunePhrase({ day: '2026-11-19', kind: 'gold', index: 3 }));
    const targetLabelEl = within(detail).getByText('적용 대상');
    expect(phraseEl.compareDocumentPosition(targetLabelEl) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // 그림자 운 날짜 선택: text-named 색과 target 아이콘 통일 검증 (아이콘 축소·라벨 말줄임 없음)
    const shadowCell = screen.getByRole('button', { name: /2026년 11월 21일/ });
    const shadowIcon = shadowCell.querySelector('[data-glyph="target"]');
    expect(shadowIcon).not.toBeNull();
    expect(shadowIcon).toHaveClass('shrink-0');
    expect(shadowCell.querySelector('.text-named')).not.toBeNull();
    const shadowShortLabel = within(shadowCell).getByText('그림자');
    expect(shadowShortLabel).toHaveClass('mobile:hidden');
    expect(shadowShortLabel).not.toHaveClass('truncate');
    fireEvent.click(shadowCell);
    expect(within(detail).getByText('그림자 운')).toHaveClass('text-named');
    expect(detail.querySelector('[data-glyph="target"]')).not.toBeNull();
    expect(within(detail).getByText('네임드')).toHaveClass('text-named');
    expect(within(detail).getByText(/조우 확률/)).toBeInTheDocument();

    // 과거 미방문 비활성 날짜와 미래 비활성 날짜 구분
    const unvisitedPast = screen.getByRole('button', { name: /2026년 11월 23일/ });
    const futureDay = screen.getByRole('button', { name: /2026년 11월 26일/ });
    expect(unvisitedPast).toBeDisabled();
    expect(futureDay).toBeDisabled();
    expect(unvisitedPast).toHaveAttribute('data-day-state', 'unvisited');
    expect(futureDay).toHaveAttribute('data-day-state', 'future');
    expect(unvisitedPast.className).not.toBe(futureDay.className);
    fireEvent.click(unvisitedPast);
    expect(within(detail).getByText('2026년 11월 21일')).toBeInTheDocument();

    // 6주 고정 달력 격자(42칸)와 상세 패널 고정 높이 유지
    const calendarRegion = screen.getByRole('region', { name: '2026년 11월 운세 달력' });
    const dayGrid = calendarRegion.querySelector('.grid-rows-6')!;
    expect(dayGrid).not.toBeNull();
    expect(dayGrid.children).toHaveLength(42);
    expect(detail.className).toMatch(/\bh-\[372px\]/);
    expect(detail.className).toMatch(/\bmobile:h-\[202px\]/);
  });

  it('이전 달과 다음 달 이동 시 해당 월 이력을 조회하고 경계 월에서 버튼을 비활성화한다', async () => {
    apiMock.readFortuneHistory.mockImplementation(async (month?: string) =>
      month === '2026-10' ? OCT_HISTORY : NOV_HISTORY,
    );
    renderWithQuery(
      <FortuneCalendarModal gameFortune={NOV_HISTORY.today} accountState="account" onClose={vi.fn()} />,
    );

    await waitFor(() => expect(screen.getByRole('region', { name: '2026년 11월 운세 달력' })).toBeInTheDocument());
    const prevBtn = screen.getByRole('button', { name: '이전 달' });
    const nextBtn = screen.getByRole('button', { name: '다음 달' });
    expect(prevBtn).toBeEnabled();
    expect(nextBtn).toBeDisabled();

    fireEvent.click(prevBtn);
    await waitFor(() => expect(screen.getByRole('region', { name: '2026년 10월 운세 달력' })).toBeInTheDocument());
    expect(apiMock.readFortuneHistory).toHaveBeenCalledWith('2026-10');
    expect(screen.getByRole('button', { name: '이전 달' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '다음 달' })).toBeEnabled();
    const octDetail = screen.getByLabelText('선택한 날짜 운세 상세');
    expect(within(octDetail).getByText('2026년 10월 30일')).toBeInTheDocument();
    expect(within(octDetail).getByText('그림자 운')).toHaveClass('text-named');
    expect(within(octDetail).getByText('×1.05')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '다음 달' }));
    await waitFor(() => expect(screen.getByRole('region', { name: '2026년 11월 운세 달력' })).toBeInTheDocument());
  });

  it('빈 달, 로딩, 오류 재시도, 오프라인 상태가 모두 동일한 바깥 고정 창 안에서 구분되어 표시된다', async () => {
    // 로딩 상태
    let resolveLoad!: (v: FortuneHistory | null) => void;
    apiMock.readFortuneHistory.mockImplementationOnce(() => new Promise(res => { resolveLoad = res; }));
    renderWithQuery(
      <FortuneCalendarModal gameFortune={NOV_HISTORY.today} accountState="account" onClose={vi.fn()} />,
    );
    expect(screen.getByRole('status', { name: '운세 달력을 불러오는 중' })).toBeInTheDocument();
    const loadingDialog = screen.getByRole('dialog', { name: '운세' });
    expect(loadingDialog.className).toContain('h-[min(500px,calc(100%-32px))]');
    expect(loadingDialog.firstElementChild).toHaveClass('flex-1');

    // 빈 달
    resolveLoad({ ...NOV_HISTORY, firstMonth: null, days: [] });
    await waitFor(() => expect(screen.getByText('이 달에는 기록된 운세가 없어요.')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: '이전 달' })).toBeDisabled();
    expect(screen.getByRole('dialog', { name: '운세' }).firstElementChild).toHaveClass('flex-1');
    cleanup();

    // 오류 및 재시도
    apiMock.readFortuneHistory
      .mockRejectedValueOnce(new Error('fail'))
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce(NOV_HISTORY);
    renderWithQuery(
      <FortuneCalendarModal gameFortune={NOV_HISTORY.today} accountState="account" onClose={vi.fn()} />,
    );
    await waitFor(() => expect(screen.getByText(/운세 달력을 불러오지 못했어요/)).toBeInTheDocument(), { timeout: 3000 });
    expect(screen.getByRole('dialog', { name: '운세' }).className).toContain('h-[min(500px,calc(100%-32px))]');
    fireEvent.click(screen.getByRole('button', { name: '다시 불러오기' }));
    await waitFor(() => expect(screen.getByRole('region', { name: '2026년 11월 운세 달력' })).toBeInTheDocument());
    cleanup();

    // 오프라인(로컬 모드)
    apiMock.isConfigured = false;
    apiMock.readFortuneHistory.mockResolvedValueOnce(null);
    renderWithQuery(
      <FortuneCalendarModal gameFortune={NOV_HISTORY.today} accountState="account" onClose={vi.fn()} />,
      null,
    );
    await waitFor(() => expect(screen.getByText('운세 달력은 연결된 상태에서만 볼 수 있어요.')).toBeInTheDocument());
    expect(screen.getByRole('dialog', { name: '운세' }).className).toContain('h-[min(500px,calc(100%-32px))]');
  });

  it('게스트에게는 같은 고정 창 안에서 오늘의 운세와 표준 잠금 달력을 보이고 잠금 줄을 이중 렌더링하지 않는다', () => {
    const today: DailyFortune = { day: currentGameDay(new Date().toISOString()), kind: 'gold', index: 3 };
    const onClose = vi.fn();
    renderWithQuery(
      <FortuneCalendarModal gameFortune={today} accountState="guest" onClose={onClose} />,
    );

    expect(apiMock.readFortuneHistory).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog', { name: '운세' });
    expect(dialog.className).toContain('h-[min(500px,calc(100%-32px))]');
    expect(dialog.className).toContain('mobile:h-[min(552px,calc(100%-48px))]');
    expect(dialog.firstElementChild).toHaveClass('flex-1');

    expect(within(screen.getByLabelText('오늘의 운세 요약')).getByText('재물운')).toBeInTheDocument();
    expect(within(screen.getByLabelText('선택한 날짜 운세 상세')).getByText('×1.03')).toBeInTheDocument();
    expect(screen.queryByText('오늘의 재물운')).toBeNull();

    const lockGroup = screen.getByRole('group', { name: '월별 운세 달력 잠금' });
    expect(within(lockGroup).getByText('월별 운세 달력 잠금')).toBeInTheDocument();
    const lockBox = within(lockGroup).getByText('월별 운세 달력 잠금').closest('.pf-notch')!;
    expect(lockBox.className).toContain('h-[404px]');
    expect(lockBox.className).toContain('mobile:h-[212px]');
    // Locked 내부 sr-only LockReason 외에 보이는 잠금 줄을 중복 출력하지 않는다
    const visibleClone = lockGroup.cloneNode(true) as HTMLElement;
    visibleClone.querySelectorAll('.sr-only').forEach(el => el.remove());
    expect(visibleClone.textContent).not.toMatch(/태평양 항로|조각배|계정을 확인하면/);

    fireEvent.mouseEnter(lockGroup.parentElement!);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '닫기' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('계정 확인 실패 상태에서도 같은 고정 창과 표준 잠금 문안을 표시한다', () => {
    renderWithQuery(
      <FortuneCalendarModal gameFortune={null} accountState="unverified" onClose={vi.fn()} />,
    );

    expect(apiMock.readFortuneHistory).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: '운세' }).className).toContain('h-[min(500px,calc(100%-32px))]');
    expect(screen.getByRole('group', { name: '월별 운세 달력 잠금' })).toHaveTextContent('계정을 확인하면 쓸 수 있어요.');
  });
});
