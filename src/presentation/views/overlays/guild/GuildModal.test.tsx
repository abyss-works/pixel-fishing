// 길드 창: 길드가 없으면 만들기와 가입. 길드가 있으면 제목 아래 고정 정보 줄(레벨, 진행, 인원)이 탭을 바꿔도 남고,
// 길드원 탭(표, 초대 코드, 떠나기), 길드 스킬 탭(트리, 고른 스킬, 기부 창), 항해일지 탭(날짜별 기록)이 있다.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

  it('길드장은 초대 코드와 접힌 관리 메뉴를 보고, 다른 길드원이 있으면 떠나기를 누를 때 위임 안내를 받는다', async () => {
    s.guild = GUILD;
    const toast = vi.fn();
    render(<GuildModal setToast={toast} onGoldChanged={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText('ABCD2345')).toBeTruthy();
    // 떠난 선원은 길드원 표에 없다
    expect(screen.queryByText('다온')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '길드 떠나기' }));
    expect(toast).toHaveBeenCalledWith('다른 길드원이 있으면 길드장을 넘긴 뒤에 떠날 수 있어요.', 'warn');
    // 넘기기와 내보내기는 관리 메뉴를 펼쳐야 보인다. 나 자신의 행에는 메뉴가 없다
    expect(screen.queryByRole('button', { name: '가람 관리' })).toBeNull();
    expect(screen.queryByRole('button', { name: '내보내기' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '나루 관리' }));
    expect(screen.getByRole('button', { name: '길드장 넘기기' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '내보내기' }));
    fireEvent.click(screen.getAllByRole('button', { name: '내보내기' }).at(-1) as HTMLElement);
    await waitFor(() => expect(s.act).toHaveBeenCalledWith({ op: 'remove', guildId: 'g1', uid: 'M' }));
  });

  it('길드원은 관리 동작과 초대 코드 없이 떠나기만 한다', () => {
    s.guild = { ...GUILD, role: 'member', invite: null };
    s.you = 'M';
    render(<GuildModal setToast={vi.fn()} onGoldChanged={vi.fn()} onClose={vi.fn()} />);
    expect(screen.queryByText('초대 코드')).toBeNull();
    expect(screen.queryByRole('button', { name: /관리$/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '길드 떠나기' }));
    const dialog = screen.getAllByRole('dialog').at(-1) as HTMLElement;
    expect(within(dialog).getByText(/길드를 떠날까요/)).toBeTruthy();
  });

  it('길드원 표는 사람마다 오늘 기여, 누적 기여, 기부 합을 숫자로 보인다. 오늘 기여 머리의 툴팁은 하루 상한 목록이다', () => {
    s.guild = GUILD;
    render(<GuildModal setToast={vi.fn()} onGoldChanged={vi.fn()} onClose={vi.fn()} />);
    fireEvent.mouseEnter(screen.getByText('오늘 기여'));
    const tip = screen.getByRole('tooltip');
    expect(within(tip).getByText('네임드 토벌')).toBeTruthy();
    expect(tip.textContent).toContain('새벽 4시');
    fireEvent.mouseLeave(screen.getByText('오늘 기여'));
    const row = screen.getByText('나루').closest('tr') as HTMLElement;
    expect(within(row).getByText('900,000')).toBeTruthy();
    const mine = screen.getByText('가람').closest('tr') as HTMLElement;
    expect(within(mine).getByText('900')).toBeTruthy();
    expect(within(mine).getByText('1,900')).toBeTruthy();
    expect(within(mine).getByText('100,000')).toBeTruthy();
  });

  it('창 제목은 길드 정보이고, 고정 정보 줄(길드 이름, 레벨, 진행, 인원)은 탭을 바꿔도 그대로 보인다. 레벨이 오르는 조건은 진행 막대의 툴팁이다', () => {
    s.guild = GUILD;
    render(<GuildModal setToast={vi.fn()} onGoldChanged={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText('길드 정보')).toBeTruthy();
    const stays = () => {
      expect(screen.getByText('심해선단')).toBeTruthy();
      expect(screen.getByText('Lv.3')).toBeTruthy();
      expect(screen.getByText('31,000 / 50,000')).toBeTruthy();
      expect(screen.getByText('2/10')).toBeTruthy();
    };
    stays();
    fireEvent.mouseEnter(screen.getByRole('meter', { name: '다음 레벨까지 진행' }).parentElement as HTMLElement);
    expect(screen.getByRole('tooltip').textContent).toContain('길드 레벨이 올라요');
    fireEvent.click(screen.getByRole('button', { name: '길드 스킬' }));
    stays();
    fireEvent.click(screen.getByRole('button', { name: '항해일지' }));
    stays();
  });

  it('길드 스킬 탭: 열리지 않은 스킬은 고를 수 없고, 고른 스킬의 현재와 다음 단계 효과, 모인 골드를 보인다', () => {
    s.guild = GUILD;
    render(<GuildModal setToast={vi.fn()} onGoldChanged={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '길드 스킬' }));
    const tree = screen.getByRole('group', { name: '길드 스킬 트리' });
    expect(within(tree).getByRole('button', { name: '희귀 어종 확률 고르기' }).getAttribute('aria-disabled')).toBe('true');
    fireEvent.mouseEnter(within(tree).getByRole('button', { name: '희귀 어종 확률 고르기' }).parentElement as HTMLElement);
    expect(screen.getByRole('tooltip').textContent).toBe('길드 Lv.4에 열려요.');
    expect(within(tree).getByLabelText('판매가 보너스 3단계 모으는 중')).toBeTruthy();
    expect(screen.getByText('현재(2단계)')).toBeTruthy();
    expect(screen.getByText('다음(3단계)')).toBeTruthy();
    expect(screen.getByText('125,000 / 500,000')).toBeTruthy();
    // 상한에 닿은 스킬을 고르면 기부를 열 수 없다
    fireEvent.click(screen.getByRole('button', { name: '가방 용량 증가 고르기' }));
    expect((screen.getByRole('button', { name: '기부' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('기부 창에서 기부하면 실제로 받을 골드를 알리고 게임 상태를 다시 읽는다. 빠른 금액은 입력에 더한다', async () => {
    s.guild = GUILD;
    const toast = vi.fn();
    const resync = vi.fn(async () => {});
    render(<GuildModal setToast={toast} onGoldChanged={resync} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '길드 스킬' }));
    fireEvent.click(screen.getByRole('button', { name: '기부' }));
    const dialog = within(screen.getAllByRole('dialog').at(-1) as HTMLElement);
    const input = dialog.getByLabelText('판매가 보너스 기부 골드') as HTMLInputElement;
    fireEvent.click(dialog.getByRole('button', { name: '+10만' }));
    fireEvent.click(dialog.getByRole('button', { name: '+50만' }));
    expect(input.value).toBe('600000');
    fireEvent.click(dialog.getByRole('button', { name: '남은 만큼' }));
    expect(input.value).toBe('375000');
    // 상한 3단계까지 필요한 골드는 375,000이고, 그 이상은 받지 않는다
    fireEvent.change(input, { target: { value: '1000000' } });
    fireEvent.click(dialog.getByRole('button', { name: '기부' }));
    await waitFor(() => expect(resync).toHaveBeenCalled());
    expect(s.act).toHaveBeenCalledWith({ op: 'donate', guildId: 'g1', bonus: 'sell', amount: 1_000_000 });
    expect(toast).toHaveBeenCalledWith('판매가 보너스에 375,000G를 기부했어요.');
  });

  it('기부가 거부되면 이유를 알리고 게임 상태를 다시 읽지 않는다', async () => {
    s.guild = GUILD;
    s.act.mockResolvedValueOnce({ ok: false, error: 'not-enough-gold' });
    const toast = vi.fn();
    const resync = vi.fn(async () => {});
    render(<GuildModal setToast={toast} onGoldChanged={resync} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '길드 스킬' }));
    fireEvent.click(screen.getByRole('button', { name: '기부' }));
    const dialog = within(screen.getAllByRole('dialog').at(-1) as HTMLElement);
    fireEvent.click(dialog.getByRole('button', { name: '기부' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith('골드가 모자라요.', 'warn'));
    expect(s.act).toHaveBeenCalledWith({ op: 'donate', guildId: 'g1', bonus: 'sell', amount: 375_000 });
    expect(resync).not.toHaveBeenCalled();
  });

  it('항해일지는 한국 날짜 머리 아래에 시각과 강조한 이름, 전설 어종을 보인다', () => {
    s.guild = GUILD;
    render(<GuildModal setToast={vi.fn()} onGoldChanged={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '항해일지' }));
    const day = within(screen.getByRole('region', { name: '11월 5일' }));
    expect(day.getAllByText('09:00')).toHaveLength(2);
    expect(day.getByText('전설 황금잉어')).toBeTruthy();
    expect(day.getByText('나루')).toBeTruthy();
  });
});
