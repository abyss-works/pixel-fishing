// 길드 창 — 길드가 없으면 만들기·가입, 길드장에게는 초대 코드와 접힌 관리 메뉴, 길드원에게는 떠나기만 보인다.
// 왼쪽 길드 정보는 탭을 바꿔도 남고, 보너스 탭은 트리 옆에 상세와 기부 순위를 둔다.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { GuildInfo } from '../../../../features/guild/model/guild';
import GuildModal from './GuildModal';

const s = vi.hoisted(() => ({
  guild: null as GuildInfo | null,
  you: 'L',
  act: vi.fn(async (_op: unknown): Promise<{ ok: true } | { ok: false; error: string }> => ({ ok: true })),
}));
vi.mock('../../../../features/guild/service/useGuild', () => ({
  useGuild: () => ({ available: true, guild: s.guild, loading: false, failed: false, you: s.you, act: s.act }),
}));

const at = '2026-11-05T00:00:00.000Z';
const GUILD: GuildInfo = {
  id: 'g1', name: '심해선단', createdAt: at, role: 'leader',
  invite: { code: 'ABCD2345', expiresAt: '2999-01-01T00:00:00.000Z' },
  members: [
    { uid: 'L', nick: '가람', role: 'leader', joinedAt: at, leftAt: null, online: true, contribution: { total: 1_900, today: 900 } },
    { uid: 'M', nick: '나루', role: 'member', joinedAt: at, leftAt: null, online: false, contribution: { total: 0, today: 0 } },
    { uid: 'X', nick: '다온', role: 'member', joinedAt: at, leftAt: at, online: false, contribution: { total: 29_100, today: 0 } },
  ],
  growth: { level: 3, total: 31_000, floor: 25_000, next: 50_000 },
  bonuses: [
    { id: 'sell', unlock: 1, rank: 2, cap: 3, pool: 125_000, next: 500_000, effect: 0.04, nextEffect: 0.06, mine: 100_000 },
    { id: 'bag', unlock: 2, rank: 3, cap: 3, pool: 0, next: 1_500_000, effect: 0.12, nextEffect: 0.16, mine: 0 },
    { id: 'named', unlock: 3, rank: 1, cap: 3, pool: 0, next: 150_000, effect: 0.05, nextEffect: 0.1, mine: 0 },
    { id: 'rare', unlock: 4, rank: 0, cap: 0, pool: 0, next: null, effect: 0, nextEffect: 0.02, mine: 0 },
    { id: 'mutation', unlock: 5, rank: 0, cap: 0, pool: 0, next: null, effect: 0, nextEffect: 0.01, mine: 0 },
  ],
  effects: { sell: 0.04, bag: 0.12, named: 0.05, rare: 0, mutation: 0 },
  donors: [{ uid: 'M', nick: '나루', gold: 900_000 }, { uid: 'L', nick: '가람', gold: 100_000 }],
  logbook: [
    { id: 2, kind: 'legendary', uid: 'L', nick: '가람', detail: 'goldcarp', value: null, at },
    { id: 1, kind: 'join', uid: 'M', nick: '나루', detail: null, value: null, at },
  ],
};

