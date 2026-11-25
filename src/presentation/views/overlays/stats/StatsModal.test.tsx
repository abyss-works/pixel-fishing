// 스탯창: 제목 아래 고정 정보 줄(닉네임, 배, 낚싯대 레벨, 파워)과 네 탭.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { boatNameOf } from '../../../../game/content/boats';
import { guildEffectsOf } from '../../../../game/rules/guild';
import type { GuildEffects } from '../../../../game/rules/guild';
import { newState } from '../../../../game/rules/logic';
import type { GameState } from '../../../../game/rules/logic';
import { gameDayOf } from '../../../../game/rules/time';
import { powerOfLevel } from '../../../../game/rules/stats';
import StatsModal from './StatsModal';

vi.mock('../../../../features/travel/service/useSpotState', () => ({ useSpotState: () => ({ spot: null }) }));

const game = (over: Partial<GameState>): GameState => ({ ...newState(), ...over });
const show = (g: GameState, guild: { level: number; effects: GuildEffects } | null = null) =>
  render(<StatsModal game={g} movement="sail" region="world" nickname="바다사나이" guild={guild} onClose={vi.fn()} />);

describe('StatsModal(스탯창)', () => {
  afterEach(cleanup);

  it('고정 정보 줄에 닉네임, 배, 낚싯대 레벨, 파워를 두고 탭을 바꿔도 그대로 둔다', () => {
    show(game({ boat: 2, rod: 7 }));
    const fixed = screen.getByText('바다사나이').parentElement!;
    expect(within(fixed).getByText(boatNameOf(2))).toBeTruthy();
    expect(within(fixed).getByText('Lv.7')).toBeTruthy();
    expect(within(fixed).getByText(String(powerOfLevel(7)))).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '보너스' }));
    expect(screen.getByText('바다사나이')).toBeTruthy();
    expect(screen.getAllByText('받는 보너스가 없어요.')).toHaveLength(4);
  });

  it('보너스 탭은 효과가 든 슬롯의 효과를 요리 이름 출처와 적용 낚시와 함께 보인다', () => {
    const endsAt = new Date(Date.now() + 3_600_000).toISOString();
    show(game({ boat: 5, slots: { lunch: { id: 'cook-lunch-bite', endsAt }, bait: null } }));
    fireEvent.click(screen.getByRole('button', { name: '보너스' }));
    const row = screen.getByText('입질 대기 −10%').closest('tr')!;
    expect(within(row).getByText('가루디야')).toBeTruthy();
    expect(within(row).getByText('방치로 낚을 때만')).toBeTruthy();
    expect(screen.getAllByText('받는 보너스가 없어요.')).toHaveLength(3);
  });

  it('보너스 탭은 달빛 미끼의 비수치 효과를 중복 없이 상세 설명 한 줄로 보인다', () => {
    const endsAt = new Date(Date.now() + 3_600_000).toISOString();
    show(game({ boat: 5, slots: { lunch: null, bait: { id: 'cook-bait-night', endsAt } } }));
    fireEvent.click(screen.getByRole('button', { name: '보너스' }));
    const row = screen.getByText('낮에도 밤 어종이 함께 낚여요.').closest('tr')!;
    expect(within(row).getByText('달빛 미끼(특수)')).toBeTruthy();
    expect(within(row).getByText('챔질해서 낚을 때만')).toBeTruthy();
  });

  it('배 탭은 지역마다 열린 해역 수와 남은 해역을 여는 배를 표로 보인다', () => {
    show(game({ boat: 1 }));
    fireEvent.click(screen.getByRole('button', { name: '배' }));
    expect(screen.getByRole('columnheader', { name: '필요한 배' })).toBeTruthy();
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows.some(row => row.textContent?.includes(boatNameOf(3)))).toBe(true);
  });

  it('배 탭의 가방 용량은 길드 보너스와 래칫 초과 보유 시 툴팁을 연결한다', () => {
    show(
      game({ boat: 8 }),
      { level: 4, effects: guildEffectsOf(4, { bag: 4 }) }, // 4,000 × (1 + 0.16) = 4,640
    );
    fireEvent.click(screen.getByRole('button', { name: '배' }));
    fireEvent.mouseEnter(screen.getByText('4,640마리'));
    expect(screen.getByRole('tooltip')).toBeTruthy();

    cleanup();
    const ratchetedBag = Array.from({ length: 80 }, (_, i) => ({
      uid: `u${i}`, fishId: 'crucian', form: 'normal' as const, size: 10,
      caughtAt: null, spot: null, judgment: null, locked: false,
    }));
    show(game({ boat: 0, bag: ratchetedBag }));
    fireEvent.click(screen.getByRole('button', { name: '배' }));
    fireEvent.mouseEnter(screen.getByText('80마리'));
    expect(screen.getByRole('tooltip')).toBeTruthy();
  });

  it('스탯 창을 처음 열 때 현재 파워와 배로 진입 가능한 최고 해역을 고르고, 미달이면 최저 해역으로 폴백한다', () => {
    render(<StatsModal game={game({ rod: 1, boat: 0 })} movement="walk" region="village" nickname="바다사나이" guild={null} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '낚싯대' }));
    expect(screen.getByRole('row', { name: /마을 연못/ })).toHaveAttribute('aria-selected', 'true');
    cleanup();

    render(<StatsModal game={game({ rod: 3, boat: 0 })} movement="walk" region="village" nickname="바다사나이" guild={null} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '낚싯대' }));
    expect(screen.getByRole('row', { name: /마을 강/ })).toHaveAttribute('aria-selected', 'true');
    cleanup();

    show(game({ rod: 1, boat: 0 }));
    fireEvent.click(screen.getByRole('button', { name: '낚싯대' }));
    expect(screen.getByRole('row', { name: /태평양 연안/ })).toHaveAttribute('aria-selected', 'true');
    cleanup();

    show(game({ rod: 31, boat: 6 }));
    fireEvent.click(screen.getByRole('button', { name: '낚싯대' }));
    expect(screen.getByRole('row', { name: /남인도양/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('낚싯대 탭에서 해역 행을 고르면 그 해역 기준의 수치를 보인다', () => {
    show(game({ boat: 9, rod: 7 }));
    fireEvent.click(screen.getByRole('button', { name: '낚싯대' }));
    const table = screen.getByRole('table', { name: '해역' });
    const [first, second] = within(table).getAllByRole('row').slice(1);
    fireEvent.click(second);
    expect(second.getAttribute('aria-selected')).toBe('true');
    expect(first.getAttribute('aria-selected')).toBe('false');
    expect(screen.getByRole('meter', { name: '파워' })).toBeTruthy();
  });

  it('보너스 탭은 유물 배율(artifactBoost)이 적용된 실제 값을 각 갈래에 보이고 툴팁으로 배율 내역을 보인다', () => {
    // 전설 유물 + 이동/낚시/결투 유물 → artifactBoost +3% 적용
    show(game({
      boat: 5,
      artifacts: ['mami-wata-mirror', 'wreck-compass', 'outer-isle-sinker', 'abyss-angler'],
    }));
    fireEvent.click(screen.getByRole('button', { name: '보너스' }));

    const bonusCell = (text: string) => screen.getByText((_, el) => el?.tagName === 'TD' && el.textContent === text);

    expect(screen.getByText('항해 속도 +10.3%')).toBeTruthy();
    expect(screen.getByText('입질 대기 −10.3%')).toBeTruthy();
    expect(bonusCell('네임드 결투 가속 −10.3%')).toBeTruthy();
    expect(within(bonusCell('네임드 결투 가속 −10.3%')).getByText('네임드')).toHaveClass('text-epic');
    expect(screen.queryByText(/보유 유물 효과 \+3%/)).toBeNull();

    // 툴팁에 기본 효과, 보유 유물 효과, 적용 효과가 표시된다
    fireEvent.mouseEnter(screen.getByText('항해 속도 +10.3%'));
    const tip = screen.getByRole('tooltip');
    expect(within(tip).getByText('+10%')).toBeTruthy();
    expect(within(tip).getByText('+3%')).toBeTruthy();
    expect(within(tip).getByText('+10.3%')).toBeTruthy();
  });

  it('보너스 탭은 기본과 자유 강화가 합산된 길드 효과를 출처 길드 Lv.N과 함께 보이고 자유 강화가 있으면 툴팁으로 내역을 보인다', () => {
    const guild = {
      level: 10,
      effects: guildEffectsOf(10, { sell: 5 }, { sell: 5 }),
      bonuses: [
        { id: 'sell' as const, unlock: 1, rank: 5, enhanceRank: 5, totalRank: 10, cap: 5, pool: 0, next: null, effect: 0.2, nextEffect: null, mine: 0 },
      ],
    };
    render(<StatsModal game={game({})} movement="sail" region="world" nickname="바다사나이" guild={guild} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '보너스' }));
    const row = screen.getByText('판매가 +20%').closest('tr')!;
    expect(within(row).getByText('길드 Lv.10')).toBeTruthy();
    fireEvent.mouseEnter(screen.getByText('판매가 +20%'));
    const tip = screen.getByRole('tooltip');
    expect(within(tip).getByText('기본 5단계')).toBeTruthy();
    expect(within(tip).getByText('개인 자유 강화 5단계')).toBeTruthy();
    expect(within(tip).getByText('합계 10단계')).toBeTruthy();
  });

  it('보너스 탭은 오늘의 운세를 오늘의 운세 출처로 보이고 툴팁은 수치 없이 적용 대상만 알린다', () => {
    const today = gameDayOf(new Date().toISOString());
    show(game({ fortune: { day: today, kind: 'fish', index: 5 } }));
    fireEvent.click(screen.getByRole('button', { name: '보너스' }));
    const cell = screen.getByText((_, el) => el?.tagName === 'TD' && el.textContent === '희귀 이상 출현 확률 +5%p');
    expect(within(cell).getByText('희귀')).toHaveAttribute('data-rarity', 'rare');
    const row = cell.closest('tr')!;
    expect(within(row).getByText('오늘의 운세')).toBeTruthy();
    fireEvent.mouseEnter(within(cell).getByText('희귀'));
    const tip = screen.getByRole('tooltip');
    expect(tip).toHaveTextContent('희귀 이상 출현 확률 행운 효과가 올라가요.');
    expect(within(tip).getByText('희귀')).toHaveAttribute('data-rarity', 'rare');
  });

  it('보너스 탭은 활성 물약을 각 갈래에 +5%p 효과와 물약 아이콘·이름으로 보인다', () => {
    const today = gameDayOf(new Date().toISOString());
    show(game({ potions: { 'luck-small': today } }));
    fireEvent.click(screen.getByRole('button', { name: '보너스' }));

    const rarityRow = screen.getByText((_, el) => el?.tagName === 'TD' && el.textContent === '희귀 이상 출현 확률 +5%p').closest('tr')!;
    expect(within(rarityRow).getByText('작은 행운 물약')).toBeTruthy();
    expect(within(rarityRow).getByText('(특수)')).toHaveAttribute('data-rarity', 'special');
    expect(rarityRow.querySelector('canvas')).not.toBeNull();

    const namedCell = screen.getByText((_, el) => el?.tagName === 'TD' && el.textContent === '네임드 만날 확률 +5%p');
    expect(namedCell).toBeTruthy();
    expect(within(namedCell).getByText('네임드')).toHaveClass('text-epic');
    expect(screen.getByText('판매가 +5%p')).toBeTruthy();

    fireEvent.mouseEnter(screen.getByText('판매가 +5%p'));
    expect(screen.getByRole('tooltip')).toHaveTextContent('마시면 하루 동안 모든 행운 효과가 +5%p 올라요.');
  });

  it('닉네임 상태에 따라 불러오는 중, 미설정, 불러오기 실패를 구분해 보인다', () => {
    const { rerender } = render(
      <StatsModal game={game({})} movement="sail" region="world" nickname={null} profileStatus="loading" guild={null} onClose={vi.fn()} />,
    );
    expect(screen.getByText('불러오는 중')).toBeTruthy();

    rerender(<StatsModal game={game({})} movement="sail" region="world" nickname={null} profileStatus="loaded" guild={null} onClose={vi.fn()} />);
    expect(screen.getByText('미설정')).toBeTruthy();

    rerender(<StatsModal game={game({})} movement="sail" region="world" nickname={null} profileStatus="error" guild={null} onClose={vi.fn()} />);
    expect(screen.getByText('불러오기 실패')).toBeTruthy();
  });
});
