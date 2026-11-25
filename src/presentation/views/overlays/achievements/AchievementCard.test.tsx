// 업적 카드 — 카드 규칙을 고정한다. 받기는 카드 안의 유일한 포커스 대상이고, 이름·조건·보상 글자는
// 카드 안에서 줄을 바꾸며 잘라 내지 않는다. 상태 셋의 버튼과 글자는 명세의 표를 따른다.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { newState } from '../../../../game/rules/logic';
import type { GameState } from '../../../../game/rules/logic';
import {
  achievementRowById,
  cosmeticCards,
  cumulativeBonusCards,
} from '../../../../features/achievement/model/achievements';
import type { AchievementRow, NamedGroupCardModel } from '../../../../features/achievement/model/achievements';
import AchievementCard, { CumulativeBonusCard, NamedGroupCard } from './AchievementCard';

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

  it('진척은 천 단위 쉼표를 넣어 현재 / 목표를 쓰고 게이지 채움은 목표에 대한 비율이다', () => {
    const game = seed();
    const { row } = show(game, 'spot-basic-sea');
    expect(document.querySelector('[data-progress-count] + *') || screen.getByRole('meter').parentElement).toHaveTextContent(`${row.progress.current} / ${row.progress.target}`);
    const fill = document.querySelector('[data-achievement-gauge-fill]') as HTMLElement;
    expect(fill.style.width).toBe(`${Math.min(row.progress.current, row.progress.target) / row.progress.target * 100}%`);

    cleanup();
    const half: AchievementRow = { def: row.def, status: 'progress', progress: { current: 1250, target: 5000 } };
    show(game, 'spot-basic-sea', { row: half });
    expect(screen.getByRole('meter').parentElement).toHaveTextContent('1,250 / 5,000');
    expect((document.querySelector('[data-achievement-gauge-fill]') as HTMLElement).style.width).toBe('25%');
  });

  it('목표가 0이면 게이지를 채우지 않는다', () => {
    const game = seed();
    const { row } = show(game, 'spot-basic-sea');
    cleanup();
    show(game, 'spot-basic-sea', { row: { def: row.def, status: 'progress', progress: { current: 3, target: 0 } } });
    expect(screen.getByRole('meter').parentElement).toHaveTextContent('3 / 0');
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
    expect(info.children[0]).toContainElement(name);
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

  it('받은 카드는 opacity-50 흐림 대신 깊은 오목(bg-bg) 스타일과 선명한 제목(text-text)을 쓰고 보상 칸 값은 남는다', () => {
    const game = seed({ achievements: { 'spot-basic-sea': 'claimed' } });
    const { container } = show(game, 'spot-basic-sea');
    const { root, reward } = cardParts(container);
    expect(root).not.toHaveClass('opacity-50');
    expect(root).toHaveClass('bg-bg');
    expect(container.querySelector('[data-achievement-name]')).toHaveClass('text-text');
    expect(screen.getByText('완료')).not.toHaveClass('rounded-sm');
    expect(reward.querySelector('[data-achievement-reward]')).toHaveTextContent('300G');
  });

  it('받을 수 있는 카드만 금색 테두리로 강조하고 일반 카드는 Frame을 겹치지 않는다', () => {
    const claimable = show(seed({ achievements: { 'spot-basic-sea': 'claimable' } }), 'spot-basic-sea');
    expect(emphasizedBorder(cardParts(claimable.container).root)).toBe(true);
    expect(cardParts(claimable.container).root).not.toHaveClass('pf-frame');
    cleanup();
    const progress = show(seed(), 'spot-basic-sea');
    expect(emphasizedBorder(cardParts(progress.container).root)).toBe(false);
    expect(cardParts(progress.container).root).not.toHaveClass('pf-frame');
  });
});

