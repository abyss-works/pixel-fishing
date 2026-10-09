// 수배판 패널 — 라이선스·수주·납품의 상태 전이 (서버 권위, 표시++조회는 RLS).
// 테스트 환경엔 supabase가 없어 readBounty가 null이다 — 오프라인 경로와
// 라이선스(순수 판정) 경로만 여기서 고정하고, 온라인 전이는 앱 QA에서 본다.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import BountyPanel from './BountyPanel';
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

function show(g: GameState) {
  const setToast = vi.fn();
  render(<BountyPanel game={g} port="harbor" dispatch={okDispatch(g)} setToast={setToast} />);
  return { setToast };
}

describe('BountyPanel', () => {
  it('해역 의뢰 목록을 보인다 — 등급·수량·보상', async () => {
    show(game({ fame: 1500 }));
    expect(await screen.findByText('수배판 · 태평양')).toBeInTheDocument();
    expect(screen.getAllByText(/일반 250마리/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/500G/).length).toBeGreaterThan(0);
  });

  it('명성 미달이면 라이선스 버튼이 잠긴다', async () => {
    show(game({ fame: 100 }));
    const btn = await screen.findByRole('button', { name: /라이선스 받기/ });
    expect(btn).toBeDisabled();
  });

  it('명성이 되면 라이선스 버튼이 열린다', async () => {
    show(game({ fame: 1500 }));
    const btn = await screen.findByRole('button', { name: /라이선스 받기/ });
    expect(btn).not.toBeDisabled();
  });

  it('오프라인이면 조회 불가 안내를 띄운다', async () => {
    show(game({ fame: 1500 }));
    expect(await screen.findByText(/오프라인에서는 라이선스만 받을 수 있다/)).toBeInTheDocument();
  });

  it('수주 버튼을 누르면 acceptQuest를 보낸다', async () => {
    mockSnap = { licensed: ['pacific'], acceptsToday: 0, acceptsByPort: {}, progress: [] };
    const g = game({ fame: 1500 });
    const dispatch = vi.fn(okDispatch(g));
    const setToast = vi.fn();
    render(<BountyPanel game={g} port="harbor" dispatch={dispatch} setToast={setToast} />);
    fireEvent.click(await screen.findByRole('button', { name: /수주 · 일반 250마리/ }));
    await waitFor(() => expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'acceptQuest', questId: 'pacific-easy-common', port: 'harbor' })));
  });
});
