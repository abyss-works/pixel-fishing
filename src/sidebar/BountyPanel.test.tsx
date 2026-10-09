// 수배판 패널 — 일일 의뢰 3열·네임드 카드·조건 게이트.
// 테스트 환경엔 supabase가 없어 readBounty가 null이다 — 티켓·진행은 빈 값으로,
// 조건 게이팅(순수 판정)과 화면 구조를 여기서 고정한다.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import BountyPanel from './BountyPanel';
import { kstDay } from '../api';
import { dailyQuestFor } from '../data/bounties';
import { newState } from '../game/logic';
import type { GameState } from '../game/logic';
import type { BountySnapshot } from '../api';

afterEach(() => { cleanup(); mockSnap = null; });

let mockSnap: BountySnapshot | null = null;
vi.mock('../api', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../api')>();
  return { ...mod, readBounty: () => Promise.resolve(mockSnap) };
});

const game = (over: Partial<GameState> = {}): GameState => ({ ...newState(), ...over });
const okDispatch = (g: GameState) => () => ({ status: 'ok' as const, state: g, result: { type: 'none' as const } });
const rec = (count: number) => ({ count, maxSize: null, first: null });
// 태평양 일반 3종 완성 (고등어·갈치·아귀)
const fullDex = { mackerel: { normal: rec(1) }, hairtail: { normal: rec(1) }, anglerfish: { normal: rec(1) } };

function show(g: GameState) {
  const setToast = vi.fn();
  render(<BountyPanel game={g} port="harbor" uid="test-uid"
                      dispatch={okDispatch(g)} setToast={setToast} />);
  return { setToast };
}

describe('BountyPanel', () => {
  it('일반 화면 — 난이도당 1행씩 3열을 보인다', async () => {
    show(game({ fame: 1500, dex: fullDex }));
    expect(await screen.findByText(/수배 · 쉬움/)).toBeInTheDocument();
    expect(screen.getByText(/수배 · 보통/)).toBeInTheDocument();
    expect(screen.getByText(/수배 · 어려움/)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '수주하기' })).toHaveLength(3);
  });

  it('일일 의뢰 — 해시 결정값을 그대로 보인다', async () => {
    show(game({ fame: 1500, dex: fullDex }));
    const day = kstDay();
    for (const d of ['easy', 'normal', 'hard'] as const) {
      const q = dailyQuestFor('pacific', d, 'test-uid', day)!;
      expect(await screen.findByText(`×${q.count}`)).toBeInTheDocument();
    }
  });

  it('조건 미충족이면 본문을 가리고 조건 리스트를 덮는다', async () => {
    show(game({ fame: 0 }));
    expect(await screen.findByText('명성 1500')).toBeInTheDocument();
    expect(screen.getByText(/일반 도감 0\/3/)).toBeInTheDocument();
    // 본문은 blur+pointer-events-none으로 가려진다
    const blurred = document.querySelector('.blur-sm.pointer-events-none');
    expect(blurred).not.toBeNull();
    expect(blurred?.getAttribute('aria-hidden')).toBe('true');
  });

  it('수주 버튼을 누르면 acceptQuest를 보낸다', async () => {
    mockSnap = { licensed: [], acceptsToday: 0, acceptsByPort: {}, progress: [] };
    const g = game({ fame: 1500, dex: fullDex });
    const dispatch = vi.fn(okDispatch(g));
    const setToast = vi.fn();
    render(<BountyPanel game={g} port="harbor" uid="test-uid"
                        dispatch={dispatch} setToast={setToast} />);
    const btns = await screen.findAllByRole('button', { name: '수주하기' });
    fireEvent.click(btns[0]);
    const want = dailyQuestFor('pacific', 'easy', 'test-uid', kstDay())!;
    await waitFor(() => expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'acceptQuest', questId: want.id, port: 'harbor' })));
  });

  it('네임드 화면 — 로어는 보이고 이름은 ??? 다', async () => {
    show(game({ fame: 1500, dex: fullDex }));
    fireEvent.click(await screen.findByRole('button', { name: '네임드 의뢰' }));
    expect(screen.getByText('???')).toBeInTheDocument();
    expect(screen.getByText(/깊은 곳의 그림자/)).toBeInTheDocument();
    expect(screen.getByText(/8000G/)).toBeInTheDocument();
  });
});
