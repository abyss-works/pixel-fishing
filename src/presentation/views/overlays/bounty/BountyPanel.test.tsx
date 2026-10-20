// 수배판 패널 — 일일 의뢰 3열·네임드 카드·조건 게이트.
// 테스트 환경엔 supabase가 없어 readBounty가 null이다 — 티켓·진행은 빈 값으로,
// 조건 게이팅(순수 판정)과 화면 구조를 여기서 고정한다.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import BountyPanel from './BountyPanel';
import { gameDay } from '../../../../features/bounty/service/queryKeys';
import { BOUNTIES, dailyQuestFor } from '../../../../game/content/bounties';
import { newState } from '../../../../game/rules/logic';
import type { GameState } from '../../../../game/rules/logic';
import type { BountySnapshot } from '../../../../features/bounty/model/types';

afterEach(() => { cleanup(); mockSnap = null; });

let mockSnap: BountySnapshot | null = null;
vi.mock('../../../../platform/api', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../../../platform/api')>();
  return { ...mod, readBounty: () => Promise.resolve(mockSnap) };
});

const game = (over: Partial<GameState> = {}): GameState => ({ ...newState(), ...over });
const okDispatch = (g: GameState) => () => ({ status: 'ok' as const, state: g, result: { type: 'none' as const } });
const rec = (count: number) => ({ count, maxSize: null, first: null });
// 태평양 전설 제외 전부 (일반 폼) — 기본 라이선스 도감 조건. 일반 3 · 희귀 3 · 영웅 3
const fullDex = {
  mackerel: { normal: rec(1) }, hairtail: { normal: rec(1) }, anglerfish: { normal: rec(1) },
  seabream: { normal: rec(1) }, yellowtail: { normal: rec(1) }, squid: { normal: rec(1) },
  tuna: { normal: rec(1) }, coelacanth: { normal: rec(1) }, oarfish: { normal: rec(1) },
};

function show(g: GameState, dispatch?: ReturnType<typeof okDispatch>) {
  const setToast = vi.fn();
  // useBounty(useQuery)용 격리 클라이언트 — 테스트마다 새로 만든다 (캐시 공유 금지).
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <BountyPanel game={g} port="harbor" uid="test-uid"
                   dispatch={dispatch ?? okDispatch(g)} setToast={setToast} />
    </QueryClientProvider>,
  );
  return { setToast };
}

