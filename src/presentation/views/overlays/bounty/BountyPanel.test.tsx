// 수배판 패널 — 고정 정보 줄·일일 의뢰 3열·네임드 카드·조건 게이트.
// 테스트 환경은 클라우드 빌드가 아니라 readBounty가 null이다 — 티켓·진행은 빈 값으로,
// 조건 게이팅(순수 판정)과 화면 구조를 여기서 고정한다.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import BountyPanel from './BountyPanel';
import { gameDay } from '../../../../features/bounty/service/queryKeys';
import { BOUNTIES, dailyQuestFor } from '../../../../game/content/bounties';
import { artifactById } from '../../../../game/content/artifacts';
import { artifactEffectValue } from '../../../ui/artifactEffects';
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
// 태평양 전설을 뺀 전부 (일반 모습) — 네임드 라이선스 도감 조건. 일반 3 · 희귀 3 · 영웅 3
const fullDex = {
  mackerel: { normal: rec(1) }, hairtail: { normal: rec(1) }, anglerfish: { normal: rec(1) },
  seabream: { normal: rec(1) }, yellowtail: { normal: rec(1) }, squid: { normal: rec(1) },
  tuna: { normal: rec(1) }, coelacanth: { normal: rec(1) }, oarfish: { normal: rec(1) },
};
const missingEpicDex = {
  mackerel: { normal: rec(1) }, hairtail: { normal: rec(1) }, anglerfish: { normal: rec(1) },
  seabream: { normal: rec(1) }, yellowtail: { normal: rec(1) }, squid: { normal: rec(1) },
  tuna: { normal: rec(1) }, coelacanth: { normal: rec(1) },
};

