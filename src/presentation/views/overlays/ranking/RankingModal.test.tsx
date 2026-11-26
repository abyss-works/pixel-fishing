import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FISH } from '../../../../game/content/fish';
import { NAMED } from '../../../../game/content/named';

const state = vi.hoisted(() => ({
  results: {} as Record<string, unknown>,
  errors: new Set<string>(),
  pending: false,
  calls: [] as string[],
}));
vi.mock('../../../../platform/api', async importOriginal => {
  const mod = await importOriginal<typeof import('../../../../platform/api')>();
  return {
    ...mod,
    readRanking: (board: string) => {
      state.calls.push(board);
      if (state.pending) return new Promise(() => {});
      if (state.errors.has(board)) return Promise.reject(new Error('network error'));
      return Promise.resolve(state.results[board] ?? null);
    },
  };
});

const layout = vi.hoisted(() => ({ mobile: false }));
vi.mock('../../../layouts/useMobileLayout', () => ({ useMobileLayout: () => layout.mobile }));

import RankingModal from './RankingModal';

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0 } } });
  render(<QueryClientProvider client={client}><RankingModal onClose={() => {}} /></QueryClientProvider>);
}

describe('랭킹 창', () => {
  afterEach(() => { cleanup(); layout.mobile = false; state.results = {}; state.errors.clear(); state.pending = false; state.calls = []; });

  it('상단 5탭(명성, 도감(일반), 도감(돌연변이), 도감(네임드), 네임드 토벌)을 두고 활성 탭만 지연 조회하며 재전환 시 캐시를 재사용한다', async () => {
    state.results = {
      fame: { board: 'fame', top: [{ rank: 1, nickname: '가', value: 1200, me: false }], me: null },
      dex: { board: 'dex', top: [{ rank: 1, nickname: '나', value: 42, me: false }], me: null },
      variant: { board: 'variant', top: [{ rank: 1, nickname: '다', value: 10, me: false }], me: null },
      named: { board: 'named', top: [{ rank: 1, nickname: '라', value: 3, me: false }], me: null },
      namedClears: { board: 'namedClears', top: [{ rank: 1, nickname: '마', value: 15, me: false }], me: null },
    };
    show();
    for (const label of ['명성', '도감(일반)', '도감(돌연변이)', '도감(네임드)', '네임드 토벌']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
    expect(await screen.findByText('1,200')).toBeInTheDocument();
    expect(state.calls).toEqual(['fame']);

    fireEvent.click(screen.getByRole('button', { name: '도감(일반)' }));
    await screen.findByText('나');
    expect(screen.getByText('나').closest('tr')).toHaveTextContent(`42 / ${FISH.length} (${Math.round((42 / FISH.length) * 100)}%)`);
    expect(state.calls).toEqual(['fame', 'dex']);

    fireEvent.click(screen.getByRole('button', { name: '도감(돌연변이)' }));
    await screen.findByText('다');
    expect(screen.getByText('다').closest('tr')).toHaveTextContent(`10 / ${FISH.length} (${Math.round((10 / FISH.length) * 100)}%)`);
    expect(state.calls).toEqual(['fame', 'dex', 'variant']);

    fireEvent.click(screen.getByRole('button', { name: '도감(네임드)' }));
    await screen.findByText('라');
    expect(screen.getByText('라').closest('tr')).toHaveTextContent(`3 / ${NAMED.length} (${Math.round((3 / NAMED.length) * 100)}%)`);
    expect(state.calls).toEqual(['fame', 'dex', 'variant', 'named']);

    fireEvent.click(screen.getByRole('button', { name: '네임드 토벌' }));
    expect(await screen.findByText('15회')).toBeInTheDocument();
    expect(state.calls).toEqual(['fame', 'dex', 'variant', 'named', 'namedClears']);

    // 이미 불러온 명성 탭으로 되돌아가면 재조회하지 않는다
    fireEvent.click(screen.getByRole('button', { name: '명성' }));
    expect(await screen.findByText('1,200')).toBeInTheDocument();
    await waitFor(() => expect(state.calls).toEqual(['fame', 'dex', 'variant', 'named', 'namedClears']));
  });

  it('1위부터 3위의 순위 숫자는 골드로 쓴다', async () => {
    state.results = {
      fame: { board: 'fame', top: [1, 2, 3, 4].map(rank => ({ rank, nickname: `p${rank}`, value: 10 - rank, me: false })), me: null },
    };
    show();
    await screen.findByText('p1');
    const rankCell = (name: string) => within(screen.getByText(name).closest('tr')!).getAllByRole('cell')[0];
    expect(rankCell('p3')).toHaveAttribute('data-rank-tone', 'gold');
    expect(rankCell('p4')).toHaveAttribute('data-rank-tone', 'default');
  });

  it('목록 밖이면 내 줄을 표 아래에 고정한다', async () => {
    state.results = {
      fame: { board: 'fame', top: [{ rank: 1, nickname: '가', value: 1200, me: false }], me: { rank: 57, value: 10 } },
    };
    show();
    const mine = await screen.findByLabelText('내 순위');
    expect(within(mine).getByText('57')).toHaveAttribute('data-rank-tone', 'accent');
    expect(within(mine).getByText('10')).toBeInTheDocument();
  });

  it('상위 목록 안의 내 행은 강조하고 따로 반복하지 않으며, 1~3위 순위와 수치 열의 골드 강조를 유지한다', async () => {
    state.results = { fame: { board: 'fame', top: [{ rank: 1, nickname: '나', value: 5, me: true }], me: { rank: 1, value: 5 } } };
    show();
    const tr = (await screen.findByText('나')).closest('tr')!;
    expect(tr).toHaveAttribute('aria-current', 'true');
    expect(tr).toHaveAttribute('data-me', 'true');
    expect(within(tr).getAllByRole('cell')[0]).toHaveAttribute('data-rank-tone', 'gold');
    expect(within(tr).getAllByRole('cell')[2].querySelector('[data-progress-count]')).toHaveAttribute('data-tone', 'gold');
    expect(screen.queryByLabelText('내 순위')).not.toBeInTheDocument();
  });

  it('불러오는 동안 로딩 표시를 보인다', () => {
    state.pending = true;
    show();
    expect(screen.getByRole('status', { name: '불러오는 중' })).toBeInTheDocument();
  });

  it('조회 실패 시 오류 안내와 다시 시도 버튼을 보이고, 빈 목록이면 빈 상태 안내를 보인다', async () => {
    state.errors.add('fame');
    state.results = {
      fame: { board: 'fame', top: [{ rank: 1, nickname: '가', value: 1200, me: false }], me: null },
      namedClears: { board: 'namedClears', top: [], me: null },
    };
    show();
    expect(await screen.findByText(/랭킹을 열지 못했어요/)).toBeInTheDocument();

    state.errors.delete('fame');
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(await screen.findByText('1,200')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '네임드 토벌' }));
    expect(await screen.findByText('아직 기록이 없어요.')).toBeInTheDocument();
  });

  it('로컬 모드(조회 결과 없음)는 연결 안내를 띄운다', async () => {
    show();
    expect(await screen.findByText('랭킹은 연결된 상태에서만 볼 수 있어요.')).toBeInTheDocument();
  });

  it('모바일 레이아웃에서는 360px 창 폭 안에서 가로 넘침이 나지 않게 열 폭을 줄이고 값 열 폭을 확보한다', async () => {
    state.results = {
      dex: { board: 'dex', top: [{ rank: 1, nickname: '아주긴닉네임예시', value: 117, me: false }], me: { rank: 42, value: 88 } },
    };
    show();
    fireEvent.click(screen.getByRole('button', { name: '도감(일반)' }));
    const pcTable = (await screen.findByRole('table')) as HTMLTableElement;
    expect(pcTable.style.minWidth).toBe('calc(136px + 3.5rem + 6rem)');
    expect([...pcTable.querySelectorAll('col')].map(c => c.style.width)).toEqual(['3.5rem', '', '136px']);

    cleanup();
    layout.mobile = true;
    show();
    fireEvent.click(screen.getByRole('button', { name: '도감(일반)' }));
    const mobileTable = (await screen.findByRole('table')) as HTMLTableElement;
    expect(mobileTable.style.minWidth).toBe('calc(144px + 2.5rem + 4.5rem)');
    expect([...mobileTable.querySelectorAll('col')].map(c => c.style.width)).toEqual(['2.5rem', '', '144px']);
  });
});
