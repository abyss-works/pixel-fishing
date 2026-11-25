// 길드 창: 길드가 없으면 코드로 찾아 들어가기와 만들기. 길드가 있으면 제목 아래 고정 정보 줄(레벨, 진행, 인원)이 탭을 바꿔도 남고,
// 길드원 탭(표, 떠나기), 길드 스킬 탭(트리, 고른 스킬, 기부 창), 항해일지 탭(날짜별 기록), 길드장의 관리 탭(가입 방식, 코드와 링크, 신청)이 있다.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { registerNoticeSink } from '../../../../features/display/model/toastPolicy';
import type { GuildInfo } from '../../../../features/guild/model/guild';
import GuildModal from './GuildModal';

const s = vi.hoisted(() => ({
  guild: null as GuildInfo | null,
  you: 'L' as string | null,
  loading: false,
  failed: false,
  act: vi.fn(async (_op: unknown): Promise<{ ok: true; result?: 'joined' | 'requested'; recovered?: number } | { ok: false; error: string }> => ({ ok: true })),
  request: null as { code: string; name: string; requestedAt: string } | null,
  preview: null as unknown,
}));
vi.mock('../../../../features/guild/service/useGuild', () => ({
  useGuild: () => ({ available: true, guild: s.guild, request: s.request, loading: s.loading, failed: s.failed, you: s.you, act: s.act }),
}));
vi.mock('../../../../features/guild/service/useGuildInvite', () => ({
  useGuildInvite: (code: string | null) => ({ preview: code ? s.preview : null, settled: code !== null, failed: false, refresh: vi.fn() }),
}));

const at = '2026-11-05T00:00:00.000Z';
const GUILD: GuildInfo = {
  id: 'g1', name: '심해선단', createdAt: at, role: 'leader', renamedAt: null,
  code: 'ABCD2345', joinMode: 'approval', pitch: null,
  requests: [{ uid: 'R', nick: '바다거북', requestedAt: at }],
  members: [
    { uid: 'L', nick: '가람', role: 'leader', joinedAt: at, leftAt: null, online: true, contribution: { total: 1_900, today: 900 } },
    { uid: 'M', nick: '나루', role: 'member', joinedAt: at, leftAt: null, online: false, contribution: { total: 0, today: 0 } },
    { uid: 'X', nick: '다온', role: 'member', joinedAt: at, leftAt: at, online: false, contribution: { total: 29_100, today: 0 } },
  ],
  growth: { level: 3, total: 31_000, floor: 25_000, next: 50_000 },
  bonuses: [
    { id: 'sell', unlock: 1, rank: 2, enhanceRank: 0, totalRank: 2, cap: 3, pool: 125_000, next: 500_000, effect: 0.04, nextEffect: 0.06, mine: 100_000 },
    { id: 'bag', unlock: 2, rank: 3, enhanceRank: 0, totalRank: 3, cap: 3, pool: 0, next: 1_500_000, effect: 0.12, nextEffect: 0.16, mine: 0 },
    { id: 'named', unlock: 3, rank: 1, enhanceRank: 0, totalRank: 1, cap: 3, pool: 0, next: 150_000, effect: 0.05, nextEffect: 0.1, mine: 0 },
    { id: 'rare', unlock: 4, rank: 0, enhanceRank: 0, totalRank: 0, cap: 0, pool: 0, next: null, effect: 0, nextEffect: 0.02, mine: 0 },
    { id: 'mutation', unlock: 5, rank: 0, enhanceRank: 0, totalRank: 0, cap: 0, pool: 0, next: null, effect: 0, nextEffect: 0.01, mine: 0 },
  ],
  effects: { sell: 0.04, bag: 0.12, named: 0.05, rare: 0, mutation: 0 },
  enhanceResetCount: 0,
  donors: [{ uid: 'M', nick: '나루', gold: 900_000 }, { uid: 'L', nick: '가람', gold: 100_000 }],
  logbook: [
    { id: 2, kind: 'legendary', uid: 'L', nick: '가람', detail: 'goldcarp', value: null, at },
    { id: 1, kind: 'join', uid: 'M', nick: '나루', detail: null, value: null, at },
  ],
};