describe('GuildModal', () => {
  afterEach(() => { cleanup(); s.guild = null; s.you = 'L'; vi.clearAllMocks(); });

  it('길드가 없으면 이름으로 만들고, 거부되면 이유를 보인다. 초대 코드로 들어갈 수 있다', async () => {
    const toast = vi.fn();
    render(<GuildModal setToast={toast} onGoldChanged={vi.fn()} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('길드 이름'), { target: { value: ' 심해선단 ' } });
    fireEvent.click(screen.getByRole('button', { name: '만들기' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith('심해선단 길드를 만들었어요.'));
    expect(s.act).toHaveBeenCalledWith({ op: 'create', name: '심해선단' });
    s.act.mockResolvedValueOnce({ ok: false, error: 'bad-code' });
    fireEvent.change(screen.getByLabelText('초대 코드'), { target: { value: 'abcd2345' } });
    fireEvent.click(screen.getByRole('button', { name: '들어가기' }));
    expect(await screen.findByText(/초대 코드를 찾지 못했어요/)).toBeTruthy();
    expect(s.act).toHaveBeenLastCalledWith({ op: 'join', code: 'abcd2345' });
  });

  it('길드장은 초대 코드와 접힌 관리 메뉴를 보고, 다른 길드원이 있으면 떠나기 대신 위임 안내를 본다', async () => {
    s.guild = GUILD;
    render(<GuildModal setToast={vi.fn()} onGoldChanged={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText('ABCD2345')).toBeTruthy();
    expect(screen.getByLabelText('길드 정보').textContent).toContain('길드원 2/10명 · 길드장');
    expect(screen.getByText('다온')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '길드 떠나기' })).toBeNull();
    expect(screen.getByText('다른 길드원이 있으면 길드장을 넘긴 뒤에 떠날 수 있어요.')).toBeTruthy();
    // 넘기기·내보내기는 관리 메뉴를 펼쳐야 보인다. 나 자신의 행에는 메뉴가 없다
    expect(screen.queryByRole('button', { name: '가람 관리' })).toBeNull();
    expect(screen.queryByRole('button', { name: '내보내기' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '나루 관리' }));
    expect(screen.getByRole('button', { name: '넘기기' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '내보내기' }));
    fireEvent.click(screen.getAllByRole('button', { name: '내보내기' }).at(-1) as HTMLElement);
    await waitFor(() => expect(s.act).toHaveBeenCalledWith({ op: 'remove', guildId: 'g1', uid: 'M' }));
  });

  it('길드원은 관리 동작 없이 떠나기만 한다', () => {
    s.guild = { ...GUILD, role: 'member', invite: null };
    s.you = 'M';
    render(<GuildModal setToast={vi.fn()} onGoldChanged={vi.fn()} onClose={vi.fn()} />);
    expect(screen.queryByText('초대 코드')).toBeNull();
    expect(screen.queryByRole('button', { name: '내보내기' })).toBeNull();
    expect(screen.queryByRole('button', { name: '넘기기' })).toBeNull();
    expect(screen.queryByRole('button', { name: /관리$/ })).toBeNull();
    expect(screen.getByLabelText('길드 정보').textContent).toContain('길드원 2/10명 · 길드원');
    expect(screen.getByRole('button', { name: '길드 떠나기' })).toBeTruthy();
  });

  it('왼쪽 길드 정보(레벨·진행·초대 코드·받는 보너스)는 레벨·항해일지·보너스 탭으로 바꿔도 그대로 보인다', () => {
    s.guild = GUILD;
    render(<GuildModal setToast={vi.fn()} onGoldChanged={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getAllByText('Lv.3')).toHaveLength(2); // 레벨 요약과 레벨 탭 머리
    expect(screen.getByLabelText('길드 레벨').textContent).toContain('31,000 / 50,000');
    expect(screen.getByText('누적 29,100')).toBeTruthy();
    const infoStays = () => {
      expect(screen.getByText('다음 레벨까지 기여 19,000')).toBeTruthy();
      expect(screen.getByText('판매가 +4% · 가방 용량 +12% · 네임드 조우 +5%')).toBeTruthy();
      expect(screen.getByText('ABCD2345')).toBeTruthy();
    };
    infoStays();
    fireEvent.click(screen.getByRole('button', { name: /^레벨/ }));
    expect(screen.getByText(/기여 100,000 · 돌연변이 보너스 열림 · 보너스 단계 상한 5/)).toBeTruthy();
    infoStays();
    fireEvent.click(screen.getByRole('button', { name: /항해일지/ }));
    expect(screen.getByText('가람 님이 전설 황금잉어 낚시에 성공했어요!')).toBeTruthy();
    expect(screen.getByText('나루 님이 길드에 들어왔어요.')).toBeTruthy();
    infoStays();
    fireEvent.click(screen.getByRole('button', { name: /^보너스/ }));
    infoStays();
  });

  it('받는 보너스가 없으면 없다고 보인다', () => {
    s.guild = { ...GUILD, bonuses: GUILD.bonuses.map(b => ({ ...b, rank: 0, effect: 0 })) };
    render(<GuildModal setToast={vi.fn()} onGoldChanged={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText('받는 보너스가 없어요.')).toBeTruthy();
  });

  it('보너스 탭은 스킬 트리다 — 열리지 않은 보너스는 열리는 레벨을, 단계 노드는 상태를 보이고 전체 기부 순위를 보인다', () => {
    s.guild = GUILD;
    render(<GuildModal setToast={vi.fn()} onGoldChanged={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /^보너스/ }));
    expect(screen.getByText('Lv4에 열림')).toBeTruthy();
    expect(screen.getByRole('button', { name: '판매가 2단계 이룸' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '판매가 3단계 모으는 중' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '판매가 4단계 상한 위' })).toBeTruthy();
    expect(screen.getByText('900,000골드')).toBeTruthy();
    // 상세와 기부 순위는 트리 옆 한 열에 함께 놓인다
    const tree = screen.getByRole('group', { name: '보너스 스킬 트리' });
    const side = screen.getByLabelText('판매가 상세').parentElement as HTMLElement;
    expect(side.contains(screen.getByLabelText('기부 순위'))).toBe(true);
    expect(side.contains(tree)).toBe(false);
    expect(side.parentElement?.contains(tree)).toBe(true);
    // 상한에 닿은 보너스를 고르면 기부 입력이 없다
    fireEvent.click(screen.getByRole('button', { name: '가방 용량 고르기' }));
    expect(screen.queryByLabelText('가방 용량 기부 골드')).toBeNull();
  });

  it('고른 보너스에 기부하면 실제로 받을 골드를 알리고 게임 상태를 다시 읽는다. 빠른 금액은 입력에 더한다', async () => {
    s.guild = GUILD;
    const toast = vi.fn();
    const resync = vi.fn(async () => {});
    render(<GuildModal setToast={toast} onGoldChanged={resync} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /^보너스/ }));
    const input = screen.getByLabelText('판매가 기부 골드') as HTMLInputElement;
    fireEvent.click(screen.getByRole('button', { name: '+10만' }));
    fireEvent.click(screen.getByRole('button', { name: '+50만' }));
    expect(input.value).toBe('600000');
    fireEvent.click(screen.getByRole('button', { name: '남은 만큼' }));
    expect(input.value).toBe('375000');
    // 상한 3단계까지 필요한 골드는 500,000 − 125,000 = 375,000 — 그 이상은 받지 않는다
    fireEvent.change(input, { target: { value: '1000000' } });
    fireEvent.click(screen.getByRole('button', { name: '기부' }));
    await waitFor(() => expect(resync).toHaveBeenCalled());
    expect(s.act).toHaveBeenCalledWith({ op: 'donate', guildId: 'g1', bonus: 'sell', amount: 1_000_000 });
    expect(toast).toHaveBeenCalledWith('판매가에 375,000골드를 기부했어요.');
  });

  it('기부가 거부되면 이유를 알리고 게임 상태를 다시 읽지 않는다', async () => {
    s.guild = GUILD;
    s.act.mockResolvedValueOnce({ ok: false, error: 'not-enough-gold' });
    const toast = vi.fn();
    const resync = vi.fn(async () => {});
    render(<GuildModal setToast={toast} onGoldChanged={resync} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /^보너스/ }));
    fireEvent.click(screen.getByRole('button', { name: '기부' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith('골드가 모자라요.', 'warn'));
    expect(s.act).toHaveBeenCalledWith({ op: 'donate', guildId: 'g1', bonus: 'sell', amount: 375_000 });
    expect(resync).not.toHaveBeenCalled();
  });
});
