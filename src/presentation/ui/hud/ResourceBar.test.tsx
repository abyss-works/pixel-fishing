import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
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

  it('가방 비율은 개수가 네 자리여도 생략하지 않는다 - PC 레이아웃에는 줄이거나 숨기는 단계가 없다', () => {
    const fish = (i: number) => ({ uid: `u${i}`, fishId: 'carp', form: 'normal' as const, size: 10,
      caughtAt: null, spot: null, judgment: null, locked: false });
    render(<ResourceBar game={{ ...newState(), boat: 3, bag: Array.from({ length: 1000 }, (_, i) => fish(i)) }} bagBonus={5} />);
    expect(hud()).toContain('가방 1000 (33%)');
    expect(document.querySelector('[data-omittable]')).toBeNull();
  });

  it('높이는 의뢰 현황과 같은 60px로 늘 같고 스테이지 폭에 따라 바뀌는 변형이 없다', () => {
    render(<ResourceBar game={newState()} />);
    const root = screen.getByRole('button', { name: '스탯창 열기' }).closest('div')!;
    expect(root.className).toContain('h-15');
    expect(root.outerHTML).not.toMatch(/@(max|min)-\[|mobile:/);
  });
});
