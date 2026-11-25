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

  it('오늘의 운세 요약, 월간 달력 격자, 월간 통계, 선택 날짜 상세를 표시하고 날짜를 바꾸면 상세가 갱신된다', async () => {
    apiMock.readFortuneHistory.mockResolvedValue(NOV_HISTORY);
    renderWithQuery(
      <FortuneCalendarModal gameFortune={NOV_HISTORY.today} accountState="account" onClose={vi.fn()} />,
    );

    await waitFor(() => expect(screen.getByRole('region', { name: '2026년 11월 운세 달력' })).toBeInTheDocument());
    expect(screen.getByText('오늘의 풍어운')).toBeInTheDocument();

    const stats = screen.getByLabelText('월간 운세 집계');
    expect(within(stats).getByText('4일')).toBeInTheDocument();
    expect(within(stats).getByText('2회')).toBeInTheDocument();
    expect(within(stats).getAllByText('1회')).toHaveLength(2);

    const detail = screen.getByLabelText('선택한 날짜 운세 상세');
    expect(within(detail).getByText('2026년 11월 25일')).toBeInTheDocument();
    expect(within(detail).getByText('좋은 운')).toBeInTheDocument();

    // 과거 기록 날짜 선택
    fireEvent.click(screen.getByRole('button', { name: /2026년 11월 19일/ }));
    expect(within(detail).getByText('2026년 11월 19일')).toBeInTheDocument();
    expect(within(detail).getByText('재물운')).toBeInTheDocument();
    expect(within(detail).getByText('적당한 운')).toBeInTheDocument();
    expect(within(detail).getByText('판매가')).toBeInTheDocument();
    expect(within(detail).getByText('×1.03')).toBeInTheDocument();
    const phraseEl = within(detail).getByText(fortunePhrase({ day: '2026-11-19', kind: 'gold', index: 3 }));
    const bonusEl = within(detail).getByText('보너스 대상');
    expect(phraseEl.compareDocumentPosition(bonusEl) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // 기록 없는 과거 날짜 선택
    fireEvent.click(screen.getByRole('button', { name: /2026년 11월 23일/ }));
    expect(within(detail).getByText('이 날은 기록된 운세가 없어요.')).toBeInTheDocument();

    // 미래 날짜는 비활성
    expect(screen.getByRole('button', { name: /2026년 11월 26일/ })).toBeDisabled();
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
    expect(within(screen.getByLabelText('선택한 날짜 운세 상세')).getByText('2026년 10월 30일')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '다음 달' }));
    await waitFor(() => expect(screen.getByRole('region', { name: '2026년 11월 운세 달력' })).toBeInTheDocument());
  });

  it('빈 달, 로딩, 오류 재시도, 오프라인 상태를 구분해 표시한다', async () => {
    // 로딩 상태
    let resolveLoad!: (v: FortuneHistory | null) => void;
    apiMock.readFortuneHistory.mockImplementationOnce(() => new Promise(res => { resolveLoad = res; }));
    renderWithQuery(
      <FortuneCalendarModal gameFortune={NOV_HISTORY.today} accountState="account" onClose={vi.fn()} />,
    );
    expect(screen.getByRole('status', { name: '운세 달력을 불러오는 중' })).toBeInTheDocument();

    // 빈 달
    resolveLoad({ ...NOV_HISTORY, firstMonth: null, days: [] });
    await waitFor(() => expect(screen.getByText('이 달에는 기록된 운세가 없어요.')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: '이전 달' })).toBeDisabled();
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
  });

  it('게스트에게는 오늘의 운세와 공용 잠금 달력 안내를 보이고 이력을 조회하지 않는다', () => {
    const today: DailyFortune = { day: currentGameDay(new Date().toISOString()), kind: 'gold', index: 3 };
    const onClose = vi.fn();
    renderWithQuery(
      <FortuneCalendarModal gameFortune={today} accountState="guest" onClose={onClose} />,
    );

    expect(apiMock.readFortuneHistory).not.toHaveBeenCalled();
    expect(screen.getByText('오늘의 재물운')).toBeInTheDocument();
    expect(screen.getByText('월별 운세 달력 잠금')).toBeInTheDocument();
    expect(screen.getByText('태평양 항로가 열리면 쓸 수 있어요.')).toBeInTheDocument();
    expect(screen.getByText('태평양 항로는 조각배(1단계)부터 열려요.')).toBeInTheDocument();

    fireEvent.mouseEnter(screen.getByRole('group', { name: '월별 운세 달력 잠금' }).parentElement!);
    expect(screen.getByRole('tooltip')).toHaveTextContent('태평양 항로가 열리면 쓸 수 있어요.');

    fireEvent.click(screen.getByRole('button', { name: '닫기' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('계정 확인 실패 상태에서는 확인 실패 전용 잠금 문안을 표시한다', () => {
    renderWithQuery(
      <FortuneCalendarModal gameFortune={null} accountState="unverified" onClose={vi.fn()} />,
    );

    expect(apiMock.readFortuneHistory).not.toHaveBeenCalled();
    expect(screen.getByRole('group', { name: '월별 운세 달력 잠금' })).toHaveTextContent('계정을 확인하면 쓸 수 있어요.');
  });
});
