import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  results: {} as Record<string, unknown>,
  pending: false,
  calls: [] as string[],
}));
vi.mock('../../../../platform/api', async importOriginal => {
  const mod = await importOriginal<typeof import('../../../../platform/api')>();
  return {
    ...mod,
    readRanking: (board: string) => {
      state.calls.push(board);
      return state.pending ? new Promise(() => {}) : Promise.resolve(state.results[board] ?? null);
    },
  };
});

import RankingModal from './RankingModal';

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><RankingModal onClose={() => {}} /></QueryClientProvider>);
}

describe('랭킹 창', () => {
  afterEach(() => { cleanup(); state.results = {}; state.pending = false; state.calls = []; });

  it('명성과 도감을 탭으로 나누고, 창을 열 때 두 순위를 함께 불러온다', async () => {
    state.results = {
      fame: { board: 'fame', top: [{ rank: 1, nickname: '가', value: 1200, me: false }], me: null },
      dex: { board: 'dex', top: [{ rank: 1, nickname: '나', value: 42, me: false }], me: null },
    };
    show();
    expect(await screen.findByText('1,200')).toBeInTheDocument();
    expect(screen.queryByText('42종')).not.toBeInTheDocument();
    await waitFor(() => expect([...state.calls].sort()).toEqual(['dex', 'fame']));
    fireEvent.click(screen.getByRole('button', { name: '도감' }));
    expect(await screen.findByText('42종')).toBeInTheDocument();
  });

  it('1위부터 3위의 순위 숫자는 골드로 쓴다', async () => {
    state.results = {
      fame: { board: 'fame', top: [1, 2, 3, 4].map(rank => ({ rank, nickname: `p${rank}`, value: 10 - rank, me: false })), me: null },
    };
    show();
    await screen.findByText('p1');
    const rankCell = (name: string) => within(screen.getByText(name).closest('tr')!).getAllByRole('cell')[0];
    expect(rankCell('p3')).toHaveClass('text-gold');
    expect(rankCell('p4')).not.toHaveClass('text-gold');
  });

  it('목록 밖이면 내 줄을 표 아래에 고정한다', async () => {
    state.results = {
      fame: { board: 'fame', top: [{ rank: 1, nickname: '가', value: 1200, me: false }], me: { rank: 57, value: 10 } },
    };
    show();
    const mine = await screen.findByLabelText('내 순위');
    expect(within(mine).getByText('57')).toBeInTheDocument();
    expect(within(mine).getByText('10')).toBeInTheDocument();
  });

  it('상위 목록 안의 내 행은 강조하고 따로 반복하지 않는다', async () => {
    state.results = { fame: { board: 'fame', top: [{ rank: 1, nickname: '나', value: 5, me: true }], me: { rank: 1, value: 5 } } };
    show();
    expect((await screen.findByText('나')).closest('tr')).toHaveAttribute('aria-current', 'true');
    expect(screen.queryByLabelText('내 순위')).not.toBeInTheDocument();
  });

  it('불러오는 동안 로딩 표시를 보인다', () => {
    state.pending = true;
    show();
    expect(screen.getByRole('status', { name: '불러오는 중' })).toBeInTheDocument();
  });

  it('로컬 모드(조회 결과 없음)는 온라인 안내를 띄운다', async () => {
    show();
    expect(await screen.findByText('랭킹은 온라인에서만 볼 수 있어요.')).toBeInTheDocument();
  });
});
