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

  it('보너스 탭은 효과가 든 슬롯의 효과를 방치·수동 배지와 [도시락]·[미끼] 툴팁으로 보인다', () => {
    const endsAt = new Date(Date.now() + 3_600_000).toISOString();
    show(game({ boat: 5, slots: { lunch: { id: 'cook-lunch-bite', endsAt }, bait: null } }));
    fireEvent.click(screen.getByRole('button', { name: '보너스' }));
    const row = screen.getByText('입질 대기').closest('tr')!;
    expect(row).toHaveTextContent('−10%');
    expect(within(row).getByText('방치')).toBeTruthy();
    expect(screen.getAllByText('받는 보너스가 없어요.')).toHaveLength(3);
    fireEvent.mouseEnter(screen.getByText('입질 대기'));
    expect(screen.getByRole('tooltip')).toHaveTextContent('[도시락] 가루디야−10%');
  });

  it('보너스 탭은 달빛 미끼의 비수치 효과를 중복 없이 상세 설명 한 줄과 수동 배지로 보인다', () => {
    const endsAt = new Date(Date.now() + 3_600_000).toISOString();
    show(game({ boat: 5, slots: { lunch: null, bait: { id: 'cook-bait-night', endsAt } } }));
    fireEvent.click(screen.getByRole('button', { name: '보너스' }));
    const row = screen.getByText('낮에도 밤 어종이 함께 낚여요.').closest('tr')!;
    expect(within(row).getByText('수동')).toBeTruthy();
    fireEvent.mouseEnter(screen.getByText('낮에도 밤 어종이 함께 낚여요.'));
    expect(screen.getByRole('tooltip')).toHaveTextContent('[미끼] 달빛 미끼');
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

  it('보너스 탭은 출처 열 없이 효과 1줄로 합산하고 유물 증폭 배수를 툴팁에 합연산→곱연산·최종 적용 순으로 보인다', () => {
    // 전설 유물(+2.5%) + 일반 유물 3개 Lv1(각 +0.5%) → artifactBoost +4% (×1.04)
    show(game({
      boat: 5,
      artifacts: ['mami-wata-mirror', 'wreck-compass', 'outer-isle-sinker', 'abyss-angler'],
    }));
    fireEvent.click(screen.getByRole('button', { name: '보너스' }));

    // 우측 출처 열 머리가 없다
    expect(screen.queryByRole('columnheader', { name: '출처' })).toBeNull();
    expect(screen.getByRole('columnheader', { name: '받는 효과' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '적용' })).toBeInTheDocument();

    const rowOf = (label: string) => screen.getByText((_, el) => el?.tagName === 'TR' && (el.textContent ?? '').includes(label))!;
    expect(rowOf('항해 속도')).toHaveTextContent('+10.4%');
    expect(rowOf('입질 대기')).toHaveTextContent('−10.4%');
    const duelRow = rowOf('네임드 결투 가속');
    expect(duelRow).toHaveTextContent('−10.4%');
    expect(within(duelRow).getByText('네임드')).toHaveClass('text-named');
    expect(screen.queryByText(/유물 증폭 \+4%/)).toBeNull();

    // 툴팁에 [유물] 기본 효과, [업적] 유물 증폭 ×1.04, 최종 적용이 표시된다
    fireEvent.mouseEnter(screen.getByText('항해 속도'));
    const tip = screen.getByRole('tooltip');
    expect(tip).toHaveTextContent('[유물] 침선의 나침반+10%');
    expect(tip).toHaveTextContent('[업적] 유물 증폭×1.04');
    expect(tip).toHaveTextContent('최종 적용+10.4%');
  });

  it('보너스 탭은 기본과 자유 강화가 합산된 길드 효과를 [길드] 툴팁으로 보인다', () => {
    const guild = {
      level: 10,
      effects: guildEffectsOf(10, { sell: 5 }, { sell: 5 }),
      bonuses: [
        { id: 'sell' as const, unlock: 1, rank: 5, enhanceRank: 5, totalRank: 10, cap: 5, pool: 0, next: null, effect: 0.2, nextEffect: null, mine: 0 },
      ],
    };
    render(<StatsModal game={game({})} movement="sail" region="world" nickname="바다사나이" guild={guild} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '보너스' }));
    const row = screen.getByText('판매가').closest('tr')!;
    expect(row).toHaveTextContent('+20%');
    expect(screen.queryByText('길드 Lv.10')).toBeNull();
    fireEvent.mouseEnter(screen.getByText('판매가'));
    const tip = screen.getByRole('tooltip');
    expect(tip).toHaveTextContent('[길드] 판매가 보너스 (10단)+20%');
    expect(tip).toHaveTextContent('최종 적용+20%');
  });

  it('보너스 탭은 오늘의 운세와 비약을 독립 곱연산(×1.1025)으로 합치고 [운세]·[비약] 툴팁으로 보인다', () => {
    const today = gameDayOf(new Date().toISOString());
    show(game({ fortune: { day: today, kind: 'fish', index: 5 }, potions: { 'luck-small': today } }));
    fireEvent.click(screen.getByRole('button', { name: '보너스' }));
    const rareRow = screen.getByText((_, el) => el?.tagName === 'TR' && (el.textContent ?? '').includes('희귀 이상 출현 비중'))!;
    expect(within(rareRow).getByText('희귀')).toHaveAttribute('data-rarity', 'rare');
    expect(rareRow).toHaveTextContent('×1.1025');
    fireEvent.mouseEnter(within(rareRow).getByText('희귀'));
    const tip = screen.getByRole('tooltip');
    expect(tip).toHaveTextContent('[운세] 풍어운×1.05');
    expect(tip).toHaveTextContent('[비약] 작은 바다 영약×1.05');
    expect(tip).toHaveTextContent('최종 적용×1.1025');

    const namedRow = screen.getByText((_, el) => el?.tagName === 'TR' && (el.textContent ?? '').includes('네임드 조우 확률'))!;
    expect(namedRow).toHaveTextContent('×1.05');
    expect(within(namedRow).getByText('네임드')).toHaveClass('text-named');
    const sellRow = screen.getByText((_, el) => el?.tagName === 'TR' && (el.textContent ?? '').includes('판매가'))!;
    expect(sellRow).toHaveTextContent('×1.05');
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

  it('요약 탭은 현재 파워가 기준보다 낮으면 툴팁을 열지 않아도 페널티를 본문에 보인다', () => {
    show(game({ rod: 1, boat: 6 })); // 태평양 외해/인도양 등 기준 미달이 아닌, 실제 미달이 되도록 spotState 없이도 기본 선택되는 태평양 연안(req=20, Lv1=10)
    expect(screen.getByText(/GOOD과 PERFECT 영역이 사라지고/)).toBeInTheDocument();
  });
});