describe('BountyPanel', () => {
  it('일반 화면 — 난이도당 1행씩 3열을 보인다', async () => {
    show(game({ fame: 1500, dex: fullDex }));
    expect(await screen.findByText('쉬움')).toBeInTheDocument();
    expect(screen.getByText('보통')).toBeInTheDocument();
    expect(screen.getByText('어려움')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '수주' })).toHaveLength(3);
  });

  it('수주한 일반 의뢰는 진행도 0이어도 진행 중과 진행 상황을 보이고 다시 수주할 수 없다', async () => {
    const quest = dailyQuestFor('pacific', 'easy', 'test-uid', gameDay())!;
    mockSnap = { clearsToday: { general: 0, named: 0 },
      progress: [{ questId: quest.id, progress: 0 }], tickets: [] };
    show(game({ fame: 1500, dex: fullDex }));
    expect(await screen.findByText(`0/${quest.count}`)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '진행 중' })).toBeDisabled();
    // 일반 의뢰는 한 번에 하나 — 나머지 두 난이도는 보이지만 누를 수 없다
    const others = screen.getAllByRole('button', { name: '수주' });
    expect(others).toHaveLength(2);
    for (const button of others) expect(button).toBeDisabled();
  });

  it('수주만으로는 오늘 남은 클리어가 줄지 않는다 — 상태 줄은 일반 1/1 · 네임드 1/1이다', async () => {
    const quest = dailyQuestFor('pacific', 'easy', 'test-uid', gameDay())!;
    mockSnap = { clearsToday: { general: 0, named: 0 }, progress: [{ questId: quest.id, progress: 0 }], tickets: [] };
    show(game({ fame: 1500, dex: fullDex }));
    expect(await screen.findByText('오늘 남은 클리어 일반 1/1 · 네임드 1/1')).toBeInTheDocument();
  });

  it('스냅샷이 오기 전에는 상태 줄이 값 대신 —를 보인다', async () => {
    show(game({ fame: 1500, dex: fullDex }));
    expect(await screen.findByText('오늘 남은 클리어 —')).toBeInTheDocument();
  });

  it('마치지 못한 의뢰가 한국 시간 새벽 4시에 사라진다는 안내가 있다', async () => {
    show(game({ fame: 1500, dex: fullDex }));
    expect(await screen.findByText('조건을 채우지 못한 의뢰는 한국 시간 새벽 4시에 사라져요. 보상을 받으면 클리어 1번이에요.')).toBeInTheDocument();
  });

  it('일반 의뢰를 오늘 클리어했으면 수주 버튼이 모두 막히고 이유를 안내한다', async () => {
    mockSnap = { clearsToday: { general: 1, named: 0 }, progress: [], tickets: [] };
    show(game({ fame: 1500, dex: fullDex }));
    expect(await screen.findByText('오늘 일반 의뢰는 이미 마쳤어요. 한국 시간 새벽 4시가 지나면 다시 수주할 수 있어요.')).toBeInTheDocument();
    expect(screen.getByText('오늘 남은 클리어 일반 0/1 · 네임드 1/1')).toBeInTheDocument();
    for (const button of screen.getAllByRole('button', { name: '수주' })) expect(button).toBeDisabled();
  });

  it('다른 구역에서 수주한 일반 의뢰가 진행 중이면 이 판의 수주가 막히고 이유를 안내한다', async () => {
    const held = dailyQuestFor('seasia', 'hard', 'test-uid', gameDay())!;
    mockSnap = { clearsToday: { general: 0, named: 0 }, progress: [{ questId: held.id, progress: 0 }], tickets: [] };
    show(game({ fame: 1500, dex: fullDex }));
    expect(await screen.findByText('동남아에서 수주한 일반 의뢰가 있어요. 그 구역의 수배판에서 먼저 마쳐 주세요.')).toBeInTheDocument();
    for (const button of screen.getAllByRole('button', { name: '수주' })) expect(button).toBeDisabled();
  });

  it('날이 바뀐 뒤에도 마친 의뢰는 오늘의 의뢰와 달라도 그 칸에 보이고 납품할 수 있다', async () => {
    const today = dailyQuestFor('pacific', 'normal', 'test-uid', gameDay())!;
    const old = BOUNTIES.find(q => q.zone === 'pacific' && q.difficulty === 'normal' && q.id !== today.id)!;
    mockSnap = { clearsToday: { general: 0, named: 0 }, progress: [{ questId: old.id, progress: old.count }], tickets: [] };
    const g = game({ fame: 1500, dex: fullDex });
    const dispatch = vi.fn(okDispatch(g));
    show(g, dispatch);
    fireEvent.click(await screen.findByRole('button', { name: '납품' }));
    await waitFor(() => expect(dispatch).toHaveBeenCalledWith({ type: 'deliverBounty', questId: old.id }));
  });

  it('일일 의뢰 — 해시 결정값을 그대로 보인다', async () => {
    show(game({ fame: 1500, dex: fullDex }));
    const day = gameDay();
    const expected = (['easy', 'normal', 'hard'] as const)
      .map(difficulty => dailyQuestFor('pacific', difficulty, 'test-uid', day)!.count)
      .sort((a, b) => a - b);
    const displayed = await screen.findAllByText(/^[\d,]+마리$/);
    const actual = displayed
      .map(quantity => Number(quantity.textContent?.replace(/\D/g, '')))
      .sort((a, b) => a - b);
    expect(actual).toEqual(expected);
  });

  it('조건 미충족이면 본문을 가리고 조건 리스트를 덮는다', async () => {
    show(game({ fame: 0 }));
    expect(await screen.findByText('명성 1,500 달성')).toBeInTheDocument();
    expect(screen.getByText('태평양 모든 어종 수집(전설 제외, 밤 어종 포함)')).toBeInTheDocument();
    // 본문은 blur+pointer-events-none으로 가려진다
    const blurred = document.querySelector('.blur-sm.pointer-events-none');
    expect(blurred).not.toBeNull();
    expect(blurred?.getAttribute('aria-hidden')).toBe('true');
  });

  it('체크 방향 — 달성 조건은 체크+취소선, 미달은 빈박스', async () => {
    show(game({ fame: 1500 })); // 명성만 달성, 도감 비어 있음
    const fameLi = (await screen.findByText('명성 1,500 달성')).closest('li')!;
    const dexLi = screen.getByText('태평양 모든 어종 수집(전설 제외, 밤 어종 포함)').closest('li')!;
    expect(fameLi.className).toMatch(/line-through/);
    expect(dexLi.className).not.toMatch(/line-through/);
  });

  it('수주 버튼을 누르면 acceptQuest를 보낸다', async () => {
    mockSnap = { clearsToday: { general: 0, named: 0 }, progress: [], tickets: [] };
    const g = game({ fame: 1500, dex: fullDex });
    const dispatch = vi.fn(okDispatch(g));
    show(g, dispatch);
    const btns = await screen.findAllByRole('button', { name: '수주' });
    // 스냅샷 적재 전에는 수주 버튼이 비활성이다 — RQ fetch 완료를 기다린다.
    await waitFor(() => expect(btns[0]).not.toBeDisabled());
    fireEvent.click(btns[0]);
    const want = dailyQuestFor('pacific', 'easy', 'test-uid', gameDay())!;
    await waitFor(() => expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'acceptQuest', questId: want.id, port: 'harbor' })));
  });

  it('네임드 화면 — 이름은 초상화 아래 ???, 본문은 수배서 전용 문구다', async () => {
    show(game({ fame: 1500, dex: fullDex }));
    fireEvent.click(await screen.findByRole('button', { name: '네임드 토벌' }));
    expect(screen.getByText('???')).toBeInTheDocument();
    expect(screen.getByText(/걷어 올린 그물은/)).toBeInTheDocument();
    expect(screen.getByText(/400,000G/)).toBeInTheDocument();
  });

  it('유물 화면 — 해역 유물 카드와 교환 버튼을 보인다', async () => {
    show(game({ fame: 1500, dex: fullDex }));
    fireEvent.click(await screen.findByRole('button', { name: '유물' }));
    expect(screen.getByText('해구의 이빨')).toBeInTheDocument();
    expect(screen.getByText(/돌이 된 이빨 보유 0\/1/)).toBeInTheDocument();
    // 재료 없으면 교환 불가
    expect(screen.getByRole('button', { name: '교환' })).toBeDisabled();
  });

  it('재료가 있으면 교환하기가 exchangeArtifact를 보낸다', async () => {
    mockSnap = { clearsToday: { general: 0, named: 0 }, progress: [], tickets: [] };
    const g = game({ fame: 1500, dex: fullDex, items: { 'mat-abyss-lantern': 1 } });
    const dispatch = vi.fn(okDispatch(g));
    show(g, dispatch);
    fireEvent.click(await screen.findByRole('button', { name: '유물' }));
    fireEvent.click(await screen.findByRole('button', { name: '교환' }));
    await waitFor(() => expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'exchangeArtifact', artifact: 'abyss-angler' })));
  });

  it('흔적(도전권)이 있으면 네임드 카드에 상태 한 줄만 보이고 도전 버튼은 없다 — 도전은 바다에서 치른다', async () => {
    mockSnap = {
      clearsToday: { general: 0, named: 0 }, progress: [],
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
    fireEvent.click(await screen.findByRole('button', { name: '네임드 토벌' }));
    // 스냅샷은 세션 게이트가 선 뒤 도착한다
    expect(await screen.findByText(/흔적이 남아 있어요. 이 구역 바다로 나가 흔적 카드의 추적을 눌러 보세요/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '도전 시작' })).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('오늘 네임드 토벌을 클리어했으면 네임드 수주 버튼이 막히고 이유를 안내한다', async () => {
    mockSnap = { clearsToday: { general: 0, named: 1 }, progress: [], tickets: [] };
    // 네임드 개방(전설 포함 전부) 상태에서 한도 소진만으로 막히는지 본다
    const rec = (count: number) => ({ count, maxSize: null, first: null });
    const named = (id: string) => ({ [id]: { normal: rec(1) } });
    const dex = Object.assign({ mackerel: { normal: rec(1) }, hairtail: { normal: rec(1) }, anglerfish: { normal: rec(1) } },
      named('seabream'), named('yellowtail'), named('squid'),
      named('tuna'), named('coelacanth'), named('oarfish'),
      named('shark'), named('kraken'), named('moonveil'), named('abyssveil'));
    show(game({ fame: 1500, dex }));
    fireEvent.click(await screen.findByRole('button', { name: '네임드 토벌' }));
    // 스냅샷이 오기 전에도 버튼은 막혀 있으므로 안내가 뜰 때까지 기다린 뒤 버튼을 본다
    expect(await screen.findByText('오늘 네임드 토벌은 이미 마쳤어요. 한국 시간 새벽 4시가 지나면 다시 수주할 수 있어요.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '수주' })).toBeDisabled();
  });
});
