// 플레이어 정보: 현재·마지막 위치, 요약, 3개 서브탭(업적·수집품·도감 진척도)과 친구·차단·신고 동작.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ACHIEVEMENTS } from '../../../../game/content/achievements';
import { ARTIFACTS } from '../../../../game/content/artifacts';
import { FISH } from '../../../../game/content/fish';
import { HATS } from '../../../../game/content/wardrobe';
import type { PublicProfile } from '../../../../platform/api';
import PlayerModal, { PlayerInfo } from './PlayerInfo';

const s = vi.hoisted(() => ({
  relation: null as null | 'friend' | 'incoming' | 'outgoing',
  blocked: false as boolean | null,
  loading: false,
  failed: false,
  profile: {
    nickname: '갈치',
    boat: 2,
    rod: 7,
    fame: 12345,
    dexFish: ['crucian', 'minnow'],
    dexVariant: ['crucian'],
    artifacts: ['abyss-angler', 'mami-wata-mirror'],
    artifactLevels: { 'abyss-angler': 3 },
    hats: ['cap-red', 'straw-hat'],
    look: { shirt: 1, pants: 0, hat: 'straw-hat' },
    achievements: ['variant-village', 'spot-basic-pond'],
    location: { kind: 'base', id: 'harbor' },
    lastPos: null,
    online: true,
    liveRegion: 'world',
    liveZone: 'deep',
    account: true,
  } as PublicProfile,
  act: vi.fn(async () => ({ ok: true, result: 'requested' })),
  block: vi.fn(async () => null),
  report: vi.fn(async () => null),
}));

vi.mock('../../../../features/account/service/accountActions', () => ({
  isGuest: (account: string | null) => account === null,
  accountLockState: (account: string | null, accountFailed: boolean) =>
    accountFailed ? 'unverified' : account === null ? 'guest' : 'account',
}));
vi.mock('../../../../features/live/service/usePlayerProfile', () => ({
  usePlayerProfile: () => ({ profile: s.loading || s.failed ? null : s.profile, loading: s.loading, failed: s.failed }),
}));
vi.mock('../../../../features/friends/service/useFriends', () => ({
  useFriends: () => ({ groups: { friends: [], incoming: [], outgoing: [] }, offline: false, act: s.act }),
}));
vi.mock('../../../../features/friends/model/friends', async importOriginal => ({
  ...await importOriginal<object>(),
  friendRelation: () => s.relation,
}));
vi.mock('../../../../features/live/service/useChatModeration', () => ({
  useChatModeration: () => ({ isBlocked: () => s.blocked, block: s.block, unblock: vi.fn(), report: s.report }),
}));

const target = { uid: 'u1', nick: '갈치', chatId: 9 };
const show = (over: Partial<Parameters<typeof PlayerInfo>[0]> = {}) =>
  render(<PlayerInfo target={target} self={false} account="me@example.com" setToast={vi.fn()} {...over} />);

