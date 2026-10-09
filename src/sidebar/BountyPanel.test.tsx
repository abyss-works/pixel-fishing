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
const rec = (count: number) => ({ count, maxSize: null, first: null });
// 태평양 일반 3종 완성 (고등어·갈치·아귀)
const fullDex = { mackerel: { normal: rec(1) }, hairtail: { normal: rec(1) }, anglerfish: { normal: rec(1) } };

function show(g: GameState) {
  const setToast = vi.fn();
  render(<BountyPanel game={g} port="harbor" dispatch={okDispatch(g)} setToast={setToast} />);
  return { setToast };
}

describe('BountyPanel', () => {
  it('해역 의뢰 목록을 보인다 — 등급·수량·보상', async () => {
    show(game({ fame: 1500 }));
    expect(await screen.findByText('수배 라이선스')).toBeInTheDocument();
    expect(screen.getByText('쉬움')).toBeInTheDocument();
    expect(screen.getByText('보통')).toBeInTheDocument();
    expect(screen.getByText('어려움')).toBeInTheDocument();
    expect(screen.getAllByText(/일반 250마리/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/500G/).length).toBeGreaterThan(0);
  });

  it('네임드 화면 — 미발견이면 실루엣·로어 대신 안내, 보상 표시', async () => {
    show(game({ fame: 1500 }));
    fireEvent.click(await screen.findByRole('button', { name: '네임드 의뢰' }));
    expect(screen.getByText('???')).toBeInTheDocument();
    expect(screen.getByText(/수배서에만 이름이 돈다/)).toBeInTheDocument();
    expect(screen.getByText(/8000G/)).toBeInTheDocument();
  });

  it('네임드 화면 — 발견했으면 이름·로어 표시', async () => {
    show(game({ fame: 1500, dex: { megalodon: { normal: rec(1) } } }));
    fireEvent.click(await screen.findByRole('button', { name: '네임드 의뢰' }));
    expect(screen.getByText('메갈로돈')).toBeInTheDocument();
    expect(screen.getByText(/깊은 곳의 그림자/)).toBeInTheDocument();
  });

  it('명성 미달이면 라이선스 버튼이 잠긴다', async () => {
    show(game({ fame: 100, dex: fullDex }));
    const btns = await screen.findAllByRole('button', { name: /라이선스 받기/ });
    expect(btns[0]).toBeDisabled();
  });

  it('도감 미완이면 라이선스 버튼이 잠긴다', async () => {
    show(game({ fame: 1500 }));
    const btns = await screen.findAllByRole('button', { name: /라이선스 받기/ });
    expect(btns[0]).toBeDisabled();
  });

  it('조건을 모두 만족하면 라이선스 버튼이 열린다', async () => {
    show(game({ fame: 1500, dex: fullDex }));
    const btns = await screen.findAllByRole('button', { name: /라이선스 받기/ });
    expect(btns[0]).not.toBeDisabled();
  });

  it('조건 체크리스트를 보인다 — 달성/미달 구분', async () => {
    show(game({ fame: 1500 }));
    expect(await screen.findByText('수배 라이선스')).toBeInTheDocument();
    expect(screen.getByText('지명수배 라이선스')).toBeInTheDocument();
    expect(screen.getAllByText('명성 1500')).toHaveLength(2); // 기본·지명수배 공통
    expect(screen.getByText(/일반 도감 0\/3/)).toBeInTheDocument();
  });

  it('오프라인이면 조회 불가 안내를 띄운다', async () => {
    show(game({ fame: 1500 }));
    expect(await screen.findByText(/오프라인에서는 라이선스만 받을 수 있다/)).toBeInTheDocument();
  });

  it('수주 버튼을 누르면 acceptQuest를 보낸다', async () => {
    mockSnap = { licensed: [{ zone: 'pacific', tier: 'basic' }], acceptsToday: 0, acceptsByPort: {}, progress: [] };
    const g = game({ fame: 1500 });
    const dispatch = vi.fn(okDispatch(g));
    const setToast = vi.fn();
    render(<BountyPanel game={g} port="harbor" dispatch={dispatch} setToast={setToast} />);
    const btns = await screen.findAllByRole('button', { name: '수주하기' });
    fireEvent.click(btns[0]); // pacific-easy-common (쉬움 첫행)
    await waitFor(() => expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'acceptQuest', questId: 'pacific-easy-common', port: 'harbor' })));
  });
});