describe('누적 보너스 카드', () => {
  it('전체 카드는 범위 문구를 숨기고, 단일 분절 게이지(meter 1개)와 단계 수를 보인다', () => {
    const game = seed({ achievementCounters: { 'manual.total': 100 } });
    const card = cumulativeBonusCards(game).find(c => c.series.scope === 'global' && c.current === 100)!;
    render(<CumulativeBonusCard card={card} />);
    expect(screen.queryByText('전체')).toBeNull();
    expect(screen.getAllByRole('meter')).toHaveLength(1);
    expect(screen.getByText(`${card.steps.filter(s => s.state === 'done').length} / ${card.steps.length}단계`)).toBeInTheDocument();
    expect(screen.queryByText(`${card.steps[0].label} (${card.steps[0].deltaText})`)).toBeNull();

    fireEvent.mouseEnter(screen.getByText(card.activeText));
    const tooltip = screen.getByRole('tooltip');
    for (const step of card.steps) {
      expect(tooltip).toHaveTextContent(step.label);
      expect(tooltip).toHaveTextContent(step.deltaText);
    }
    expect(tooltip).toHaveTextContent(card.maxText);
  });

  it('구역 한정 카드는 구역 이름을 보이고 최대 단계에 닿으면 최대 단계를 표시한다', () => {
    const base = cumulativeBonusCards(seed()).find(c => c.series.scope === 'zone')!;
    const maxCard = { ...base, allDone: true, steps: base.steps.map(s => ({ ...s, state: 'done' as const })) };
    render(<CumulativeBonusCard card={maxCard} />);
    expect(screen.getByText(maxCard.scopeLabel)).toBeInTheDocument();
    expect(screen.getByText('최대 단계')).toBeInTheDocument();
  });
});

describe('네임드 다회 토벌 카드', () => {
  const pickGroup = (game: GameState): NamedGroupCardModel =>
    cosmeticCards(game, 'named').find((item): item is NamedGroupCardModel => item.kind === 'namedGroup')!;

  it('미토벌 카드는 모자 이름·실루엣·툴팁까지 모두 스포일러를 가린다', () => {
    const game = seed();
    const card = pickGroup(game);
    expect(card.discovered).toBe(false);
    render(<NamedGroupCard card={card} game={game} busy={false} onClaim={vi.fn()} />);
    expect(screen.queryByText('1회')).toBeNull();
    expect(screen.queryByText('5회')).toBeNull();
    expect(screen.queryByText('10회')).toBeNull();
    expect(screen.getByText('미확인 모자')).toBeInTheDocument();
    expect(screen.getByText('토벌하면 정체와 모자가 열려요')).toBeInTheDocument();

    fireEvent.mouseEnter(screen.getByText('미확인 모자'));
    const tooltip = screen.getByRole('tooltip');
    for (const step of card.steps) {
      expect(tooltip).toHaveTextContent(step.label);
      expect(tooltip).not.toHaveTextContent(step.hatName);
    }
    expect(tooltip).toHaveTextContent('???');
  });

  it('토벌한 카드는 보상 모자 툴팁으로 전체 단계를 보인다', () => {
    const base = pickGroup(seed());
    const firstId = base.steps[0].id;
    const game = seed({ clearedNamed: ['pacific-named-megalodon'], achievements: { [firstId]: 'claimable' } });
    const card = cosmeticCards(game, 'named').find(
      (item): item is NamedGroupCardModel => item.kind === 'namedGroup' && item.groupId === base.groupId,
    )!;
    expect(card.discovered).toBe(true);
    render(<NamedGroupCard card={card} game={game} busy={false} onClaim={vi.fn()} />);
    fireEvent.mouseEnter(screen.getByText(card.steps[0].hatName));
    const tooltip = screen.getByRole('tooltip');
    for (const step of card.steps) {
      expect(tooltip).toHaveTextContent(step.label);
      expect(tooltip).toHaveTextContent(step.hatName);
    }
  });

  it('받을 수 있는 단계가 있으면 받기 버튼으로 해당 단계를 수령한다', () => {
    const base = pickGroup(seed());
    const firstId = base.steps[0].id;
    const game = seed({ achievements: { [firstId]: 'claimable' } });
    const card = cosmeticCards(game, 'named').find(
      (item): item is NamedGroupCardModel => item.kind === 'namedGroup' && item.groupId === base.groupId,
    )!;
    const onClaim = vi.fn();
    render(<NamedGroupCard card={card} game={game} busy={false} onClaim={onClaim} />);
    const button = screen.getByRole('button', { name: `받기, ${card.activeRow.def.name}` });
    fireEvent.click(button);
    expect(onClaim).toHaveBeenCalledWith(card.activeRow);
  });
});
