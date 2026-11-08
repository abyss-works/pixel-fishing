// 스탯창: 제목 아래 고정 정보 줄(닉네임, 배, 낚싯대 레벨, 파워)과 네 탭.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { boatNameOf } from '../../../../game/content/boats';
import { newState } from '../../../../game/rules/logic';
import type { GameState } from '../../../../game/rules/logic';
import { powerOfLevel } from '../../../../game/rules/stats';
import StatsModal from './StatsModal';

vi.mock('../../../../features/travel/service/useSpotState', () => ({ useSpotState: () => ({ spot: null }) }));

const game = (over: Partial<GameState>): GameState => ({ ...newState(), ...over });
const show = (g: GameState) =>
  render(<StatsModal game={g} movement="sail" region="world" nickname="바다사나이" guild={null} onClose={vi.fn()} />);

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

  it('배 탭은 지역마다 열린 해역 수와 남은 해역을 여는 배를 표로 보인다', () => {
    show(game({ boat: 1 }));
    fireEvent.click(screen.getByRole('button', { name: '배' }));
    expect(screen.getByRole('columnheader', { name: '필요한 배' })).toBeTruthy();
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows.some(row => row.textContent?.includes(`${boatNameOf(3)}(3단계)`))).toBe(true);
  });

  it('낚싯대 탭에서 해역 행을 고르면 그 해역 기준의 수치를 보인다', () => {
    show(game({ boat: 8, rod: 7 }));
    fireEvent.click(screen.getByRole('button', { name: '낚싯대' }));
    const table = screen.getByRole('table', { name: '해역' });
    const [first, second] = within(table).getAllByRole('row').slice(1);
    fireEvent.click(second);
    expect(second.getAttribute('aria-selected')).toBe('true');
    expect(first.getAttribute('aria-selected')).toBe('false');
    expect(screen.getByRole('meter', { name: '파워' })).toBeTruthy();
  });
});