/** 요소에 마우스를 올려 뜬 게임 툴팁의 글을 돌려준다 */
const tipOf = (el: HTMLElement): string => {
  fireEvent.mouseEnter(el);
  return screen.getByRole('tooltip').textContent ?? '';
};
/** 버튼을 감싼 툴팁 자리 */
const tipOfButton = (button: HTMLElement): string => tipOf(button.parentElement!);

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
    show(game({ dex: fullDex }));
    expect(await screen.findByText('쉬움')).toBeInTheDocument();
    expect(screen.getByText('보통')).toBeInTheDocument();
    expect(screen.getByText('어려움')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '수주' })).toHaveLength(3);
  });

  it('수주한 일반 의뢰는 진행도 0이어도 진행 중과 진행 상황을 보이고 다시 수주할 수 없다', async () => {
    const quest = dailyQuestFor('pacific', 'easy', 'test-uid', gameDay())!;
    mockSnap = { clearsToday: { general: 0, named: 0 },
      progress: [{ questId: quest.id, progress: 0 }], tickets: [] };
    show(game({ dex: fullDex }));
    const button = await screen.findByRole('button', { name: '진행 중' });
    expect(button).toBeDisabled();
    expect(button.closest('div')?.parentElement).toHaveTextContent(`0/${quest.count}`);
    // 일반 의뢰는 한 번에 하나 — 나머지 두 난이도는 보이지만 누를 수 없다
    const others = screen.getAllByRole('button', { name: '수주' });
    expect(others).toHaveLength(2);
    for (const button of others) expect(button).toBeDisabled();
  });

  it('고정 정보 줄 — 구역과 오늘 남은 클리어. 수주만으로는 남은 클리어가 줄지 않는다', async () => {
    const quest = dailyQuestFor('pacific', 'easy', 'test-uid', gameDay())!;
    mockSnap = { clearsToday: { general: 0, named: 0 }, progress: [{ questId: quest.id, progress: 0 }], tickets: [] };
    show(game({ dex: fullDex }));
    await waitFor(() => expect(screen.getByLabelText('오늘 남은 일반 의뢰')).toHaveTextContent('1/1'));
    expect(screen.getByLabelText('오늘 남은 네임드 토벌')).toHaveTextContent('1/1');
    expect(screen.getByText('태평양')).toBeInTheDocument();
  });

  it('스냅샷이 오기 전에는 고정 정보 줄이 값 대신 -를 보인다', async () => {
    show(game({ dex: fullDex }));
    expect(await screen.findByLabelText('오늘 남은 일반 의뢰')).toHaveTextContent('-');
    expect(screen.getByLabelText('오늘 남은 네임드 토벌')).toHaveTextContent('-');
  });

  it('완료 기준과 마치지 못한 의뢰가 새벽 4시에 사라진다는 안내는 오늘 남은 클리어의 툴팁이다', async () => {
    show(game({ dex: fullDex }));
    const tip = tipOf(await screen.findByText('오늘 남은 클리어'));
    expect(tip).toContain('보상을 받으면 완료 1회예요.');
    expect(tip).toContain('조건을 채우지 못한 의뢰는 새벽 4시에 사라져요.');
  });

  it('일반 의뢰를 오늘 클리어했으면 수주 버튼이 모두 막히고 이유를 버튼 툴팁으로 안내한다', async () => {
    mockSnap = { clearsToday: { general: 1, named: 0 }, progress: [], tickets: [] };
    show(game({ dex: fullDex }));
    await waitFor(() => expect(screen.getByLabelText('오늘 남은 일반 의뢰')).toHaveTextContent('0/1'));
    expect(screen.getByLabelText('오늘 남은 네임드 토벌')).toHaveTextContent('1/1');
    const buttons = screen.getAllByRole('button', { name: '수주' });
    for (const button of buttons) expect(button).toBeDisabled();
    expect(tipOfButton(buttons[0])).toBe('오늘 일반 의뢰는 이미 마쳤어요.새벽 4시가 지나면 다시 수주할 수 있어요.');
  });

  it('다른 구역에서 수주한 일반 의뢰가 진행 중이면 이 판의 수주가 막히고 이유를 버튼 툴팁으로 안내한다', async () => {
    const held = dailyQuestFor('seasia', 'hard', 'test-uid', gameDay())!;
    mockSnap = { clearsToday: { general: 0, named: 0 }, progress: [{ questId: held.id, progress: 0 }], tickets: [] };
    show(game({ dex: fullDex }));
    await waitFor(() => expect(screen.getByLabelText('오늘 남은 일반 의뢰')).toHaveTextContent('1/1'));
    const buttons = screen.getAllByRole('button', { name: '수주' });
    for (const button of buttons) expect(button).toBeDisabled();
    expect(tipOfButton(buttons[0])).toBe('동남아에서 수주한 일반 의뢰가 있어요.그 구역의 수배판에서 먼저 마쳐 주세요.');
  });

  it('수주할 수 있으면 수주 버튼에 중복 안내를 달지 않고, 일반 의뢰 머리글 툴팁 한 곳에 세는 기준을 알린다', async () => {
    mockSnap = { clearsToday: { general: 0, named: 0 }, progress: [], tickets: [] };
    show(game({ dex: fullDex }));
    const buttons = await screen.findAllByRole('button', { name: '수주' });
    await waitFor(() => expect(buttons[0]).not.toBeDisabled());
    fireEvent.mouseEnter(buttons[0].parentElement!);
    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(screen.queryByText('수주 안내')).toBeNull();
    expect(tipOfButton(screen.getByRole('button', { name: '수주 안내' }))).toBe('수주한 뒤에 잡은 물고기부터 세요.물고기는 가방에 남아요.');
  });

  it('날이 바뀐 뒤에도 마친 의뢰는 오늘의 의뢰와 달라도 그 칸에 보이고 완료할 수 있다', async () => {
    const today = dailyQuestFor('pacific', 'normal', 'test-uid', gameDay())!;
    const old = BOUNTIES.find(q => q.zone === 'pacific' && q.difficulty === 'normal' && q.id !== today.id)!;
    mockSnap = { clearsToday: { general: 0, named: 0 }, progress: [{ questId: old.id, progress: old.count }], tickets: [] };
    const g = game({ dex: fullDex });
    const dispatch = vi.fn(okDispatch(g));
    show(g, dispatch);
    fireEvent.click(await screen.findByRole('button', { name: '완료' }));
    await waitFor(() => expect(dispatch).toHaveBeenCalledWith({ type: 'deliverBounty', questId: old.id }));
  });

  it('일일 의뢰 — 해시 결정값을 그대로 보인다', async () => {
    show(game({ dex: fullDex }));
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

  it('일반 의뢰 탭은 도감이 비어도 잠금 덮개나 조건 문구 없이 즉시 개방된다', async () => {
    mockSnap = { clearsToday: { general: 0, named: 0 }, progress: [], tickets: [] };
    show(game({}));
    const buttons = await screen.findAllByRole('button', { name: '수주' });
    expect(buttons).toHaveLength(3);
    await waitFor(() => expect(buttons[0]).not.toBeDisabled());
    expect(document.querySelector('.blur-sm.pointer-events-none')).toBeNull();
    expect(screen.queryByText(/모든 어종/)).toBeNull();
  });

  it('네임드 토벌 탭은 도감 조건 미충족이면 본문을 가리고 남은 종 수 체크리스트를 덮는다', async () => {
    show(game({}));
    fireEvent.click(await screen.findByRole('button', { name: '네임드 토벌' }));
    const dexLi = await screen.findByText((_, el) => el?.tagName === 'LI' && /^태평양 전설을 뺀 모든 어종 모으기 \(남은 \d+종\)$/.test(el.textContent?.trim() ?? ''));
    expect(within(dexLi).getByText('전설')).toHaveAttribute('data-rarity', 'legendary');
    expect(dexLi.querySelector('[data-glyph="checkOff"]')).not.toBeNull();
    expect(dexLi.querySelector('[data-glyph="checkOn"]')).toBeNull();
    // 본문은 blur+pointer-events-none으로 가려진다
    const blurred = document.querySelector('.blur-sm.pointer-events-none');
    expect(blurred).not.toBeNull();
    expect(blurred?.getAttribute('aria-hidden')).toBe('true');
  });

  it('네임드 토벌 탭은 영웅 어종이 하나라도 빠지면 남은 1종 조건으로 잠긴다', async () => {
    show(game({ dex: missingEpicDex }));
    fireEvent.click(await screen.findByRole('button', { name: '네임드 토벌' }));
    expect(await screen.findByText((_, el) => el?.tagName === 'LI' && el.textContent?.trim() === '태평양 전설을 뺀 모든 어종 모으기 (남은 1종)')).toBeInTheDocument();
    expect(document.querySelector('.blur-sm.pointer-events-none')).not.toBeNull();
  });

  it('네임드 토벌 탭은 전설 없이 일반·희귀·영웅 도감을 채우면 조건 목록과 가림막이 사라진다', async () => {
    show(game({ dex: fullDex }));
    fireEvent.click(await screen.findByRole('button', { name: '네임드 토벌' }));
    expect(await screen.findByRole('button', { name: '수주' })).toBeInTheDocument();
    expect(screen.queryByText(/모든 어종/)).toBeNull();
    expect(document.querySelector('.blur-sm.pointer-events-none')).toBeNull();
  });

  it('수주 버튼을 누르면 acceptQuest를 보낸다', async () => {
    mockSnap = { clearsToday: { general: 0, named: 0 }, progress: [], tickets: [] };
    const g = game({ dex: fullDex });
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

  it('네임드 화면 — 이름은 ???(클릭 시 네임드 상세 열림), 나타나는 곳과 보상과 교환 재료를 줄로 보인다', async () => {
    show(game({ dex: fullDex }));
    fireEvent.click(await screen.findByRole('button', { name: '네임드 토벌' }));
    const detailBtn = screen.getByRole('button', { name: '??? 상세 보기' });
    fireEvent.mouseEnter(screen.getByText('???'));
    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(screen.getByText('나타나는 곳')).toBeInTheDocument();
    const reward = BOUNTIES.find(q => q.zone === 'pacific' && q.difficulty === 'named')!.reward;
    expect(screen.getByText(new RegExp(`${reward.toLocaleString('en-US')}G`))).toBeInTheDocument();
    expect(screen.getByText('돌이 된 이빨')).toBeInTheDocument();

    fireEvent.click(detailBtn);
    expect(screen.getByRole('dialog')).toHaveTextContent('전해 오는 이야기');
  });

  it('유물 화면 — 해역 유물 카드와 교환 버튼을 보이고 카드 머리 클릭 시 유물 상세를 열며 교환 재료 안내는 소제목 툴팁 한 곳에 둔다', async () => {
    show(game({ dex: fullDex }));
    fireEvent.click(await screen.findByRole('button', { name: '유물' }));
    expect(screen.getByText('해구의 이빨')).toBeInTheDocument();
    expect(screen.getByText('(영웅)')).toHaveAttribute('data-rarity', 'epic');
    fireEvent.mouseEnter(screen.getByText('해구의 이빨'));
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.mouseEnter(screen.getByText('교환 재료'));
    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(screen.queryByText('교환 재료 안내')).toBeNull();
    const tipBtn = screen.getByRole('button', { name: '교환 재료 안내' });
    expect(tipOfButton(tipBtn)).toBe('교환 재료는 네임드 토벌 보상으로 받아요.');
    fireEvent.mouseLeave(tipBtn.parentElement!);

    const mat = screen.getByText(/돌이 된 이빨/);
    expect(mat).toBeInTheDocument();
    expect(mat.closest('li')).toHaveTextContent('0/1');
    // 재료 없으면 교환 불가 — 이유는 버튼 툴팁이다
    const exchange = screen.getByRole('button', { name: '교환' });
    expect(exchange).toBeDisabled();
    expect(tipOfButton(exchange)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '해구의 이빨 상세 보기' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('해구의 이빨');
    expect(dialog).toHaveTextContent('획득 시(Lv.1)');
    expect(dialog).toHaveTextContent('네임드 결투 가속');
    expect(dialog).toHaveTextContent(artifactEffectValue(artifactById('abyss-angler')!, 'duelSpeedupCut', 1)!);
    expect(dialog.textContent).not.toContain('Lv.0');
  });

  it('재료가 있으면 교환하기가 exchangeArtifact를 보낸다', async () => {
    mockSnap = { clearsToday: { general: 0, named: 0 }, progress: [], tickets: [] };
    const g = game({ dex: fullDex, items: { 'mat-abyss-lantern': 1 } });
    const dispatch = vi.fn(okDispatch(g));
    show(g, dispatch);
    fireEvent.click(await screen.findByRole('button', { name: '유물' }));
    fireEvent.click(await screen.findByRole('button', { name: '교환' }));
    await waitFor(() => expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'exchangeArtifact', artifact: 'abyss-angler' })));
  });

  it('흔적이 있으면 네임드 카드 머리에 흔적 남은 시간만 보이고 도전 버튼은 없다 — 도전은 바다에서 치른다', async () => {
    mockSnap = {
      clearsToday: { general: 0, named: 0 }, progress: [],
      tickets: [{ questId: 'pacific-named-megalodon', issuedAt: new Date(Date.now() - 60_000).toISOString() }],
    };
    // 전설 없이 비전설 도감만으로 네임드 개방 상태에서 흔적 안내가 보이는지 본다
    show(game({ dex: fullDex }));
    fireEvent.click(await screen.findByRole('button', { name: '네임드 토벌' }));
    // 스냅샷은 세션 게이트가 선 뒤 도착한다
    const trace = tipOf(await screen.findByText('흔적'));
    expect(trace).toMatch(/흔적이 남아 있어요\.이 구역 바다로 나가 흔적 카드의 추적을 눌러 보세요/);
    // 도전권은 규칙 용어라 화면 문구에 쓰지 않는다 - 카드 본문과 툴팁(흔적, 이름) 모두
    expect(trace).not.toContain('도전권');
    expect(screen.queryByText('도전권')).toBeNull();
    expect(document.body.textContent).not.toContain('도전권');
    fireEvent.mouseLeave(screen.getByText('흔적'));
    fireEvent.mouseEnter(screen.getByText('???'));
    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(screen.queryByRole('button', { name: '도전 시작' })).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('오늘 네임드 토벌을 클리어했으면 네임드 수주 버튼이 막히고 이유를 안내한다', async () => {
    mockSnap = { clearsToday: { general: 0, named: 1 }, progress: [], tickets: [] };
    // 전설 없이 비전설 도감만으로 네임드 개방 상태에서 한도 소진만으로 막히는지 본다
    show(game({ dex: fullDex }));
    fireEvent.click(await screen.findByRole('button', { name: '네임드 토벌' }));
    // 스냅샷이 오기 전에도 버튼은 막혀 있으므로 고정 정보 줄이 값을 받을 때까지 기다린 뒤 버튼을 본다
    await waitFor(() => expect(screen.getByLabelText('오늘 남은 네임드 토벌')).toHaveTextContent('0/1'));
    const accept = screen.getByRole('button', { name: '수주' });
    expect(accept).toBeDisabled();
    expect(tipOfButton(accept)).toBe('오늘 네임드 토벌은 이미 마쳤어요.새벽 4시가 지나면 다시 수주할 수 있어요.');
  });
});
