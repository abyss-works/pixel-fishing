// 도감 탭 — 1단 보기 서브탭(일반·네임드·이벤트), 제목 줄 우측 돌연변이 토글, 2단 구역 서브탭 구성을 고정한다.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { FISH, newState } from '../../../../../game/rules/logic';
import type { EventDexSnapshot } from '../../../../../platform/api/types';
import DexTab from './DexTab';

const mockEventDex = vi.hoisted(() => ({
  value: undefined as EventDexSnapshot | undefined,
}));

vi.mock('../../../../../features/events/service/useEvents', () => ({
  useEvents: () => ({
    snap: mockEventDex.value ? { now: '2026-11-28T00:00:00Z', events: [], trio: null, championship: null, draw: null, eventDex: mockEventDex.value } : null,
    loaded: true,
    failed: false,
    offline: false,
    refresh: () => {},
  }),
}));

afterEach(() => {
  cleanup();
  mockEventDex.value = undefined;
});

describe('DexTab - 1단 서브탭 및 돌연변이 토글', () => {
  it('1단에 일반·네임드·이벤트 보기 서브탭, 제목 줄 우측에 돌연변이 토글, 2단에 구역 서브탭을 둔다', () => {
    const onView = vi.fn();
    const onToggleForm = vi.fn();
    const onSub = vi.fn();
    render(
      <DexTab
        game={newState()}
        view="base"
        onView={onView}
        form="normal"
        onToggleForm={onToggleForm}
        sub="village"
        onSub={onSub}
      />,
    );

    const baseBtn = screen.getByRole('button', { name: '일반' });
    const namedBtn = screen.getByRole('button', { name: '네임드' });
    const eventBtn = screen.getByRole('button', { name: '이벤트' });
    expect(baseBtn).toHaveAttribute('aria-pressed', 'true');
    expect(namedBtn).toHaveAttribute('aria-pressed', 'false');
    expect(eventBtn).toHaveAttribute('aria-pressed', 'false');

    const variantToggle = screen.getByRole('button', { name: '돌연변이' });
    expect(variantToggle).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(variantToggle);
    expect(onToggleForm).toHaveBeenCalledTimes(1);

    const zoneBtn = screen.getByRole('button', { name: /^태평양/ });
    expect(zoneBtn).toBeInTheDocument();

    fireEvent.click(namedBtn);
    expect(onView).toHaveBeenCalledWith('named');
    fireEvent.click(eventBtn);
    expect(onView).toHaveBeenCalledWith('event');
    fireEvent.click(zoneBtn);
    expect(onSub).toHaveBeenCalledWith('pacific');
  });

  it('네임드 보기에서는 돌연변이 토글이 없고 2단 구역에서 마을만 빠진다', () => {
    render(
      <DexTab
        game={newState()}
        view="named"
        onView={vi.fn()}
        form="normal"
        onToggleForm={vi.fn()}
        sub="village"
        onSub={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: '네임드' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '일반' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '이벤트' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '돌연변이' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^마을/ })).toBeNull();
    expect(screen.getByRole('button', { name: /^태평양/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('일반 어종 보기에서 해역별 진행도를 보이고, 일반 폼을 모두 채운 해역에만 완성 배지를 표시한다', () => {
    const pondFish = FISH.filter(f => f.spot === 'pond');
    const riverFish = FISH.filter(f => f.spot === 'river');
    const game = newState();
    for (const f of pondFish) game.dex[f.id] = { normal: { count: 1, maxSize: 10, first: null } };
    for (const f of riverFish) game.dex[f.id] = { variant: { count: 1, maxSize: 10, first: null } };

    const { rerender } = render(
      <DexTab
        game={game}
        view="base"
        onView={vi.fn()}
        form="normal"
        onToggleForm={vi.fn()}
        sub="village"
        onSub={vi.fn()}
      />,
    );
    const pondHeading = screen.getByRole('heading', { level: 5, name: /마을 연못/ });
    expect(pondHeading).toHaveTextContent(`${pondFish.length}/${pondFish.length}`);
    expect(within(pondHeading).getByText('완성')).toBeInTheDocument();

    const riverHeading = screen.getByRole('heading', { level: 5, name: /마을 강/ });
    expect(riverHeading).toHaveTextContent(`0/${riverFish.length}`);
    expect(within(riverHeading).queryByText('완성')).toBeNull();

    // 돌연변이 토글 활성 상태에서는 일반 도감 완성 배지를 표시하지 않고, 제목은 '일반 어종'을 유지하며 (n/n)만 강조 색을 쓴다
    rerender(
      <DexTab
        game={game}
        view="base"
        onView={vi.fn()}
        form="variant"
        onToggleForm={vi.fn()}
        sub="village"
        onSub={vi.fn()}
      />,
    );
    expect(screen.queryByText('완성')).toBeNull();
    const variantHeading = screen.getByRole('heading', { level: 3, name: /^일반 어종/ });
    expect(within(variantHeading).getByText(/^\(\d+\/\d+\)$/)).toHaveClass('text-mutation');
  });

  it('이벤트 보기에서 어종 카드와 상세 창(등장한 이벤트)을 표시한다', () => {
    mockEventDex.value = {
      counts: {
        'event-boxfish': { normal: 4, variant: 1 },
      },
      appearances: {
        'event-boxfish': [
          {
            eventId: 'ev-1',
            title: '제1회 강태공 선수권',
            startsAt: '2026-11-01T00:00:00Z',
            endsAt: '2026-11-07T23:59:59Z',
          },
        ],
      },
    };

    const { rerender } = render(
      <DexTab
        game={newState()}
        view="event"
        onView={vi.fn()}
        form="normal"
        onToggleForm={vi.fn()}
        sub="village"
        onSub={vi.fn()}
      />,
    );

    const normalEventHeading = screen.getByRole('heading', { level: 3, name: '이벤트 어종 (1/9)' });
    expect(normalEventHeading).toBeInTheDocument();
    expect(within(normalEventHeading).getByText('(1/9)')).not.toHaveClass('text-mutation');
    expect(screen.getByRole('button', { name: '돌연변이' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('4마리')).toBeInTheDocument();

    rerender(
      <DexTab
        game={newState()}
        view="event"
        onView={vi.fn()}
        form="variant"
        onToggleForm={vi.fn()}
        sub="village"
        onSub={vi.fn()}
      />,
    );
    const variantEventHeading = screen.getByRole('heading', { level: 3, name: '이벤트 어종 (1/9)' });
    expect(within(variantEventHeading).getByText('(1/9)')).toHaveClass('text-mutation');

    fireEvent.click(screen.getByRole('button', { name: /거북복/ }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('등장한 이벤트')).toBeInTheDocument();
    expect(within(dialog).getByText('제1회 강태공 선수권')).toBeInTheDocument();
    expect(within(dialog).getByText('2026년 11월 1일 ~ 2026년 11월 7일')).toBeInTheDocument();
  });
});
