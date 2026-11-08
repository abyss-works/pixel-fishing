/// <reference types="node" />
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newState } from '../../../game/rules/logic';
import { readFileSync } from 'node:fs';
const layout = vi.hoisted(() => ({ mobile: true }));
vi.mock('../useMobileLayout', () => ({ useMobileLayout: () => layout.mobile }));

import HudHeader from './HudHeader';

const menu = <button type="button" aria-label="메뉴 열기">m</button>;
const header = (onOpenStats = () => {}) =>
  render(<HudHeader game={newState()} onOpenStats={onOpenStats} menu={menu} />);

const bar = () => screen.getByRole('button', { name: /^스탯창 열기/ }).closest('div')!;
const menuSlot = () => screen.getByRole('button', { name: '메뉴 열기' }).parentElement!;
const css = readFileSync('src/index.css', 'utf-8');
const zOf = (name: string) => Number(new RegExp(`--z-${name}:\\s*(\\d+)`).exec(css)![1]);

describe('HudHeader 모바일 레이아웃', () => {
  beforeEach(() => { layout.mobile = true; });
  afterEach(cleanup);

  it('자원 바와 메뉴 버튼은 서로 안에 들어가지 않는 별도 틀이고 의뢰 현황은 없다', () => {
    header();
    expect(bar().contains(menuSlot())).toBe(false);
    expect(screen.queryByRole('button', { name: /^의뢰 창 열기/ })).not.toBeInTheDocument();
  });

  it('한 행에 왼쪽부터 자원 바, 메뉴 버튼이 첫째, 둘째 열이다', () => {
    header();
    for (const [el, col] of [[bar(), 1], [menuSlot(), 2]] as const) {
      expect(el.className).toContain(`mobile:col-start-${col}`);
      expect(el.className).toContain('mobile:row-start-1');
    }
  });

  it('두 틀 사이에 4px 간격이 있다 - 자원 바 왼쪽, 메뉴 버튼 양쪽에 4px 여백을 두고 비어 있는 열은 없다', () => {
    header();
    expect(bar().className).toContain('mobile:ml-1');
    expect(bar().className).not.toMatch(/mobile:mr-/);
    expect(menuSlot().className).toContain('mobile:mx-1');
  });

  it('메뉴 버튼 자리는 자원 바 높이의 세로 가운데에 맞춘다', () => {
    header();
    expect(menuSlot().className).toContain('mobile:self-center');
  });

  it('헤더는 채팅과 같은 층(chrome)이라 스테이지 위 HUD의 카드 묶음 위에 놓인다', () => {
    header();
    expect(zOf('chrome')).toBeGreaterThan(zOf('stage-card'));
    // 펼친 줄은 DOM 순서가 아니라 층 토큰으로 채팅(chrome) 위에 온다
    expect(zOf('menu-row')).toBeGreaterThan(zOf('chrome'));
    expect(menuSlot().className).toContain('z-(--z-menu-row)');
  });

  it('자원 바를 누르면 스탯 창을 연다', () => {
    const onOpenStats = vi.fn();
    header(onOpenStats);
    fireEvent.click(screen.getByRole('button', { name: /^스탯창 열기/ }));
    expect(onOpenStats).toHaveBeenCalledTimes(1);
  });
});

describe('HudHeader PC 레이아웃 - 자원 바 | 메뉴 버튼 두 틀', () => {
  beforeEach(() => { layout.mobile = false; });
  afterEach(cleanup);

  it('두 덩어리는 서로 안에 들어가지 않는 별도 틀이고 의뢰 현황은 없다', () => {
    header();
    expect(bar().contains(menuSlot())).toBe(false);
    expect(screen.queryByRole('button', { name: /^의뢰 창 열기/ })).not.toBeInTheDocument();
  });

  it('자원 바는 골드, 명성, 배, 낚싯대, 가방 다섯 칸이다', () => {
    header();
    const text = screen.getByRole('button', { name: /^스탯창 열기/ }).textContent!;
    expect(text).toMatch(/^골드 .+명성 .+배 .+낚싯대 .+가방 .+$/);
    expect(text).not.toMatch(/일반|네임드/);
    const cells = [...screen.getByRole('button', { name: /^스탯창 열기/ }).querySelectorAll('.pf-accent')]
      .filter(v => v.className.includes('text-lg')).map(v => v.parentElement!);
    expect(cells).toHaveLength(5);
    for (const cell of cells) expect(cell.className).toContain('flex-col');
  });

  it('자원 바는 60px이고 스테이지 폭에 따라 줄어들지 않는다', () => {
    header();
    expect(bar().className).toContain('h-15');
    expect(bar().className).not.toContain('@max-[960px]');
  });

  it('메뉴 버튼 자리는 오른쪽 위 모서리(12px 여백)이고 펼친 줄이 카드 묶음 위에 오는 층이다', () => {
    header();
    expect(menuSlot().className).toContain('absolute right-3 top-3');
    expect(menuSlot().className).toContain('z-(--z-menu-row)');
  });
});
