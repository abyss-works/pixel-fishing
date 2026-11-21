// 플레이어 정보: 현재·마지막 위치, 요약, 업적, 수집품(모자·유물 레벨), 해역별 일반·돌연변이 도감 비교와 친구·차단·신고 동작.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ACHIEVEMENTS } from '../../../../game/content/achievements';
import { ARTIFACTS } from '../../../../game/content/artifacts';
import { FISH } from '../../../../game/content/fish';
import { HATS } from '../../../../game/content/wardrobe';
import type { PublicProfile } from '../../../../platform/api';
import { PlayerInfo } from './PlayerInfo';

const s = vi.hoisted(() => ({
  relation: null as null | 'friend' | 'incoming' | 'outgoing',
  blocked: false as boolean | null,
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
  usePlayerProfile: () => ({ profile: s.profile, loading: false, failed: false }),
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

  it('현재 위치, 명성, 업적, 수집품(모자·유물 레벨), 일반·돌연변이 도감을 보이고 친구 요청·차단·신고를 보낸다', async () => {
    show();
    expect(screen.getByLabelText('접속 중')).toBeTruthy();
    expect(screen.getByLabelText('현재 위치 마리아나 해구')).toBeTruthy();
    expect(screen.getByText('12,345')).toBeTruthy();
    expect(screen.getByText('Lv.7')).toBeTruthy();
    expect(screen.getByText(`2 / ${ACHIEVEMENTS.length}`)).toBeTruthy();
    expect(screen.getByText(`2 / ${HATS.length}`)).toBeTruthy();
    expect(screen.queryByText(/모자 \(구매/)).toBeNull();
    fireEvent.mouseEnter(screen.getByText('모자'));
    const hatTip = screen.getByRole('tooltip');
    expect(hatTip).toHaveTextContent('구매');
    expect(hatTip).toHaveTextContent('업적');
    fireEvent.mouseLeave(screen.getByText('모자'));
    expect(screen.getByText(`2 / ${ARTIFACTS.length}`)).toBeTruthy();
    expect(screen.getByLabelText('유물 해구의 이빨 Lv.3')).toBeTruthy();
    const legendCard = screen.getByLabelText('유물 마미 와타의 거울');
    expect(legendCard).toBeTruthy();
    expect(legendCard.textContent).toBe('마미 와타의 거울');
    expect(screen.queryByText('전설')).toBeNull();
    expect(screen.getAllByLabelText(/유물 없음$/)).toHaveLength(ARTIFACTS.length - 2);
    expect(screen.getByText(`2 / ${FISH.length}`)).toBeTruthy();
    expect(screen.getByText(`1 / ${FISH.length}`)).toBeTruthy();

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
    expect(screen.getByRole('tooltip')).toHaveTextContent('계정을 연결하면 쓸 수 있어요.');
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

  it('내 정보에는 동작이 없다', () => {
    show({ self: true });
    expect(screen.queryAllByRole('button')).toEqual([]);
  });
});
