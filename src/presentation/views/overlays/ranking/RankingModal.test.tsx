import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FISH } from '../../../../game/content/fish';
import { NAMED } from '../../../../game/content/named';

const state = vi.hoisted(() => ({
  results: {} as Record<string, unknown>,
  errors: new Set<string>(),
  pending: false,
  calls: [] as Array<{ board: string; window?: string }>,
}));
vi.mock('../../../../platform/api', async importOriginal => {
  const mod = await importOriginal<typeof import('../../../../platform/api')>();
  return {
    ...mod,
    readRanking: (board: string, _fishId?: string, window?: string) => {
      state.calls.push({ board, window });
      const key = window ? `${board}:${window}` : board;
      if (state.pending) return new Promise(() => {});
      if (state.errors.has(board) || state.errors.has(key)) return Promise.reject(new Error('network error'));
      return Promise.resolve(state.results[key] ?? state.results[board] ?? null);
    },
  };
});

const layout = vi.hoisted(() => ({ mobile: false }));
vi.mock('../../../layouts/useMobileLayout', () => ({ useMobileLayout: () => layout.mobile }));

import RankingModal from './RankingModal';

function show(props?: { guest?: boolean; nickname?: string | null }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0 } } });
  render(
    <QueryClientProvider client={client}>
      <RankingModal guest={props?.guest} nickname={props?.nickname} onClose={() => {}} />
    </QueryClientProvider>,
  );
}

