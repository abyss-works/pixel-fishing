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
    expect(await screen.findByText('쉬움')).toBeInTheDocument();
    expect(screen.getByText('보통')).toBeInTheDocument();
    expect(screen.getByText('어려움')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '수주하기' })).toHaveLength(3);
  });

  it('일일 의뢰 — 해시 결정값을 그대로 보인다', async () => {
    show(game({ fame: 1500, dex: fullDex }));
    const day = kstDay();
    for (const d of ['easy', 'normal', 'hard'] as const) {
      const q = dailyQuestFor('pacific', d, 'test-uid', day)!;
      expect(await screen.findByText(new RegExp(`x ${q.count}$`))).toBeInTheDocument();
    }
  });

  it('조건 미충족이면 본문을 가리고 조건 리스트를 덮는다', async () => {
    show(game({ fame: 0 }));
    expect(await screen.findByText('명성 1500 달성')).toBeInTheDocument();
    expect(screen.getByText('태평양 모든 어종 수집(전설 제외)')).toBeInTheDocument();
    // 본문은 blur+pointer-events-none으로 가려진다
    const blurred = document.querySelector('.blur-sm.pointer-events-none');
    expect(blurred).not.toBeNull();
    expect(blurred?.getAttribute('aria-hidden')).toBe('true');
  });

  it('체크 방향 — 달성 조건은 체크+취소선, 미달은 빈박스', async () => {
    show(game({ fame: 1500 })); // 명성만 달성, 도감 비어 있음
    const fameLi = (await screen.findByText('명성 1500 달성')).closest('li')!;
    const dexLi = screen.getByText('태평양 모든 어종 수집(전설 제외)').closest('li')!;
    expect(fameLi.className).toMatch(/line-through/);
    expect(dexLi.className).not.toMatch(/line-through/);
  });

  it('수주 버튼을 누르면 acceptQuest를 보낸다', async () => {
    mockSnap = { licensed: [], acceptsToday: 0, namedToday: 0, progress: [], tickets: [] };
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

  it('네임드 화면 — 이름은 초상화 아래 ???, 본문은 수배서 전용 문구다', async () => {
    show(game({ fame: 1500, dex: fullDex }));
    fireEvent.click(await screen.findByRole('button', { name: '네임드 의뢰' }));
    expect(screen.getByText('???')).toBeInTheDocument();
    expect(screen.getByText(/건져 올린 그물은/)).toBeInTheDocument();
    expect(screen.getByText(/40000G/)).toBeInTheDocument();
  });

  it('유물 화면 — 해역 유물 카드와 교환 버튼을 보인다', async () => {
    show(game({ fame: 1500, dex: fullDex }));
    fireEvent.click(await screen.findByRole('button', { name: '유물' }));
    expect(screen.getByText('심해아귀')).toBeInTheDocument();
    expect(screen.getByText(/아귀의 등불 보유 0\/1/)).toBeInTheDocument();
    // 재료 없으면 교환 불가
    expect(screen.getByRole('button', { name: '교환하기' })).toBeDisabled();
  });

  it('재료가 있으면 교환하기가 exchangeArtifact를 보낸다', async () => {
    mockSnap = { licensed: [], acceptsToday: 0, namedToday: 0, progress: [], tickets: [] };
    const g = game({ fame: 1500, dex: fullDex, items: { 'mat-abyss-lantern': 1 } });
    const dispatch = vi.fn(okDispatch(g));
    const setToast = vi.fn();
    render(<BountyPanel game={g} port="harbor" uid="test-uid"
                        dispatch={dispatch} setToast={setToast} />);
    fireEvent.click(await screen.findByRole('button', { name: '유물' }));
    fireEvent.click(await screen.findByRole('button', { name: '교환하기' }));
    await waitFor(() => expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'exchangeArtifact', artifact: 'abyss-angler' })));
  });

  it('도전권이 있으면 네임드 카드에 잔여와 도전 시작이 보인다', async () => {
    mockSnap = {
      licensed: [], acceptsToday: 0, namedToday: 0, progress: [],
      tickets: [{ questId: 'pacific-named-megalodon', issuedAt: new Date(Date.now() - 60_000).toISOString() }],
    };
    // 네임드 개방 상태에서 배너가 보이는지 본다
    const rec = (count: number) => ({ count, maxSize: null, first: null });
    const named = (id: string) => ({ [id]: { normal: rec(1) } });
    const dex = Object.assign({ mackerel: { normal: rec(1) }, hairtail: { normal: rec(1) }, anglerfish: { normal: rec(1) } },
      named('seabream'), named('yellowtail'), named('squid'),
      named('tuna'), named('coelacanth'), named('oarfish'),
      named('shark'), named('kraken'), named('moonveil'), named('abyssveil'));
    show(game({ fame: 1500, dex }));
    fireEvent.click(await screen.findByRole('button', { name: '네임드 의뢰' }));
    expect(screen.getByText(/도전권 유효/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '도전 시작' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('네임드 수주권을 다 쓰면 네임드 수주 버튼이 막힌다', async () => {
    mockSnap = { licensed: [], acceptsToday: 0, namedToday: 1, progress: [], tickets: [] };
    // 네임드 개방(전설 포함 전부) 상태에서 티켓 소진만으로 막히는지 본다
    const rec = (count: number) => ({ count, maxSize: null, first: null });
    const named = (id: string) => ({ [id]: { normal: rec(1) } });
    const dex = Object.assign({ mackerel: { normal: rec(1) }, hairtail: { normal: rec(1) }, anglerfish: { normal: rec(1) } },
      named('seabream'), named('yellowtail'), named('squid'),
      named('tuna'), named('coelacanth'), named('oarfish'),
      named('shark'), named('kraken'), named('moonveil'), named('abyssveil'));
    show(game({ fame: 1500, dex }));
    fireEvent.click(await screen.findByRole('button', { name: '네임드 의뢰' }));
    expect(await screen.findByRole('button', { name: '수주하기' })).toBeDisabled();
  });
});
