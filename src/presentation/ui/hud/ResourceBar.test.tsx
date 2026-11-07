import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { newState } from '../../../game/rules/logic';
import ResourceBar from './ResourceBar';

const hud = () => screen.getByRole('button', { name: '스탯창 열기' }).textContent ?? '';

describe('자원 바', () => {
  const original = window.matchMedia;
  afterEach(() => { window.matchMedia = original; cleanup(); document.head.querySelectorAll('style').forEach(e => e.remove()); });

  it('골드, 명성, 가방 세 칸만 보인다 — 배, 낚싯대, 의뢰 현황은 자원 바에 없다', () => {
    render(<ResourceBar game={newState()} />);
    expect(hud()).toMatch(/^골드 .+명성 .+가방 .+$/);
    expect(hud()).not.toContain('배');
    expect(hud()).not.toContain('낚싯대');
    expect(hud()).not.toContain('일반');
    expect(hud()).not.toContain('네임드');
    expect(hud()).not.toContain('오늘 의뢰');
  });

  it('골드·명성은 단위 없이 줄임 표기다', () => {
    render(<ResourceBar game={{ ...newState(), gold: 1_534_000, fame: 12_345 }} />);
    expect(hud()).toContain('골드 1.5M');
    expect(hud()).toContain('명성 12.3K');
  });

  it('가방은 수량과 채움 비율을 보이고, 75% 이상이면 주황·95% 이상이면 빨강 계열이다', () => {
    const fish = (i: number) => ({ uid: `u${i}`, fishId: 'carp', form: 'normal' as const, size: 10,
      caughtAt: null, spot: null, judgment: null, locked: false });
    const bagValue = () => screen.getByText('가방', { exact: false }).parentElement!.lastElementChild!;
    const { rerender } = render(<ResourceBar game={{ ...newState(), boat: 0, bag: [] }} />);
    expect(hud()).toContain('가방 0 (0%)');
    expect(bagValue().className).toContain('text-gold');
    rerender(<ResourceBar game={{ ...newState(), boat: 0, bag: Array.from({ length: 45 }, (_, i) => fish(i)) }} />);
    expect(hud()).toContain('가방 45 (75%)');
    expect(bagValue().className).toContain('text-orange');
    rerender(<ResourceBar game={{ ...newState(), boat: 0, bag: Array.from({ length: 57 }, (_, i) => fish(i)) }} />);
    expect(bagValue().className).toContain('text-danger');
  });

  it('가방 개수가 네 자리면 비율은 스테이지 폭 380px 미만에서 생략하고 개수는 필수로 남긴다', () => {
    const fish = (i: number) => ({ uid: `u${i}`, fishId: 'carp', form: 'normal' as const, size: 10,
      caughtAt: null, spot: null, judgment: null, locked: false });
    const { rerender } = render(<ResourceBar game={{ ...newState(), boat: 3, bag: Array.from({ length: 472 }, (_, i) => fish(i)) }} bagBonus={5} />);
    expect(document.querySelector('[data-omittable]')!.className).not.toContain('hidden');
    rerender(<ResourceBar game={{ ...newState(), boat: 3, bag: Array.from({ length: 1000 }, (_, i) => fish(i)) }} bagBonus={5} />);
    const omittable = document.querySelector('[data-omittable]')!;
    expect(omittable.className).toContain('@max-[380px]:hidden');
    expect(omittable.textContent).toMatch(/\(\d+%\)/);
    expect(hud()).toContain('가방 1000');
  });

  it('높이는 의뢰 현황과 같고 스테이지 폭 960px 미만에서 함께 낮아진다', () => {
    render(<ResourceBar game={newState()} />);
    const root = screen.getByRole('button', { name: '스탯창 열기' }).closest('div')!;
    expect(root.className).toContain('h-15');
    expect(root.className).toContain('@max-[960px]:h-10');
  });

  describe('생략된 가방 비율의 툴팁', () => {
    const fish = (i: number) => ({ uid: `u${i}`, fishId: 'carp', form: 'normal' as const, size: 10,
      caughtAt: null, spot: null, judgment: null, locked: false });
    const longBag = () => ({ ...newState(), boat: 3, bag: Array.from({ length: 1000 }, (_, i) => fish(i)) });
    const cell = (label: string) => screen.getByText(label, { exact: false }).parentElement!.parentElement!;
    const hideOmittable = () => {
      const style = document.createElement('style');
      style.textContent = '[data-omittable] { display: none; }';
      document.head.appendChild(style);
    };

    it('비율이 보이는 동안에는 가방 칸에 올려도 툴팁을 열지 않는다', () => {
      render(<ResourceBar game={longBag()} bagBonus={5} />);
      fireEvent.mouseEnter(cell('가방'));
      expect(screen.queryByRole('tooltip')).toBeNull();
    });

    it('비율이 숨겨지면 가방 칸에 올릴 때 개수, 상한, 비율을 툴팁으로 보인다', () => {
      hideOmittable();
      render(<ResourceBar game={longBag()} bagBonus={5} />);
      fireEvent.mouseEnter(cell('가방'));
      expect(screen.getByRole('tooltip')).toHaveTextContent('가방 1000/3000 (33%)');
    });

    it('툴팁은 가방 칸에만 걸린다 - 골드와 명성에 올려도 열리지 않는다', () => {
      hideOmittable();
      render(<ResourceBar game={longBag()} bagBonus={5} />);
      fireEvent.mouseEnter(cell('골드'));
      fireEvent.mouseEnter(cell('명성'));
      expect(screen.queryByRole('tooltip')).toBeNull();
    });

    it('터치(거친 포인터)에서는 눌러도 툴팁을 열지 않고 스탯 창 열기만 실행한다', () => {
      window.matchMedia = ((query: string) => ({
        matches: query === '(pointer: coarse)', media: query,
        addEventListener: () => {}, removeEventListener: () => {},
      })) as unknown as typeof window.matchMedia;
      hideOmittable();
      const onOpen = vi.fn();
      render(<ResourceBar game={longBag()} bagBonus={5} onOpen={onOpen} />);
      fireEvent.click(screen.getByText('가방', { exact: false }));
      expect(onOpen).toHaveBeenCalledOnce();
      expect(screen.queryByRole('tooltip')).toBeNull();
    });
  });
});
