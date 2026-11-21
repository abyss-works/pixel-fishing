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

/** 강조 테두리 — 기본 틀 테두리 위에 덧쓰는 색 테두리 클래스(임의 색 또는 토큰 색) */
const emphasizedBorder = (element: HTMLElement) =>
  /\bborder-\[[^\]]+\]/.test(element.className)
  || /\bborder-(?:accent|gold|gold-dark|legend|rare|epic|common|special|danger)\b/.test(element.className);

/** 카드 뿌리와 그 세 블록(정보, 보상 칸, 상태 줄) */
const cardParts = (container: HTMLElement) => {
  const root = container.firstElementChild as HTMLElement;
  const [info, reward, status] = [...root.children] as HTMLElement[];
  return { root, info, reward, status };
};

describe('업적 카드', () => {
  it('받을 수 있는 카드는 받기 버튼만 두고 접근성 이름에 업적 이름을 붙인다', () => {
    const game = seed({ achievements: { 'spot-basic-sea': 'claimable' } });
    const { onClaim } = show(game, 'spot-basic-sea');
    const button = screen.getByRole('button', { name: '받기, 태평양 연안 기초' });
    expect(button).toBeEnabled();
    expect(screen.queryByText('진행 중')).toBeNull();
    expect(screen.queryByText('받음')).toBeNull();
    fireEvent.click(button);
    expect(onClaim).toHaveBeenCalledTimes(1);
  });

  it('진행 중인 카드는 상태 글자만 두고 버튼을 그리지 않는다', () => {
    const { container } = show(seed(), 'spot-basic-sea');
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('진행 중')).toBeInTheDocument();
    expect(focusables(container)).toHaveLength(0);
  });

  it('받은 카드는 받음 글자만 두고 버튼을 그리지 않으며 보상 칸은 남긴다', () => {
    const game = seed({ achievements: { 'spot-basic-sea': 'claimed' } });
    const { container } = show(game, 'spot-basic-sea');
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('받음')).toBeInTheDocument();
    expect(screen.getByText('300G')).toBeInTheDocument();
    expect(focusables(container)).toHaveLength(0);
  });

  it('카드 본문은 포커스를 받지 않고 받기 버튼만 받는다', () => {
    const game = seed({ achievements: { 'spot-basic-sea': 'claimable' } });
    const { container } = show(game, 'spot-basic-sea');
    const root = container.firstElementChild as HTMLElement;
    expect(root).not.toHaveAttribute('tabindex');
    expect(focusables(container)).toEqual([screen.getByRole('button', { name: '받기, 태평양 연안 기초' })]);
  });

  it('이름, 조건, 금액은 말줄임하지 않고 카드 안에서 줄을 바꾼다', () => {
    const game = seed({ achievements: { 'spot-basic-sea': 'claimable' } });
    const { container, row } = show(game, 'spot-basic-sea');
    const name = container.querySelector('[data-achievement-name]') as HTMLElement;
    const desc = container.querySelector('[data-achievement-desc]') as HTMLElement;
    const amount = container.querySelector('[data-achievement-reward]') as HTMLElement;
    expect(name).toHaveTextContent(row.def.name);
    expect(desc).toHaveTextContent(row.def.desc);
    expect(amount).toHaveTextContent('300G');
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
    const { row } = show(game, 'spot-basic-sea');
    expect(screen.getByText(`${row.progress.current}/${row.progress.target}`)).toBeInTheDocument();
    const fill = document.querySelector('[data-achievement-gauge-fill]') as HTMLElement;
    expect(fill.style.width).toBe(`${Math.min(row.progress.current, row.progress.target) / row.progress.target * 100}%`);

    cleanup();
    const half: AchievementRow = { def: row.def, status: 'progress', progress: { current: 1, target: 4 } };
    show(game, 'spot-basic-sea', { row: half });
    expect(screen.getByText('1/4')).toBeInTheDocument();
    expect((document.querySelector('[data-achievement-gauge-fill]') as HTMLElement).style.width).toBe('25%');
  });

  it('목표가 0이면 게이지를 채우지 않는다', () => {
    const game = seed();
    const { row } = show(game, 'spot-basic-sea');
    cleanup();
    show(game, 'spot-basic-sea', { row: { def: row.def, status: 'progress', progress: { current: 3, target: 0 } } });
    expect(screen.getByText('3/0')).toBeInTheDocument();
    expect((document.querySelector('[data-achievement-gauge-fill]') as HTMLElement).style.width).toBe('0%');
  });

  it('진척 막대의 값 범위는 목표가 0이어도 유효하다', () => {
    const game = seed();
    const { row } = show(game, 'spot-basic-sea');
    cleanup();
    show(game, 'spot-basic-sea', { row: { def: row.def, status: 'progress', progress: { current: 3, target: 0 } } });
    const meter = screen.getByRole('meter');
    const min = Number(meter.getAttribute('aria-valuemin'));
    const max = Number(meter.getAttribute('aria-valuemax'));
    const now = Number(meter.getAttribute('aria-valuenow'));
    expect(max).toBeGreaterThan(min);
    expect(now).toBeGreaterThanOrEqual(min);
    expect(now).toBeLessThanOrEqual(max);
  });

  it('진척 막대의 접근성 이름에 업적 이름이 들어간다', () => {
    const { row } = show(seed(), 'spot-basic-sea');
    expect(screen.getByRole('meter', { name: `진척, ${row.def.name}` })).toBeInTheDocument();
  });

  it('카드 자리는 이름표, 조건, 진척, 보상 칸, 상태 줄 순서다', () => {
    const { container } = show(seed(), 'spot-basic-sea');
    const { root, info, reward, status } = cardParts(container);
    expect(root.children).toHaveLength(3);
    const name = info.querySelector('[data-achievement-name]') as HTMLElement;
    const desc = info.querySelector('[data-achievement-desc]') as HTMLElement;
    const meter = info.querySelector('[role="meter"]') as HTMLElement;
    expect(info.children[0]).toBe(name);
    expect(info.children[1]).toBe(desc);
    expect(info.children[2]).toBe(meter.parentElement);
    expect(reward.querySelector('[data-achievement-reward]')).not.toBeNull();
    expect(status).toHaveTextContent('진행 중');
    const order = [name, desc, meter, reward, status];
    for (let i = 1; i < order.length; i++) {
      expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it('상태와 받기 줄은 상태가 달라도 같은 고정 높이를 쓴다', () => {
    const progress = show(seed(), 'spot-basic-sea');
    const progressStatus = cardParts(progress.container).status;
    cleanup();
    const claimable = show(seed({ achievements: { 'spot-basic-sea': 'claimable' } }), 'spot-basic-sea');
    const claimableStatus = cardParts(claimable.container).status;
    const heightOf = (element: HTMLElement) => element.className.match(/(?:^|\s)(h-\S+)/)?.[1] ?? null;
    expect(heightOf(progressStatus)).not.toBeNull();
    expect(heightOf(claimableStatus)).toBe(heightOf(progressStatus));
  });

  it('보상 칸은 위 정보와 1px 선으로 나뉜다', () => {
    const { container } = show(seed(), 'spot-basic-sea');
    expect(cardParts(container).reward).toHaveClass('border-t', 'border-line');
  });

  it('받은 카드는 전체가 흐려지고 보상 칸 값은 남는다', () => {
    const game = seed({ achievements: { 'spot-basic-sea': 'claimed' } });
    const { container } = show(game, 'spot-basic-sea');
    const { root, reward } = cardParts(container);
    const dim = root.className.match(/(?:^|\s)opacity-(\d+)/);
    expect(dim).not.toBeNull();
    expect(Number(dim?.[1])).toBeLessThan(100);
    expect(reward.querySelector('[data-achievement-reward]')).toHaveTextContent('300G');
  });

  it('받을 수 있는 카드만 테두리를 강조한다', () => {
    const claimable = show(seed({ achievements: { 'spot-basic-sea': 'claimable' } }), 'spot-basic-sea');
    expect(emphasizedBorder(cardParts(claimable.container).root)).toBe(true);
    cleanup();
    const progress = show(seed(), 'spot-basic-sea');
    expect(emphasizedBorder(cardParts(progress.container).root)).toBe(false);
  });
});
