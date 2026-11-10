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

  it('키보드로 보이는 영역이 밀리면 두 틀이 밀린 길이만큼 아래로 비켜선다 - 위치 변환이 아니라 상대 위치 오프셋이다', () => {
    header();
    for (const el of [bar(), menuSlot()]) {
      expect(el.className).toContain('mobile:relative');
      expect(el.className).toContain('mobile:top-[var(--keyboard-top,0px)]');
      expect(el.className).not.toMatch(/translate|transform/);
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

  it('헤더 행의 단계 변수와 PC 헤더 행 격자를 쓰지 않는다 - 모바일 레이아웃 헤더는 스테이지 격자의 첫 행 그대로다', () => {
    const { container } = header();
    expect(container.innerHTML).not.toContain('--hdr-');
    expect(container.innerHTML).not.toContain('grid-cols-[1fr_auto_1fr]');
    expect(container.querySelector('.absolute')).toBeNull();
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

  const row = () => bar().parentElement!.parentElement!;
  const barSlot = () => bar().parentElement!;

  it('자원 바와 메뉴 버튼은 절대 위치가 아니라 같은 헤더 행의 형제다', () => {
    header();
    expect(barSlot().parentElement).toBe(row());
    expect(menuSlot().parentElement).toBe(row());
    for (const el of [barSlot(), menuSlot(), row().firstElementChild!]) expect(el.className.split(' ')).not.toContain('absolute');
    expect(menuSlot().className.split(' ')).not.toContain('right-3');
  });

  it('헤더 행은 스테이지 위쪽 전체 폭의 세 열 격자(1fr auto 1fr)이고, 자원 바는 가운데 열, 메뉴 버튼은 오른쪽 열의 끝이다', () => {
    header();
    const cls = row().className.split(' ');
    for (const c of ['absolute', 'inset-x-0', 'top-0', 'grid', 'grid-cols-[1fr_auto_1fr]', 'items-center']) expect(cls).toContain(c);
    expect(barSlot().className).toContain('col-start-2');
    expect(menuSlot().className).toContain('col-start-3');
    expect(menuSlot().className).toContain('justify-self-end');
  });

  it('헤더 행의 바깥 여백은 단계 변수를 읽고, 행이 비어 있는 곳은 필드 입력을 가리지 않는다', () => {
    header();
    expect(row().className).toContain('px-(--hdr-inset)');
    expect(row().className).toContain('pt-(--hdr-inset)');
    expect(row().className).toContain('pointer-events-none');
    expect(barSlot().className).toContain('pointer-events-auto');
    expect(menuSlot().className).toContain('pointer-events-auto');
  });

  it('단계 변수는 헤더 행이 단계마다 한 번만 정한다 - 기본 값과 간격 축소, 두 행에서 바뀌는 값', () => {
    header();
    const cls = row().className;
    for (const base of ['--hdr-gap:18px', '--hdr-pad:18px', '--hdr-gauge:88px', '--hdr-bar-h:60px', '--hdr-menu:60px', '--hdr-inset:12px']) expect(cls).toContain(base);
    for (const gap of ['--hdr-gap:8px', '--hdr-pad:12px', '--hdr-gauge:48px']) expect(cls).toContain(`@max-[772px]:[${gap}]`);
    for (const rows of ['--hdr-menu:40px', '--hdr-inset:8px', '--hdr-wide:none', '--hdr-rows:flex']) expect(cls).toContain(`@max-[640px]:[${rows}]`);
    // 간격 축소 단계는 라벨과 글자 크기를 바꾸지 않는다
    expect(cls).not.toMatch(/@max-\[772px\]:\[--hdr-(?!gap|pad:|gauge)/);
  });

  it('메뉴 버튼 자리는 펼친 줄이 카드 묶음과 채팅 위에 오는 층이다', () => {
    header();
    expect(menuSlot().className).toContain('z-(--z-menu-row)');
    expect(barSlot().className).toContain('z-(--z-chrome)');
  });
});