describe('PlayerInfo', () => {
  afterEach(() => {
    cleanup();
    s.relation = null;
    s.blocked = false;
    s.loading = false;
    s.failed = false;
    s.profile = {
      nickname: '갈치',
      boat: 2,
      rod: 7,
      fame: 12345,
      dexFish: ['crucian', 'minnow'],
      dexVariant: ['crucian'],
      artifacts: ['abyss-angler', 'mami-wata-mirror'],
      artifactLevels: { 'abyss-angler': 3 },
      hats: ['cap-red', 'straw-hat'],
      look: { shirt: 1, pants: 0, hat: 'straw-hat' },
      achievements: ['variant-village', 'spot-basic-pond'],
      location: { kind: 'base', id: 'harbor' },
      lastPos: null,
      online: true,
      liveRegion: 'world',
      liveZone: 'deep',
      account: true,
    };
    vi.clearAllMocks();
  });

  it('현재 위치, 명성, 3개 서브탭(업적·수집품·도감 진척도) 전환과 친구 요청·차단·신고 동작을 제공한다', async () => {
    show();
    expect(screen.getByLabelText('접속 중')).toBeTruthy();
    expect(screen.getByLabelText('현재 위치 마리아나 해구')).toBeTruthy();
    expect(screen.getByText('12,345')).toBeTruthy();
    expect(screen.getByText('Lv.7')).toBeTruthy();

    // 기본 서브탭: 업적
    expect(screen.getByText(`2 / ${ACHIEVEMENTS.length}`)).toBeTruthy();
    const progressItem = ACHIEVEMENTS.find(a => a.id === 'spot-basic-pond')!;
    const cosmeticItem = ACHIEVEMENTS.find(a => a.id === 'variant-village')!;
    const unachievedItem = ACHIEVEMENTS.find(a => a.id === 'spot-full-pond')!;
    expect(screen.getByText(progressItem.name)).toBeTruthy();
    expect(screen.getByText(cosmeticItem.name)).toBeTruthy();
    expect(screen.getByText(unachievedItem.name)).toBeTruthy();

    // 업적 상세 툴팁 확인
    const achTrigger = screen.getByText(progressItem.name);
    fireEvent.mouseEnter(achTrigger);
    const achTip = screen.getByRole('tooltip');
    expect(achTip).toHaveTextContent(progressItem.desc);
    expect(achTip).toHaveTextContent('보상');
    fireEvent.mouseLeave(achTrigger);

    // 업적 카테고리 필터(진행/치장) 및 달성만 보기 토글
    fireEvent.click(screen.getByRole('button', { name: '진행' }));
    expect(screen.getByText(progressItem.name)).toBeTruthy();
    expect(screen.queryByText(cosmeticItem.name)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '치장' }));
    expect(screen.queryByText(progressItem.name)).toBeNull();
    expect(screen.getByText(cosmeticItem.name)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '전체' }));
    fireEvent.click(screen.getByRole('button', { name: '달성만 보기' }));
    expect(screen.getByText(progressItem.name)).toBeTruthy();
    expect(screen.getByText(cosmeticItem.name)).toBeTruthy();
    expect(screen.queryByText(unachievedItem.name)).toBeNull();

    // 두 번째 서브탭: 수집품 (모자 + 유물)
    fireEvent.click(screen.getByRole('button', { name: /수집품/ }));
    expect(screen.getByText(`2 / ${HATS.length}`)).toBeTruthy();
    expect(screen.queryByText(/모자 \(구매/)).toBeNull();
    fireEvent.mouseEnter(screen.getByText('모자'));
    const hatTip = screen.getByRole('tooltip');
    expect(hatTip).toHaveTextContent('구매');
    expect(hatTip).toHaveTextContent('업적');
    fireEvent.mouseLeave(screen.getByText('모자'));

    const ownedHatCard = screen.getByLabelText('모자 빨간 모자 보유');
    const unownedHatCard = screen.getByLabelText('모자 파란 모자 미보유');
    expect(ownedHatCard).toHaveTextContent('보유');
    expect(ownedHatCard).not.toHaveClass('border-dashed');
    expect(unownedHatCard).toHaveTextContent('미보유');
    expect(unownedHatCard).toHaveClass('border-dashed');

    expect(screen.getByText(`2 / ${ARTIFACTS.length}`)).toBeTruthy();
    const leveledCard = screen.getByLabelText('유물 해구의 이빨 Lv.3');
    expect(leveledCard).toBeTruthy();
    expect(leveledCard.querySelector('canvas')).toHaveAttribute('width', '16');
    const legendCard = screen.getByLabelText('유물 마미 와타의 거울');
    expect(legendCard).toBeTruthy();
    expect(legendCard.querySelector('canvas')).toHaveAttribute('width', '16');
    expect(legendCard.textContent).toBe('마미 와타의 거울');
    expect(screen.queryByText('전설')).toBeNull();
    const emptySlots = screen.getAllByLabelText(/유물 없음$/);
    expect(emptySlots).toHaveLength(ARTIFACTS.length - 2);
    expect(emptySlots.every(el => el.querySelector('canvas') === null)).toBe(true);

    // 세 번째 서브탭: 도감 진척도
    fireEvent.click(screen.getByRole('button', { name: '도감 진척도' }));
    expect(screen.getByText(`2 / ${FISH.length}`)).toBeTruthy();
    expect(screen.getByText(`1 / ${FISH.length}`)).toBeTruthy();

    // 관계 동작(친구 요청·신고·차단)
    fireEvent.click(screen.getByRole('button', { name: '친구 요청' }));
    expect(s.act).toHaveBeenCalledWith({ op: 'request', nickname: '갈치' });
    const blockButton = screen.getByRole('button', { name: '차단' }) as HTMLButtonElement;
    await waitFor(() => expect(blockButton.disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: '이 채팅 신고' }));
    expect(s.report).toHaveBeenCalledWith(9);
    expect(await screen.findByRole('button', { name: '신고함' })).toBeTruthy();
    await waitFor(() => expect(blockButton.disabled).toBe(false));
    fireEvent.click(blockButton);
    expect(s.block).toHaveBeenCalledWith('u1');
  });

  it('비접속 상태에서는 접속 점 없이 마지막 위치를 표시한다', () => {
    s.profile = { ...s.profile, online: false, liveRegion: null, liveZone: null, location: { kind: 'base', id: 'colombo' } };
    show();
    expect(screen.queryByLabelText('접속 중')).toBeNull();
    expect(screen.getByLabelText('마지막 위치 콜롬보항')).toBeTruthy();
  });

  it('친구이거나 요청 중이면 요청 버튼 대신 상태를 보이고, 차단했으면 해제를 보인다', () => {
    s.relation = 'outgoing';
    s.blocked = true;
    show({ target: { uid: 'u1', nick: '갈치' } });
    expect(screen.queryByRole('button', { name: '친구 요청' })).toBeNull();
    expect(screen.getByRole('button', { name: '차단 해제' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '이 채팅 신고' })).toBeNull();
    cleanup();
    s.blocked = false;
    show();
    expect(screen.getByText('친구 요청을 보냈어요')).toBeTruthy();
  });

  it('게스트에게는 친구 요청과 차단을 공용 잠금으로 두고 이유를 툴팁으로 보인다. 누르면 아무 일도 없다', () => {
    const { container } = show({ account: null });
    const buttons = screen.getAllByRole('button', { name: /^(친구 요청|차단)$/ }) as HTMLButtonElement[];
    expect(buttons.map(b => [b.textContent, b.disabled])).toEqual([['친구 요청', true], ['차단', true]]);
    expect(container.querySelectorAll('[data-glyph="lock"]')).toHaveLength(2);
    expect(container.querySelector('[title]')).toBeNull();
    const groups = screen.getAllByRole('group');
    expect(groups.map(g => g.getAttribute('aria-label'))).toEqual(['친구 요청', '차단']);
    fireEvent.mouseEnter(groups[0].parentElement!);
    expect(screen.getByRole('tooltip')).toHaveTextContent('태평양 항로가 열리면 쓸 수 있어요.');
    fireEvent.mouseLeave(groups[0].parentElement!);
    groups.forEach(g => fireEvent.click(g));
    buttons.forEach(b => fireEvent.click(b));
    expect(s.act).not.toHaveBeenCalled();
    expect(s.block).not.toHaveBeenCalled();
  });

  it('확인 실패 상태에서는 친구 요청과 차단에 확인 실패 전용 잠금 툴팁을 보인다', () => {
    show({ account: null, accountFailed: true });
    const groups = screen.getAllByRole('group');
    fireEvent.mouseEnter(groups[0].parentElement!);
    expect(screen.getByRole('tooltip')).toHaveTextContent('계정을 확인하면 쓸 수 있어요.');
  });

  it('내 정보에는 동작이 없고, 단독 PlayerModal은 md 고정 높이 창에서 상세를 공유한다', () => {
    render(<PlayerModal target={target} self account="me@example.com" setToast={vi.fn()} onClose={vi.fn()} />);
    const dialog = screen.getByRole('dialog', { name: '내 정보' });
    expect(dialog.className).toContain('w-[min(680px,calc(100%-32px))]');
    expect(dialog.className).toContain('h-[min(520px,calc(100%-32px))]');
    expect(screen.queryByRole('button', { name: '친구 요청' })).toBeNull();
    expect(screen.queryByRole('button', { name: '차단' })).toBeNull();
  });

  it('유물 카드 테두리는 등급별 border-* 클래스만 쓰고 기본 border-line과 겹치지 않으며 빈 슬롯만 border-line border-dashed를 쓴다', () => {
    s.profile = {
      ...s.profile,
      artifacts: ['wreck-compass', 'abyss-angler', 'mami-wata-mirror'],
      artifactLevels: { 'wreck-compass': 2, 'abyss-angler': 3 },
    };
    show();
    fireEvent.click(screen.getByRole('button', { name: /수집품/ }));

    const rareCard = screen.getByLabelText('유물 침선의 나침반 Lv.2');
    expect(rareCard).toHaveClass('border', 'border-rare', 'text-rare');
    expect(rareCard).not.toHaveClass('border-line');

    const epicCard = screen.getByLabelText('유물 해구의 이빨 Lv.3');
    expect(epicCard).toHaveClass('border', 'border-epic', 'text-epic');
    expect(epicCard).not.toHaveClass('border-line');

    const legendCard = screen.getByLabelText('유물 마미 와타의 거울');
    expect(legendCard).toHaveClass('border', 'border-legend', 'text-legend');
    expect(legendCard).not.toHaveClass('border-line');

    const emptyCards = screen.getAllByLabelText(/유물 없음$/);
    expect(emptyCards.length).toBeGreaterThan(0);
    expect(emptyCards[0]).toHaveClass('border', 'border-line', 'border-dashed');
    expect(emptyCards[0]).not.toHaveClass('border-epic', 'border-legend', 'border-rare');
  });

  it('불러오기 중과 불러오기 실패 상태를 구분해 표시한다', () => {
    s.loading = true;
    const { rerender } = show();
    expect(screen.getByText('정보를 불러오는 중이에요.')).toBeTruthy();

    s.loading = false;
    s.failed = true;
    rerender(<PlayerInfo target={target} self={false} account="me@example.com" setToast={vi.fn()} />);
    expect(screen.getByText(/정보를 불러오지 못했어요/)).toBeTruthy();
  });

  it('달성한 업적이 없을 때 달성만 보기 토글은 빈 상태 안내를 보인다', () => {
    s.profile = { ...s.profile, achievements: [] };
    show();
    fireEvent.click(screen.getByRole('button', { name: '달성만 보기' }));
    expect(screen.getByText('달성한 업적이 없어요.')).toBeTruthy();
  });
});
