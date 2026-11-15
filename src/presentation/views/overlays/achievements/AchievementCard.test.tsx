// 업적 카드 — 카드 규칙을 고정한다. 받기는 카드 안의 유일한 포커스 대상이고, 이름·조건·보상 글자는
// 카드 안에서 줄을 바꾸며 잘라 내지 않는다. 상태 셋의 버튼과 글자는 명세의 표를 따른다.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { newState } from '../../../../game/rules/logic';
import type { GameState } from '../../../../game/rules/logic';
import { achievementRowById } from '../../../../features/achievement/model/achievements';
import type { AchievementRow } from '../../../../features/achievement/model/achievements';
import AchievementCard from './AchievementCard';

afterEach(cleanup);

const seed = (over: Partial<GameState> = {}): GameState => ({ ...newState(), ...over });

/** 말줄임 표기(truncate와 그를 이루는 클래스)가 없음을 클래스마다 확인한다 */
const expectNoEllipsis = (element: HTMLElement) => {
  for (const name of ['truncate', 'overflow-hidden', 'text-ellipsis', 'line-clamp-1']) expect(element).not.toHaveClass(name);
};

function show(game: GameState, id: string, over: { guest?: boolean; busy?: boolean; row?: AchievementRow } = {}) {
  const row = over.row ?? achievementRowById(game, id);
  if (!row) throw new Error(`업적 없음: ${id}`);
  const onClaim = vi.fn();
  const { container } = render(
    <AchievementCard row={row} game={game} guest={over.guest ?? false} busy={over.busy ?? false} onClaim={onClaim} />,
  );
  return { onClaim, row, container };
}

/** 포커스를 받을 수 있는 요소 — 카드 본문은 빠지고 동작 버튼만 남아야 한다 */
const focusables = (root: HTMLElement) =>
  [...root.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, [tabindex]')];

describe('업적 카드', () => {
  it('받을 수 있는 카드는 받기 버튼만 두고 접근성 이름에 업적 이름을 붙인다', () => {
    const game = seed({ achievements: { 'zone-basic-pacific': 'claimable' } });
    const { onClaim } = show(game, 'zone-basic-pacific');
    const button = screen.getByRole('button', { name: '받기, 태평양 도감' });
    expect(button).toBeEnabled();
    expect(screen.queryByText('진행 중')).toBeNull();
    expect(screen.queryByText('받음')).toBeNull();
    fireEvent.click(button);
    expect(onClaim).toHaveBeenCalledTimes(1);
  });

  it('진행 중인 카드는 상태 글자만 두고 버튼을 그리지 않는다', () => {
    const { container } = show(seed(), 'zone-basic-pacific');
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('진행 중')).toBeInTheDocument();
    expect(focusables(container)).toHaveLength(0);
  });

  it('받은 카드는 받음 글자만 두고 버튼을 그리지 않으며 보상 칸은 남긴다', () => {
    const game = seed({ achievements: { 'zone-basic-pacific': 'claimed' } });
    const { container } = show(game, 'zone-basic-pacific');
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('받음')).toBeInTheDocument();
    expect(screen.getByText('25,000G')).toBeInTheDocument();
    expect(focusables(container)).toHaveLength(0);
  });

  it('카드 본문은 포커스를 받지 않고 받기 버튼만 받는다', () => {
    const game = seed({ achievements: { 'zone-basic-pacific': 'claimable' } });
    const { container } = show(game, 'zone-basic-pacific');
    const root = container.firstElementChild as HTMLElement;
    expect(root).not.toHaveAttribute('tabindex');
    expect(focusables(container)).toEqual([screen.getByRole('button', { name: '받기, 태평양 도감' })]);
  });

  it('이름, 조건, 금액은 말줄임하지 않고 카드 안에서 줄을 바꾼다', () => {
    const game = seed({ achievements: { 'zone-basic-pacific': 'claimable' } });
    const { container, row } = show(game, 'zone-basic-pacific');
    const name = container.querySelector('[data-achievement-name]') as HTMLElement;
    const desc = container.querySelector('[data-achievement-desc]') as HTMLElement;
    const amount = container.querySelector('[data-achievement-reward]') as HTMLElement;
    expect(name).toHaveTextContent(row.def.name);
    expect(desc).toHaveTextContent(row.def.desc);
    expect(amount).toHaveTextContent('25,000G');
    for (const element of [name, desc, amount]) {
      expectNoEllipsis(element);
      expect(element).not.toHaveClass('whitespace-nowrap');
      expect(element).toHaveClass('break-keep', 'break-words');
    }
  });

  it('모자 보상 카드는 모자 이름을 말줄임 없이 쓰고 머리 그림을 장식으로 둔다', () => {
    const game = seed({ achievements: { 'variant-village': 'claimed' } });
    const { container } = show(game, 'variant-village');
    const name = container.querySelector('[data-achievement-reward]') as HTMLElement;
    expect(name).toHaveTextContent('밀짚모자');
    expectNoEllipsis(name);
    expect(name).toHaveClass('break-keep', 'break-words');
    const canvas = container.querySelector('canvas');
    expect(canvas).not.toBeNull();
    expect(canvas).toHaveAttribute('aria-hidden', 'true');
  });

  it('진척은 현재/목표를 숫자로 쓰고 게이지 채움은 목표에 대한 비율이다', () => {
    const game = seed();
    const { row } = show(game, 'zone-basic-pacific');
    expect(screen.getByText(`${row.progress.current}/${row.progress.target}`)).toBeInTheDocument();
    const fill = document.querySelector('[data-achievement-gauge-fill]') as HTMLElement;
    expect(fill.style.width).toBe(`${Math.min(row.progress.current, row.progress.target) / row.progress.target * 100}%`);

    cleanup();
    const half: AchievementRow = { def: row.def, status: 'progress', progress: { current: 1, target: 4 } };
    show(game, 'zone-basic-pacific', { row: half });
    expect(screen.getByText('1/4')).toBeInTheDocument();
    expect((document.querySelector('[data-achievement-gauge-fill]') as HTMLElement).style.width).toBe('25%');
  });

  it('목표가 0이면 게이지를 채우지 않는다', () => {
    const game = seed();
    const { row } = show(game, 'zone-basic-pacific');
    cleanup();
    show(game, 'zone-basic-pacific', { row: { def: row.def, status: 'progress', progress: { current: 3, target: 0 } } });
    expect(screen.getByText('3/0')).toBeInTheDocument();
    expect((document.querySelector('[data-achievement-gauge-fill]') as HTMLElement).style.width).toBe('0%');
  });
});
