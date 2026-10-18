import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FISH, newState } from '../../../../../game/rules/logic';

const state = vi.hoisted(() => ({ result: null as unknown, asked: [] as unknown[] }));
vi.mock('../../../../../platform/api', async importOriginal => {
  const mod = await importOriginal<typeof import('../../../../../platform/api')>();
  return { ...mod, readRanking: async (...args: unknown[]) => { state.asked.push(args); return state.result; } };
});

import DexDetail from './DexDetail';

const fish = FISH[0];
const game = { ...newState(), dex: { [fish.id]: { normal: { count: 3, maxSize: 20, first: '2026-01-01' } } } };

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><DexDetail fish={fish} game={game} onClose={() => {}} /></QueryClientProvider>);
}

describe('도감 상세의 크기 순위', () => {
  afterEach(() => { cleanup(); state.result = null; state.asked = []; });

  it('그 어종의 크기 순위를 보여 주고 내 행을 강조한다', async () => {
    state.result = { board: 'species', fishId: fish.id, top: [
      { rank: 1, nickname: '가', value: 33.25, me: false },
      { rank: 2, nickname: '나', value: 20, me: true },
    ], me: { rank: 2, value: 20 } };
    show();
    expect(await screen.findByText('33.3cm')).toBeInTheDocument();
    expect(screen.getByText('나').closest('tr')).toHaveAttribute('aria-current', 'true');
    expect(state.asked).toEqual([['species', fish.id]]);
  });

  it('크기 분포에 내 최대 기록의 상위 백분율을 표시한다', async () => {
    show();
    expect(await screen.findByText(/^상위 [\d.]+%$/)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /내 최대 기록 20\.0cm/ })).toBeInTheDocument();
  });

  it('로컬 모드에서는 순위 구역을 숨긴다', async () => {
    state.result = null;
    show();
    await waitFor(() => expect(state.asked).toHaveLength(1));
    await new Promise(r => setTimeout(r, 0));
    expect(screen.queryByText('크기 순위')).not.toBeInTheDocument();
  });
});
