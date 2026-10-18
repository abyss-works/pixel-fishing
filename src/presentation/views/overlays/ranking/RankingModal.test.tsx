import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  results: {} as Record<string, unknown>,
  pending: false,
}));
vi.mock('../../../../platform/api', async importOriginal => {
  const mod = await importOriginal<typeof import('../../../../platform/api')>();
  return {
    ...mod,
    readRanking: (board: string) => (state.pending ? new Promise(() => {}) : Promise.resolve(state.results[board] ?? null)),
  };
});

import RankingModal from './RankingModal';

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><RankingModal onClose={() => {}} /></QueryClientProvider>);
}
const column = (title: string) => screen.getByRole('heading', { name: title }).parentElement!;

describe('랭킹 창', () => {
  afterEach(() => { cleanup(); state.results = {}; state.pending = false; });

  it('명성과 도감 순위를 한 화면에 나란히 보여 준다', async () => {
    state.results = {
      fame: { board: 'fame', top: [{ rank: 1, nickname: '가', value: 1200, me: false }], me: null },
      dex: { board: 'dex', top: [{ rank: 1, nickname: '나', value: 42, me: false }], me: null },
    };
    show();
    expect(await within(column('명성')).findByText('1,200')).toBeInTheDocument();
    expect(await within(column('도감')).findByText('42종')).toBeInTheDocument();
  });

  it('목록 밖이면 내 순위를 따로 보여 준다', async () => {
    state.results = {
      fame: { board: 'fame', top: [{ rank: 1, nickname: '가', value: 1200, me: false }], me: { rank: 57, value: 10 } },
    };
    show();
    expect(await screen.findByText('내 순위 57위 · 10')).toBeInTheDocument();
  });

  it('상위 목록 안의 내 행은 강조하고 따로 반복하지 않는다', async () => {
    state.results = { fame: { board: 'fame', top: [{ rank: 1, nickname: '나', value: 5, me: true }], me: { rank: 1, value: 5 } } };
    show();
    expect((await screen.findByText('나')).closest('tr')).toHaveAttribute('aria-current', 'true');
    expect(screen.queryByText(/내 순위/)).not.toBeInTheDocument();
  });

  it('불러오는 동안 두 칸 모두 로딩 표시를 보인다', () => {
    state.pending = true;
    show();
    expect(screen.getAllByRole('status', { name: '불러오는 중' })).toHaveLength(2);
  });

  it('로컬 모드(조회 결과 없음)는 온라인 안내를 띄운다', async () => {
    show();
    await waitFor(() => expect(screen.getAllByText('랭킹은 온라인에서만 볼 수 있어요.')).toHaveLength(2));
  });
});
