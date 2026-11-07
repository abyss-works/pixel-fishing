import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { newState } from '../../../game/rules/logic';
import MobileResourceBar from './MobileResourceBar';

const barButton = () => screen.getByRole('button', { name: /^스탯창 열기/ });
const hud = () => barButton().textContent ?? '';

describe('모바일 자원 바', () => {
  const original = window.matchMedia;
  afterEach(() => { window.matchMedia = original; cleanup(); document.head.querySelectorAll('style').forEach(e => e.remove()); });

  it('골드, 명성, 가방 세 칸만 보인다 — 배, 낚싯대, 의뢰 현황은 자원 바에 없다', () => {
    render(<MobileResourceBar game={newState()} />);
    expect(hud()).toMatch(/^골드 .+명성 .+가방 .+$/);
    expect(hud()).not.toContain('배');
    expect(hud()).not.toContain('낚싯대');
    expect(hud()).not.toContain('일반');
    expect(hud()).not.toContain('네임드');
    expect(hud()).not.toContain('오늘 의뢰');
  });

  it('골드·명성은 단위 없이 줄임 표기다', () => {
    render(<MobileResourceBar game={{ ...newState(), gold: 1_534_000, fame: 12_345 }} />);
    expect(hud()).toContain('골드 1.53M');
    expect(hud()).toContain('명성 12.3K');
  });

  it('가방은 수량과 채움 비율을 보이고, 75% 이상이면 주황·95% 이상이면 빨강 계열이다', () => {
    const fish = (i: number) => ({ uid: `u${i}`, fishId: 'carp', form: 'normal' as const, size: 10,
      caughtAt: null, spot: null, judgment: null, locked: false });
    const bagValue = () => screen.getByText('가방', { exact: false }).parentElement!.lastElementChild!;
    const { rerender } = render(<MobileResourceBar game={{ ...newState(), boat: 0, bag: [] }} />);
    expect(hud()).toContain('가방 0 (0%)');
    expect(bagValue().className).toContain('text-gold');
    rerender(<MobileResourceBar game={{ ...newState(), boat: 0, bag: Array.from({ length: 45 }, (_, i) => fish(i)) }} />);
    expect(hud()).toContain('가방 45 (75%)');
    expect(bagValue().className).toContain('text-orange');
    rerender(<MobileResourceBar game={{ ...newState(), boat: 0, bag: Array.from({ length: 57 }, (_, i) => fish(i)) }} />);
    expect(bagValue().className).toContain('text-danger');
  });

  it('가방 비율은 개수와 상관없이 스테이지 폭 440px 미만에서 생략하고 개수는 필수로 남긴다', () => {
    const fish = (i: number) => ({ uid: `u${i}`, fishId: 'carp', form: 'normal' as const, size: 10,
      caughtAt: null, spot: null, judgment: null, locked: false });
    for (const n of [0, 472, 1000, 2990]) {
      cleanup();
      render(<MobileResourceBar game={{ ...newState(), boat: 3, bag: Array.from({ length: n }, (_, i) => fish(i)) }} bagBonus={5} />);
      const omittable = document.querySelector('[data-omittable]')!;
      expect(omittable.className).toContain('@max-[440px]:hidden');
      expect(omittable.textContent).toMatch(/\(\d+%\)/);
      expect(hud()).toContain(`가방 ${n}`);
    }
  });

  it('한 칸은 [아이콘 | 값] 한 줄이다 - 이름은 화면 글자가 아니라 sr-only이고, 값은 커진 글자다', () => {
    render(<MobileResourceBar game={newState()} />);
    const cells = [...barButton().querySelectorAll('.pf-accent')]
      .map(v => v.parentElement!);
    expect(cells).toHaveLength(3);
    for (const cell of cells) {
      expect(cell.className).toContain('inline-flex');
      expect(cell.className).not.toContain('flex-col');
      expect(cell.querySelector('svg')).not.toBeNull();
      expect(cell.querySelector('.sr-only')).not.toBeNull();
    }
    // 보이는 글자는 값뿐이다: sr-only를 뺀 글자에 이름이 없다
    const visible = cells.map(cell => [...cell.childNodes].filter(n => !(n as HTMLElement).classList?.contains('sr-only'))
      .map(n => n.textContent).join(''));
    expect(visible.join('')).not.toMatch(/골드|명성|가방/);
    for (const cell of cells) {
      const icon = cell.querySelector('svg')!.getAttribute('class')!;
      expect(icon).toContain('size-3');
      expect(icon).not.toContain('size-6');
    }
    const value = cells[0].querySelector('.pf-accent')!.className;
    expect(value).toContain('text-[12px]');
    expect(value).toContain('@min-[380px]:text-[13px]');
    expect(value).not.toContain('text-[16px]');
  });

  it('360 폭의 가장 긴 값이 넘치지 않도록 칸 사이 간격과 안쪽 여백이 좁다', () => {
    render(<MobileResourceBar game={newState()} />);
    const button = barButton();
    expect(button.className).toContain('gap-x-1');
    expect(button.closest('div')!.className).toContain('px-1.5');
  });

  it('높이는 의뢰 현황과 같은 40px다', () => {
    render(<MobileResourceBar game={newState()} />);
    const root = barButton().closest('div')!;
    expect(root.className).toContain('h-10');
  });

  describe('칸의 이름 툴팁', () => {
    const fish = (i: number) => ({ uid: `u${i}`, fishId: 'carp', form: 'normal' as const, size: 10,
      caughtAt: null, spot: null, judgment: null, locked: false });
    const game = () => ({ ...newState(), boat: 3, bag: Array.from({ length: 1000 }, (_, i) => fish(i)) });
    const cell = (label: string) => screen.getByText(label, { exact: false }).parentElement!.parentElement!;

    it('칸에 마우스를 올리면 그 칸의 이름이 툴팁으로 뜬다', () => {
      render(<MobileResourceBar game={game()} bagBonus={5} />);
      const gold = cell('골드');
      const bag = cell('가방');
      fireEvent.mouseEnter(gold);
      expect(screen.getByRole('tooltip')).toHaveTextContent('골드');
      fireEvent.mouseLeave(gold);
      fireEvent.mouseEnter(bag);
      expect(screen.getByRole('tooltip')).toHaveTextContent('가방 1,000 / 3,000 (33%)');
    });

    it('골드와 명성 칸 툴팁은 줄임 표기가 아닌 정확한 값을 쉼표로 보인다', () => {
      render(<MobileResourceBar game={{ ...newState(), gold: 1_234_567, fame: 999_999 }} />);
      expect(hud()).toContain('골드 1.23M');
      expect(hud()).toContain('명성 999K');
      const gold = cell('골드');
      const fame = cell('명성');
      fireEvent.mouseEnter(gold);
      expect(screen.getByRole('tooltip')).toHaveTextContent('골드 1,234,567');
      fireEvent.mouseLeave(gold);
      fireEvent.mouseEnter(fame);
      expect(screen.getByRole('tooltip')).toHaveTextContent('명성 999,999');
    });

    it('터치(거친 포인터)에서는 칸의 글자도 칸 여백(감싼 칸 자체)도 눌러도 툴팁을 열지 않고 스탯 창 열기만 실행한다', () => {
      window.matchMedia = ((query: string) => ({
        matches: query === '(pointer: coarse)', media: query,
        addEventListener: () => {}, removeEventListener: () => {},
      })) as unknown as typeof window.matchMedia;
      const onOpen = vi.fn();
      render(<MobileResourceBar game={game()} bagBonus={5} onOpen={onOpen} />);
      fireEvent.click(screen.getByText('가방', { exact: false }));
      fireEvent.click(cell('가방'));
      expect(onOpen).toHaveBeenCalledTimes(2);
      expect(screen.queryByRole('tooltip')).toBeNull();
    });

    it('접근성 이름에 칸의 정확한 값이 들어 있어 키보드와 화면 읽기도 같은 정보를 얻는다', () => {
      render(<MobileResourceBar game={{ ...game(), gold: 1_234_567, fame: 999_900 }} bagBonus={5} />);
      expect(barButton()).toHaveAccessibleName('스탯창 열기, 골드 1,234,567, 명성 999,900, 가방 1,000 / 3,000 (33%)');
    });

    it('골드와 명성 칸 툴팁은 줄임 표기가 아닌 정확한 값을 쉼표로 보인다', () => {
      render(<MobileResourceBar game={{ ...newState(), gold: 1_234_567, fame: 999_999 }} />);
      expect(hud()).toContain('골드 1.23M');
      expect(hud()).toContain('명성 999K');
      const gold = cell('골드');
      const fame = cell('명성');
      fireEvent.mouseEnter(gold);
      expect(screen.getByRole('tooltip')).toHaveTextContent('골드 1,234,567');
      fireEvent.mouseLeave(gold);
      fireEvent.mouseEnter(fame);
      expect(screen.getByRole('tooltip')).toHaveTextContent('명성 999,999');
    });

    it('터치(거친 포인터)에서는 눌러도 툴팁을 열지 않고 스탯 창 열기만 실행한다', () => {
      window.matchMedia = ((query: string) => ({
        matches: query === '(pointer: coarse)', media: query,
        addEventListener: () => {}, removeEventListener: () => {},
      })) as unknown as typeof window.matchMedia;
      const onOpen = vi.fn();
      render(<MobileResourceBar game={game()} bagBonus={5} onOpen={onOpen} />);
      fireEvent.click(screen.getByText('가방', { exact: false }));
      expect(onOpen).toHaveBeenCalledOnce();
      expect(screen.queryByRole('tooltip')).toBeNull();
    });
  });
});
