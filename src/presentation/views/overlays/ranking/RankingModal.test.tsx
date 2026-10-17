import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FISH } from '../../../../game/rules/logic';

const state = vi.hoisted(() => ({ result: null as unknown }));
vi.mock('../../../../platform/api', async importOriginal => {
  const mod = await importOriginal<typeof import('../../../../platform/api')>();
  return { ...mod, readRanking: async () => state.result };
});

import RankingModal from './RankingModal';

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><RankingModal onClose={() => {}} /></QueryClientProvider>);
}

describe('랭킹 창', () => {
  afterEach(() => { cleanup(); state.result = null; });

  it('상위 목록을 그리고 내 행을 표시하며, 목록 밖이면 내 순위를 따로 보여 준다', async () => {
    state.result = {
      board: 'fame',
      top: [{ rank: 1, nickname: '가', value: 1200, me: false }, { rank: 2, nickname: '나', value: 300, me: false }],
      me: { rank: 57, value: 10 },
    };
    show();
    expect(await screen.findByText('가')).toBeInTheDocument();
    expect(screen.getByText('1,200')).toBeInTheDocument();
    expect(screen.getByText('내 순위 57위 · 10')).toBeInTheDocument();
  });

  it('상위 목록 안의 내 행은 강조하고 따로 반복하지 않는다', async () => {
    state.result = { board: 'fame', top: [{ rank: 1, nickname: '나', value: 5, me: true }], me: { rank: 1, value: 5 } };
    show();
    expect((await screen.findByText('나')).closest('tr')).toHaveAttribute('aria-current', 'true');
    expect(screen.queryByText(/내 순위/)).not.toBeInTheDocument();
  });

  it('월척 탭은 어종 이름과 크기·주인을 보여 준다', async () => {
    state.result = { board: 'biggest', species: [{ fishId: FISH[0].id, size: 12.34, nickname: '가', me: false }] };
    show();
    fireEvent.click(screen.getByRole('button', { name: '월척' }));
    expect(await screen.findByText('12.3cm')).toBeInTheDocument();
    expect(screen.getByText(FISH[0].name, { exact: false })).toBeInTheDocument();
  });

  it('로컬 모드(조회 결과 없음)는 온라인 안내를 띄운다', async () => {
    state.result = null;
    show();
    expect(await screen.findByText('랭킹은 온라인에서만 볼 수 있어요.')).toBeInTheDocument();
  });
});
