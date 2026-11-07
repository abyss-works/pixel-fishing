import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { newState } from '../../../game/rules/logic';
import { readFileSync } from 'node:fs';
import HudHeader from './HudHeader';

const menu = <button type="button" aria-label="메뉴 열기">m</button>;
const header = (left: { general: number; named: number } | null = { general: 1, named: 1 }, onOpenStats = () => {}, onOpenQuests = () => {}) =>
  render(<HudHeader game={newState()} left={left} onOpenStats={onOpenStats} onOpenQuests={onOpenQuests} menu={menu} />);

const bar = () => screen.getByRole('button', { name: '스탯창 열기' }).closest('div')!;
const quest = () => screen.getByRole('button', { name: /^의뢰 창 열기/ });
const menuSlot = () => screen.getByRole('button', { name: '메뉴 열기' }).parentElement!;
const css = readFileSync('src/index.css', 'utf-8');
const zOf = (name: string) => Number(new RegExp(`--z-${name}:\\s*(\\d+)`).exec(css)![1]);

describe('HudHeader', () => {
  afterEach(cleanup);

  it('자원 바, 의뢰 현황, 메뉴 버튼 세 덩어리는 서로 안에 들어가지 않는 별도 틀이다', () => {
    header();
    expect(bar().contains(quest())).toBe(false);
    expect(quest().contains(bar())).toBe(false);
    expect(bar().contains(menuSlot())).toBe(false);
    expect(quest().contains(menuSlot())).toBe(false);
  });

  it('모바일 배치에서는 한 행에 왼쪽부터 자원 바, 의뢰 현황, 메뉴 버튼이 첫째, 둘째, 셋째 열이다', () => {
    header();
    for (const [el, col] of [[bar(), 1], [quest(), 2], [menuSlot(), 3]] as const) {
      expect(el.className).toContain(`mobile:col-start-${col}`);
      expect(el.className).toContain('mobile:row-start-1');
    }
  });

  it('자원 바와 의뢰 현황은 같은 높이이고, 스테이지 폭 960px 미만에서는 함께 낮아진다', () => {
    header();
    for (const el of [bar(), quest()]) {
      expect(el.className).toContain('h-15');
      expect(el.className).toContain('@max-[960px]:h-10');
    }
  });

  it('메뉴 버튼 자리는 펼친 줄이 게임 영역의 카드 묶음(overlay) 위에 오도록 한 단 높은 층이다', () => {
    header();
    expect(zOf('card')).toBeGreaterThan(zOf('overlay'));
    expect(menuSlot().className).toContain('z-(--z-card)');
    expect(bar().parentElement!.className).toContain('z-(--z-overlay)');
  });

  it('배와 낚싯대는 헤더에 보이지 않는다', () => {
    header(null);
    expect(screen.queryByText(/낚싯대|배/, { selector: 'span' })).not.toBeInTheDocument();
  });

  it('서버 값이 오기 전에도 의뢰 현황은 자리를 지키고 0을 보인다', () => {
    header(null);
    expect(quest().textContent).toBe('일반 0네임드 0');
  });

  it('서버 값이 있으면 일반, 네임드 순서로 보인다', () => {
    header({ general: 0, named: 1 });
    expect(quest().textContent).toBe('일반 0네임드 1');
  });

  it('의뢰 현황을 누르면 의뢰 창을, 자원 바를 누르면 스탯 창을 연다 - 서로 다른 동작이다', () => {
    const onOpenStats = vi.fn();
    const onOpenQuests = vi.fn();
    header(undefined, onOpenStats, onOpenQuests);
    fireEvent.click(quest());
    expect(onOpenQuests).toHaveBeenCalledTimes(1);
    expect(onOpenStats).not.toHaveBeenCalled();
  });

  it('자원 바를 누르면 스탯 창을 연다', () => {
    const onOpenStats = vi.fn();
    header(undefined, onOpenStats);
    fireEvent.click(screen.getByRole('button', { name: '스탯창 열기' }));
    expect(onOpenStats).toHaveBeenCalledTimes(1);
  });
});