describe('GuildModal', () => {
  afterEach(() => { cleanup(); s.guild = null; s.you = 'L'; s.loading = false; s.failed = false; s.request = null; s.preview = null; vi.clearAllMocks(); });

  it('길드가 없으면 이름으로 만든다', async () => {
    const toast = vi.fn();
    render(<GuildModal gold={500_000} artifacts={{ artifacts: [] }} setToast={toast} onGoldChanged={vi.fn()} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('길드 이름'), { target: { value: ' 심해선단 ' } });
    fireEvent.click(screen.getByRole('button', { name: '만들기' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith('심해선단 길드를 만들었어요.'));
    expect(s.act).toHaveBeenCalledWith({ op: 'create', name: '심해선단' });
  });

  it('길드 코드로 찾으면 요약과 가입 방식에 맞는 버튼이 뜨고, 승인 가입이면 가입 신청을 보낸다. 없는 코드는 찾지 못했다고 알린다', async () => {
    const toast = vi.fn();
    render(<GuildModal gold={500_000} artifacts={{ artifacts: [] }} setToast={toast} onGoldChanged={vi.fn()} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('길드 코드'), { target: { value: 'abc' } });
    fireEvent.click(screen.getByRole('button', { name: '찾기' }));
    expect(await screen.findByText('길드 코드는 8자리예요.')).toBeTruthy();

    s.preview = { code: 'K7QX2MAB', name: '새벽선단', level: 3, members: 6, cap: 10, joinMode: 'approval' };
    fireEvent.change(screen.getByLabelText('길드 코드'), { target: { value: 'k7qx2mab' } });
    fireEvent.click(screen.getByRole('button', { name: '찾기' }));
    expect(await screen.findByText('새벽선단')).toBeTruthy();
    s.act.mockResolvedValueOnce({ ok: true, result: 'requested' });
    fireEvent.click(screen.getByRole('button', { name: '가입 신청' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith('가입 신청을 보냈어요. 길드장이 승인하면 들어가요.'));
    expect(s.act).toHaveBeenLastCalledWith({ op: 'join', code: 'K7QX2MAB' });
  });

  it('넣어 둔 가입 신청이 있으면 맨 위에 보이고 거둘 수 있다', async () => {
    s.request = { code: 'K7QX2MAB', name: '새벽선단', requestedAt: new Date().toISOString() };
    render(<GuildModal gold={500_000} artifacts={{ artifacts: [] }} setToast={vi.fn()} onGoldChanged={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText(/길드에 가입을 신청했어요/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '신청 취소' }));
    await waitFor(() => expect(s.act).toHaveBeenCalledWith({ op: 'cancelRequest' }));
  });

  it('길드장의 관리 탭: 처리할 신청 수를 탭에 붙이고, 가입 방식을 바꾸며, 신청을 승인하거나 거절한다', async () => {
    s.guild = GUILD;
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const toast = vi.fn();
    render(<GuildModal gold={500_000} artifacts={{ artifacts: [] }} setToast={toast} onGoldChanged={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /관리.*1건/ }));
    expect(screen.getByText('ABCD2345')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '코드 복사' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith('길드 코드를 복사했어요.'));
    fireEvent.click(screen.getByRole('button', { name: '링크 복사' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith('초대 링크를 복사했어요.'));
    fireEvent.click(screen.getByRole('radio', { name: /자유 가입/ }));
    await waitFor(() => expect(s.act).toHaveBeenCalledWith({ op: 'settings', guildId: 'g1', joinMode: 'open' }));
    fireEvent.click(screen.getByRole('button', { name: '승인' }));
    await waitFor(() => expect(s.act).toHaveBeenCalledWith({ op: 'approve', guildId: 'g1', uid: 'R' }));
    fireEvent.click(screen.getByRole('button', { name: '거절' }));
    await waitFor(() => expect(s.act).toHaveBeenCalledWith({ op: 'reject', guildId: 'g1', uid: 'R' }));
  });

  it('길드장은 접힌 관리 메뉴를 보고, 다른 길드원이 있으면 떠나기를 누를 때 위임 안내를 받는다', async () => {
    s.guild = GUILD;
    const toast = vi.fn();
    render(<GuildModal gold={500_000} artifacts={{ artifacts: [] }} setToast={toast} onGoldChanged={vi.fn()} onClose={vi.fn()} />);
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

  it('길드원은 관리 동작과 관리 탭 없이 떠나기만 한다', () => {
    s.guild = { ...GUILD, role: 'member', requests: [] };
    s.you = 'M';
    render(<GuildModal gold={500_000} artifacts={{ artifacts: [] }} setToast={vi.fn()} onGoldChanged={vi.fn()} onClose={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /^관리/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /관리$/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '길드 떠나기' }));
    const dialog = screen.getAllByRole('dialog').at(-1) as HTMLElement;
    expect(within(dialog).getByText(/길드를 떠날까요/)).toBeTruthy();
  });

  it('길드원 표는 사람마다 오늘 기여, 누적 기여, 기부 합을 숫자로 보인다. 오늘 기여 머리의 툴팁은 하루 상한 목록이다', () => {
    s.guild = GUILD;
    render(<GuildModal gold={500_000} artifacts={{ artifacts: [] }} setToast={vi.fn()} onGoldChanged={vi.fn()} onClose={vi.fn()} />);
    fireEvent.mouseEnter(screen.getByText('오늘 기여'));
    const tip = screen.getByRole('tooltip');
    expect(within(tip).getByText('일반 의뢰')).not.toHaveAttribute('data-rarity');
    expect(tip).toHaveTextContent('네임드 토벌');
    expect(within(tip).getByText('네임드')).toHaveClass('text-epic');
    expect(tip.textContent).toContain('매일 새로 세요.');
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
    render(<GuildModal gold={500_000} artifacts={{ artifacts: [] }} setToast={vi.fn()} onGoldChanged={vi.fn()} onClose={vi.fn()} />);
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
    render(<GuildModal gold={500_000} artifacts={{ artifacts: [] }} setToast={vi.fn()} onGoldChanged={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '길드 스킬' }));
    const tree = screen.getByRole('group', { name: '길드 스킬 트리' });
    expect(within(tree).getByRole('button', { name: '희귀 어종 확률 고르기' }).getAttribute('aria-disabled')).toBe('true');
    fireEvent.mouseEnter(within(tree).getByRole('button', { name: '희귀 어종 확률 고르기' }).parentElement as HTMLElement);
    const lockedSkillTip = screen.getByRole('tooltip');
    expect(lockedSkillTip.textContent).toContain('희귀 어종 확률');
    expect(lockedSkillTip.textContent).toContain('일반 등급 물고기가 걸릴 확률을 줄여요.');
    expect(lockedSkillTip.textContent).toContain('길드 Lv.4에 열려요.');
    expect(lockedSkillTip.querySelector('.border-t')).not.toBeNull();
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
    render(<GuildModal gold={500_000} artifacts={{ artifacts: [] }} setToast={toast} onGoldChanged={resync} onClose={vi.fn()} />);
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
    render(<GuildModal gold={500_000} artifacts={{ artifacts: [] }} setToast={toast} onGoldChanged={resync} onClose={vi.fn()} />);
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
    render(<GuildModal gold={500_000} artifacts={{ artifacts: [] }} setToast={vi.fn()} onGoldChanged={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '항해일지' }));
    const day = within(screen.getByRole('region', { name: '11월 5일' }));
    expect(day.getAllByText('09:00')).toHaveLength(2);
    expect(day.getByText('전설 황금 잉어')).toBeTruthy();
    expect(day.getByText('나루')).toBeTruthy();
  });

  it('항해일지의 전설 돌연변이는 돌연변이명과 보라색 강조(text-epic)로 보인다', () => {
    const at = '2026-11-05T00:00:00.000Z';
    s.guild = {
      ...GUILD,
      logbook: [
        { id: 1, kind: 'legendary', uid: 'L', nick: '가람', detail: 'goldcarp', value: null, at },
        { id: 2, kind: 'legendary', uid: 'L', nick: '가람', detail: 'goldcarp|variant', value: null, at },
      ],
    };
    render(<GuildModal gold={500_000} artifacts={{ artifacts: [] }} setToast={vi.fn()} onGoldChanged={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '항해일지' }));
    const day = within(screen.getByRole('region', { name: '11월 5일' }));
    expect(day.getByText('전설 황금 잉어').className).toContain('text-legend');
    expect(day.getByText('전설 무지개 잉어').className).toContain('text-epic');
  });

  it('Lv.6 이상 길드에서는 일반 길드원도 자유 강화 투자(+1)와 첫 100,000G 초기화를 할 수 있다', async () => {
    const lv8Guild: GuildInfo = {
      ...GUILD,
      role: 'member',
      requests: [],
      growth: { level: 8, total: 550_000, floor: 550_000, next: 800_000 },
      bonuses: [
        { id: 'sell', unlock: 1, rank: 5, enhanceRank: 0, totalRank: 5, cap: 5, pool: 0, next: null, effect: 0.1, nextEffect: 0.12, mine: 0 },
        { id: 'bag', unlock: 2, rank: 3, enhanceRank: 0, totalRank: 3, cap: 5, pool: 0, next: 1_500_000, effect: 0.12, nextEffect: 0.16, mine: 0 },
        { id: 'named', unlock: 3, rank: 1, enhanceRank: 0, totalRank: 1, cap: 5, pool: 0, next: 150_000, effect: 0.05, nextEffect: 0.1, mine: 0 },
        { id: 'rare', unlock: 4, rank: 5, enhanceRank: 2, totalRank: 7, cap: 5, pool: 0, next: null, effect: 0.14, nextEffect: 0.16, mine: 0 },
        { id: 'mutation', unlock: 5, rank: 1, enhanceRank: 0, totalRank: 1, cap: 5, pool: 0, next: 150_000, effect: 0.01, nextEffect: 0.02, mine: 0 },
      ],
    };
    s.guild = lv8Guild;
    s.you = 'M';
    const toast = vi.fn();
    const resync = vi.fn(async () => {});
    render(<GuildModal gold={100_000} artifacts={{ artifacts: [] }} setToast={toast} onGoldChanged={resync} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '길드 스킬' }));

    expect(screen.getByText('남은 강화 포인트')).toBeTruthy();
    expect(screen.getByText('1 / 3')).toBeTruthy();
    // 상단 색상 범례 블록은 제거되고 각 노드의 툴팁으로 구분 안내를 제공한다
    expect(screen.queryByLabelText('스킬 단계 색상 안내')).toBeNull();
    expect(screen.queryByText(/노란색 채움/)).toBeNull();
    expect(screen.queryByText(/보라색 테두리/)).toBeNull();

    fireEvent.mouseEnter(screen.getByText('남은 강화 포인트'));
    expect(screen.getByRole('tooltip').textContent).toBe('자유 강화 포인트와 효과는 길드원마다 따로 적용돼요.');
    fireEvent.mouseLeave(screen.getByText('남은 강화 포인트'));

    fireEvent.click(screen.getByRole('button', { name: '희귀 어종 확률 고르기' }));
    expect(screen.getByText(/기본 5 \+ 강화 2 =/)).toBeTruthy();
    const enhancedNode = screen.getByLabelText('희귀 어종 확률 2단계 이룸 개인 자유 강화 적용');
    expect(enhancedNode).toBeTruthy();
    fireEvent.mouseEnter(enhancedNode.closest('[tabindex="0"]') as HTMLElement);
    const enhancedTip = screen.getByRole('tooltip').textContent ?? '';
    expect(enhancedTip).toContain('길드 공용으로 적용되는 기본 단계예요.');
    expect(enhancedTip).toContain('내 포인트로 올린 개인 자유 강화 단계예요.');
    expect(enhancedTip).toContain('나에게만 추가로 적용돼요.');
    expect(enhancedTip).not.toMatch(/[·—–]/);
    fireEvent.mouseLeave(enhancedNode.closest('[tabindex="0"]') as HTMLElement);

    const baseNode = screen.getByLabelText('희귀 어종 확률 3단계 이룸');
    fireEvent.mouseEnter(baseNode.closest('[tabindex="0"]') as HTMLElement);
    const baseTip = screen.getByRole('tooltip').textContent ?? '';
    expect(baseTip).toContain('길드 공용으로 적용되는 기본 단계예요.');
    expect(baseTip).toContain('모든 길드원이 같은 효과를 받아요.');
    expect(baseTip).not.toContain('내 포인트로 올린 개인 자유 강화 단계예요.');
    expect(baseTip).not.toMatch(/[·—–]/);
    fireEvent.mouseLeave(baseNode.closest('[tabindex="0"]') as HTMLElement);

    // 기본 5단계를 모두 채운 스킬의 기부 버튼은 기본 단계 완료 툴팁을 보인다
    fireEvent.mouseEnter(screen.getByRole('button', { name: '기부' }).parentElement as HTMLElement);
    expect(screen.getByRole('tooltip').textContent).toBe('기본 단계 5단계를 모두 채웠어요.');

    fireEvent.click(screen.getByRole('button', { name: '가방 용량 증가 강화 1단계 올리기' }));
    await waitFor(() => expect(s.act).toHaveBeenCalledWith({ op: 'enhance', guildId: 'g1', bonus: 'bag' }));
    expect(toast).toHaveBeenCalledWith('가방 용량 증가 스킬의 내 자유 강화를 1단계로 올렸어요.');

    fireEvent.mouseEnter(screen.getByRole('button', { name: '되돌리기' }).parentElement as HTMLElement);
    expect(screen.getByRole('tooltip').textContent).toBe('100,000G를 내고 내 자유 강화만 되돌릴 수 있어요.');
    fireEvent.mouseLeave(screen.getByRole('button', { name: '되돌리기' }).parentElement as HTMLElement);

    s.act.mockResolvedValueOnce({ ok: true, recovered: 2 });
    fireEvent.click(screen.getByRole('button', { name: '되돌리기' }));
    const dialog = within(screen.getAllByRole('dialog').at(-1) as HTMLElement);
    expect(dialog.getByText(/100,000G를 내고 내 자유 강화만 되돌릴까요\?/)).toBeTruthy();
    expect(dialog.getByText(/다른 길드원의 자유 강화와 길드 기본 단계는 그대로 유지돼요\./)).toBeTruthy();
    expect(dialog.getByText('100,000G')).toBeTruthy();
    expect(dialog.getByText('2포인트')).toBeTruthy();
    expect((screen.getAllByRole('dialog').at(-1) as HTMLElement).textContent).not.toMatch(/[·—–]/);
    fireEvent.click(dialog.getByRole('button', { name: '되돌리기' }));
    await waitFor(() => expect(s.act).toHaveBeenCalledWith({ op: 'resetEnhancements', guildId: 'g1' }));
    await waitFor(() => expect(resync).toHaveBeenCalled());
    expect(toast).toHaveBeenCalledWith('내 길드 스킬 자유 강화를 되돌려 2포인트를 회수했어요.');
  });

  it('초기화 누적 횟수에 따라 툴팁과 확인 창 비용이 바뀌고 5회차 이상은 10,000,000G 상한이다', () => {
    const baseGuild: GuildInfo = {
      ...GUILD,
      role: 'member',
      requests: [],
      growth: { level: 7, total: 350_000, floor: 350_000, next: 550_000 },
      bonuses: [
        { id: 'sell', unlock: 1, rank: 5, enhanceRank: 1, totalRank: 6, cap: 5, pool: 0, next: null, effect: 0.12, nextEffect: 0.14, mine: 0 },
        { id: 'bag', unlock: 2, rank: 3, enhanceRank: 0, totalRank: 3, cap: 5, pool: 0, next: 1_500_000, effect: 0.12, nextEffect: 0.16, mine: 0 },
        { id: 'named', unlock: 3, rank: 1, enhanceRank: 0, totalRank: 1, cap: 5, pool: 0, next: 150_000, effect: 0.05, nextEffect: 0.1, mine: 0 },
        { id: 'rare', unlock: 4, rank: 2, enhanceRank: 0, totalRank: 2, cap: 5, pool: 0, next: 300_000, effect: 0.04, nextEffect: 0.06, mine: 0 },
        { id: 'mutation', unlock: 5, rank: 1, enhanceRank: 0, totalRank: 1, cap: 5, pool: 0, next: 150_000, effect: 0.01, nextEffect: 0.02, mine: 0 },
      ],
    };

    s.guild = { ...baseGuild, enhanceResetCount: 1 };
    const { rerender } = render(
      <GuildModal gold={500_000} artifacts={{ artifacts: [] }} setToast={vi.fn()} onGoldChanged={vi.fn()} onClose={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: '길드 스킬' }));
    fireEvent.mouseEnter(screen.getByRole('button', { name: '되돌리기' }).parentElement as HTMLElement);
    expect(screen.getByRole('tooltip').textContent).toBe('500,000G를 내고 내 자유 강화만 되돌릴 수 있어요.');
    fireEvent.click(screen.getByRole('button', { name: '되돌리기' }));
    const dialog1 = within(screen.getAllByRole('dialog').at(-1) as HTMLElement);
    expect(dialog1.getByText(/500,000G를 내고 내 자유 강화만 되돌릴까요\?/)).toBeTruthy();
    expect(dialog1.getByText('500,000G')).toBeTruthy();
    fireEvent.click(dialog1.getByRole('button', { name: '닫기' }));

    s.guild = { ...baseGuild, enhanceResetCount: 5 };
    rerender(<GuildModal gold={9_999_999} artifacts={{ artifacts: [] }} setToast={vi.fn()} onGoldChanged={vi.fn()} onClose={vi.fn()} />);
    const resetBtn = screen.getByRole('button', { name: '되돌리기' });
    expect(resetBtn).toBeDisabled();
    fireEvent.mouseEnter(resetBtn.parentElement as HTMLElement);
    expect(screen.getByRole('tooltip').textContent).toContain('10,000,000G를 내고 내 자유 강화만 되돌릴 수 있어요.');

    rerender(<GuildModal gold={10_000_000} artifacts={{ artifacts: [] }} setToast={vi.fn()} onGoldChanged={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '되돌리기' }));
    const dialogCap = within(screen.getAllByRole('dialog').at(-1) as HTMLElement);
    expect(dialogCap.getByText(/10,000,000G를 내고 내 자유 강화만 되돌릴까요\?/)).toBeTruthy();
    expect(dialogCap.getByText('10,000,000G')).toBeTruthy();
  });

  it('개인 자유 강화 되돌리기 완료 시 플로팅 토스트 문구를 내 길드 스킬 자유 강화를 되돌렸어요 로 보낸다', async () => {
    s.guild = {
      ...GUILD,
      role: 'member',
      requests: [],
      growth: { level: 7, total: 350_000, floor: 350_000, next: 550_000 },
      bonuses: [
        { id: 'sell', unlock: 1, rank: 5, enhanceRank: 1, totalRank: 6, cap: 5, pool: 0, next: null, effect: 0.12, nextEffect: 0.14, mine: 0 },
        { id: 'bag', unlock: 2, rank: 3, enhanceRank: 0, totalRank: 3, cap: 5, pool: 0, next: 1_500_000, effect: 0.12, nextEffect: 0.16, mine: 0 },
        { id: 'named', unlock: 3, rank: 1, enhanceRank: 0, totalRank: 1, cap: 5, pool: 0, next: 150_000, effect: 0.05, nextEffect: 0.1, mine: 0 },
        { id: 'rare', unlock: 4, rank: 2, enhanceRank: 0, totalRank: 2, cap: 5, pool: 0, next: 300_000, effect: 0.04, nextEffect: 0.06, mine: 0 },
        { id: 'mutation', unlock: 5, rank: 1, enhanceRank: 0, totalRank: 1, cap: 5, pool: 0, next: 150_000, effect: 0.01, nextEffect: 0.02, mine: 0 },
      ],
    };
    s.you = 'M';
    const noticeHandler = vi.fn();
    const sink = registerNoticeSink(vi.fn(), noticeHandler);
    s.act.mockResolvedValueOnce({ ok: true, recovered: 1 });
    render(<GuildModal gold={100_000} artifacts={{ artifacts: [] }} setToast={sink} onGoldChanged={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '길드 스킬' }));
    fireEvent.click(screen.getByRole('button', { name: '되돌리기' }));
    const dialog = within(screen.getAllByRole('dialog').at(-1) as HTMLElement);
    fireEvent.click(dialog.getByRole('button', { name: '되돌리기' }));
    await waitFor(() => expect(noticeHandler).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'guild.modalAction',
      toastText: '내 길드 스킬 자유 강화를 되돌렸어요.',
      text: '내 길드 스킬 자유 강화를 되돌려 1포인트를 회수했어요.',
    })));
  });

  it('길드 정보 불러오는 중, 조회 실패, 세션 미확보 상태를 구분해 보인다', () => {
    s.loading = true;
    const { rerender } = render(
      <GuildModal gold={0} artifacts={{ artifacts: [] }} setToast={vi.fn()} onGoldChanged={vi.fn()} onClose={vi.fn()} />,
    );
    expect(screen.getByText('길드 정보를 불러오는 중이에요.')).toBeTruthy();

    s.loading = false;
    s.failed = true;
    rerender(<GuildModal gold={0} artifacts={{ artifacts: [] }} setToast={vi.fn()} onGoldChanged={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText('길드 정보를 열지 못했어요.')).toBeTruthy();
    expect(screen.queryByText('길드 정보를 불러오는 중이에요.')).toBeNull();

    s.failed = false;
    s.guild = GUILD;
    s.you = null;
    rerender(<GuildModal gold={0} artifacts={{ artifacts: [] }} setToast={vi.fn()} onGoldChanged={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText('길드 정보를 열지 못했어요.')).toBeTruthy();
    expect(screen.queryByText('길드 정보를 불러오는 중이에요.')).toBeNull();
  });
});