describe('랭킹 창', () => {
  afterEach(() => { cleanup(); layout.mobile = false; state.results = {}; state.errors.clear(); state.pending = false; state.calls = []; });

  it('상단 5탭을 두고 명성·네임드 토벌은 이번 주 기본, 도감 탭은 전체 누적 고정으로 지연 조회하며 캐시를 재사용한다', async () => {
    state.results = {
      'fame:weekly': { board: 'fame', window: 'weekly', periodSupported: true, resetAt: null, top: [{ rank: 1, nickname: '가', value: 1200, me: false }], me: null },
      'dex:all': { board: 'dex', window: 'all', periodSupported: false, resetAt: null, top: [{ rank: 1, nickname: '나', value: 42, me: false }], me: null },
      'variant:all': { board: 'variant', window: 'all', periodSupported: false, resetAt: null, top: [{ rank: 1, nickname: '다', value: 10, me: false }], me: null },
      'named:all': { board: 'named', window: 'all', periodSupported: false, resetAt: null, top: [{ rank: 1, nickname: '라', value: 3, me: false }], me: null },
      'namedClears:weekly': { board: 'namedClears', window: 'weekly', periodSupported: true, resetAt: null, top: [{ rank: 1, nickname: '마', value: 15, me: false }], me: null },
    };
    show();
    for (const label of ['명성', '도감(일반)', '도감(돌연변이)', '도감(네임드)', '네임드 토벌']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: '이번 주' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '전체 누적' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('매주 월요일 새벽 4시 초기화')).toBeInTheDocument();
    expect(await screen.findByText('1,200')).toBeInTheDocument();
    expect(state.calls).toEqual([{ board: 'fame', window: 'weekly' }]);

    fireEvent.click(screen.getByRole('button', { name: '도감(일반)' }));
    await screen.findByText('나');
    expect(screen.getByText('나').closest('tr')).toHaveTextContent(`42 / ${FISH.length} (${Math.round((42 / FISH.length) * 100)}%)`);
    expect(screen.getByText('전체 누적 기준')).toBeInTheDocument();
    expect(screen.getByText('전체 누적 기록으로만 순위를 매겨요.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '이번 주' })).not.toBeInTheDocument();
    expect(state.calls).toEqual([
      { board: 'fame', window: 'weekly' },
      { board: 'dex', window: 'all' },
    ]);

    fireEvent.click(screen.getByRole('button', { name: '도감(돌연변이)' }));
    await screen.findByText('다');
    expect(screen.getByText('다').closest('tr')).toHaveTextContent(`10 / ${FISH.length} (${Math.round((10 / FISH.length) * 100)}%)`);
    expect(state.calls).toEqual([
      { board: 'fame', window: 'weekly' },
      { board: 'dex', window: 'all' },
      { board: 'variant', window: 'all' },
    ]);

    fireEvent.click(screen.getByRole('button', { name: '도감(네임드)' }));
    await screen.findByText('라');
    expect(screen.getByText('라').closest('tr')).toHaveTextContent(`3 / ${NAMED.length} (${Math.round((3 / NAMED.length) * 100)}%)`);
    expect(state.calls).toEqual([
      { board: 'fame', window: 'weekly' },
      { board: 'dex', window: 'all' },
      { board: 'variant', window: 'all' },
      { board: 'named', window: 'all' },
    ]);

    fireEvent.click(screen.getByRole('button', { name: '네임드 토벌' }));
    expect(await screen.findByText('15회')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '이번 주' })).toHaveAttribute('aria-pressed', 'true');
    expect(state.calls).toEqual([
      { board: 'fame', window: 'weekly' },
      { board: 'dex', window: 'all' },
      { board: 'variant', window: 'all' },
      { board: 'named', window: 'all' },
      { board: 'namedClears', window: 'weekly' },
    ]);

    // 이미 불러온 명성 탭으로 되돌아가면 재조회하지 않는다
    fireEvent.click(screen.getByRole('button', { name: '명성' }));
    expect(await screen.findByText('1,200')).toBeInTheDocument();
    await waitFor(() => expect(state.calls).toHaveLength(5));
  });

  it('이번 주와 전체 누적 토글 전환 시 window=all을 요청하고 기간 안내 문구를 바꾼다', async () => {
    state.results = {
      'fame:weekly': { board: 'fame', window: 'weekly', periodSupported: true, resetAt: null, top: [{ rank: 1, nickname: '주간1등', value: 300, me: false }], me: null },
      'fame:all': { board: 'fame', window: 'all', periodSupported: true, resetAt: null, top: [{ rank: 1, nickname: '누적1등', value: 9000, me: false }], me: null },
      'namedClears:all': { board: 'namedClears', window: 'all', periodSupported: true, resetAt: null, top: [{ rank: 1, nickname: '토벌왕', value: 88, me: false }], me: null },
    };
    show();
    expect(await screen.findByText('주간1등')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '전체 누적' }));
    expect(await screen.findByText('누적1등')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '전체 누적' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('전체 누적 기록')).toBeInTheDocument();
    expect(state.calls).toEqual([
      { board: 'fame', window: 'weekly' },
      { board: 'fame', window: 'all' },
    ]);

    fireEvent.click(screen.getByRole('button', { name: '네임드 토벌' }));
    expect(await screen.findByText('토벌왕')).toBeInTheDocument();
    expect(state.calls).toEqual([
      { board: 'fame', window: 'weekly' },
      { board: 'fame', window: 'all' },
      { board: 'namedClears', window: 'all' },
    ]);
  });

  it('1위부터 3위의 순위 숫자는 골드로 쓴다', async () => {
    state.results = {
      'fame:weekly': { board: 'fame', window: 'weekly', periodSupported: true, resetAt: null, top: [1, 2, 3, 4].map(rank => ({ rank, nickname: `p${rank}`, value: 10 - rank, me: false })), me: null },
    };
    show();
    await screen.findByText('p1');
    const rankCell = (name: string) => within(screen.getByText(name).closest('tr')!).getAllByRole('cell')[0];
    expect(rankCell('p3')).toHaveAttribute('data-rank-tone', 'gold');
    expect(rankCell('p4')).toHaveAttribute('data-rank-tone', 'default');
  });

  it('목록 밖이면 하단 내 순위 바에 #순위·닉네임·값을 표시한다', async () => {
    state.results = {
      'fame:weekly': { board: 'fame', window: 'weekly', periodSupported: true, resetAt: null, top: [{ rank: 1, nickname: '가', value: 1200, me: false }], me: { rank: 57, value: 10 } },
    };
    show({ nickname: '강태공' });
    const mine = await screen.findByLabelText('내 순위');
    expect(within(mine).getByText('#57')).toHaveAttribute('data-rank-tone', 'accent');
    expect(within(mine).getByText('강태공')).toBeInTheDocument();
    expect(within(mine).getByText('10')).toBeInTheDocument();
  });

  it('상위 50위 안에서도 목록 내 행 강조와 함께 이번 주·전체 누적 모두 동일한 하단 내 순위 바를 유지한다', async () => {
    state.results = {
      'fame:weekly': { board: 'fame', window: 'weekly', periodSupported: true, resetAt: null, top: [{ rank: 1, nickname: '나', value: 5, me: true }], me: { rank: 1, value: 5 } },
      'fame:all': { board: 'fame', window: 'all', periodSupported: true, resetAt: null, top: [{ rank: 2, nickname: '나', value: 500, me: true }], me: { rank: 2, value: 500 } },
    };
    show();
    const weeklyRow = within(await screen.findByRole('table')).getByText('나').closest('tr')!;
    expect(weeklyRow).toHaveAttribute('aria-current', 'true');
    expect(weeklyRow).toHaveAttribute('data-me', 'true');
    expect(within(weeklyRow).getAllByRole('cell')[0]).toHaveAttribute('data-rank-tone', 'gold');
    expect(within(weeklyRow).getAllByRole('cell')[2].querySelector('[data-progress-count]')).toHaveAttribute('data-tone', 'gold');

    const weeklyMine = screen.getByLabelText('내 순위');
    expect(weeklyMine).toHaveAttribute('data-me', 'true');
    expect(within(weeklyMine).getByText('#1')).toHaveAttribute('data-rank-tone', 'gold');
    expect(within(weeklyMine).getByText('5')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '전체 누적' }));
    const allRow = within(await screen.findByRole('table')).getByText('나').closest('tr')!;
    expect(allRow).toHaveAttribute('aria-current', 'true');
    const allMine = screen.getByLabelText('내 순위');
    expect(allMine).toHaveAttribute('data-me', 'true');
    expect(within(allMine).getByText('#2')).toHaveAttribute('data-rank-tone', 'gold');
    expect(within(allMine).getByText('500')).toBeInTheDocument();
  });

  it('순위 기록이 없으면 로그인 사용자에게는 기간별 빈 안내를, 게스트에게는 계정 연결 안내를 같은 내 순위 슬롯에 보인다', async () => {
    state.results = {
      'fame:weekly': { board: 'fame', window: 'weekly', periodSupported: true, resetAt: null, top: [], me: null },
      'fame:all': { board: 'fame', window: 'all', periodSupported: true, resetAt: null, top: [{ rank: 1, nickname: '가', value: 1200, me: false }], me: null },
    };
    show({ guest: false });
    const weeklyEmptyMine = await screen.findByLabelText('내 순위');
    expect(weeklyEmptyMine).toHaveAttribute('data-me', 'false');
    expect(weeklyEmptyMine).toHaveTextContent('이번 주 순위 기록이 아직 없어요.');

    fireEvent.click(screen.getByRole('button', { name: '전체 누적' }));
    await screen.findByText('1,200');
    const allEmptyMine = screen.getByLabelText('내 순위');
    expect(allEmptyMine).toHaveAttribute('data-me', 'false');
    expect(allEmptyMine).toHaveTextContent('전체 누적 기록이 아직 없어요.');

    cleanup();
    show({ guest: true });
    const guestWeeklyMine = await screen.findByLabelText('내 순위');
    expect(guestWeeklyMine).toHaveAttribute('data-me', 'false');
    expect(guestWeeklyMine).toHaveTextContent('구글 계정을 연결하면 내 순위를 기록할 수 있어요.');

    fireEvent.click(screen.getByRole('button', { name: '전체 누적' }));
    await screen.findByText('1,200');
    expect(screen.getByLabelText('내 순위')).toHaveTextContent('구글 계정을 연결하면 내 순위를 기록할 수 있어요.');
  });

  it('불러오는 동안 로딩 표시를 보인다', () => {
    state.pending = true;
    show();
    expect(screen.getByRole('status', { name: '불러오는 중' })).toBeInTheDocument();
  });

  it('조회 실패 시 오류 안내와 다시 시도 버튼을 보이고, 빈 목록이면 빈 상태 안내를 보인다', async () => {
    state.errors.add('fame');
    state.results = {
      'fame:weekly': { board: 'fame', window: 'weekly', periodSupported: true, resetAt: null, top: [{ rank: 1, nickname: '가', value: 1200, me: false }], me: null },
      'namedClears:weekly': { board: 'namedClears', window: 'weekly', periodSupported: true, resetAt: null, top: [], me: null },
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
      'dex:all': { board: 'dex', window: 'all', periodSupported: false, resetAt: null, top: [{ rank: 1, nickname: '아주긴닉네임예시', value: 117, me: false }], me: { rank: 42, value: 88 } },
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
