/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { FISH, RARITY, RARITY_ORDER, formName, priceOf } from '../../../game/rules/logic';
import { fmtGold, fmtSize } from '../format';
import CatchCard from './CatchCard';

const fish = FISH[0];
const info = (over: Partial<{ form: 'normal' | 'variant'; size: number; percentile: number; isBig: boolean; isNew: boolean }> = {}) =>
  ({ size: 30, form: 'normal' as const, percentile: 3, isBig: false, isNew: false, ...over });

describe('획득 카드', () => {
  afterEach(cleanup);

  it('고정 크기(340×160)·좌측 어종 액자·우측 등급·이름·빈 변이 자리·크기/판매가 2종만 표시한다', () => {
    const { container } = render(<CatchCard fish={fish} info={info()} />);
    const card = container.firstElementChild as HTMLElement;
    expect(card).toHaveAttribute('data-rarity', fish.rarity);
    expect(card.className).toContain('w-[340px]');
    expect(card.className).toContain('h-[160px]');

    const canvas = container.querySelector('canvas')!;
    expect(canvas).toHaveAttribute('width', '160');
    expect(canvas).toHaveAttribute('height', '90');

    expect(card).toHaveTextContent(RARITY[fish.rarity].name);
    expect(card).toHaveTextContent(fish.name);
    // 비돌연변이에서도 로어 1줄 고정 높이를 빈 자리로 유지한다
    expect(container.querySelector('[data-catch-variant]')).toBeNull();
    const slot = container.querySelector('[data-catch-variant-slot]') as HTMLElement;
    expect(slot).not.toBeNull();
    expect(slot.className).toContain('h-[18px]');

    // 수치 2종(크기, 판매가)만 표시하고 명성·판정·수동/방치·월척 문구는 제외한다
    const metrics = container.querySelector('[data-catch-metrics]')!;
    expect([...metrics.children].map(el => el.textContent)).toEqual([
      '크기', fmtSize(30), '판매가', fmtGold(priceOf(fish, 'normal')),
    ]);
    expect(card.textContent).not.toMatch(/명성|GOOD|PERFECT|수동|방치|월척|돌연변이|[·★]/);
    expect(screen.queryByText('NEW')).not.toBeInTheDocument();
  });

  it('우상단 배지는 왕관 → 돌연변이 → NEW 순서로 우측 정렬된다', () => {
    const { container } = render(<CatchCard fish={fish} info={info({ isBig: true, form: 'variant', isNew: true })} />);
    const badges = container.querySelector('[data-catch-badges]')!;
    expect(badges.className).toContain('justify-end');
    expect([...badges.children].map(el => el.getAttribute('data-catch-badge'))).toEqual([
      'record', 'variant', 'new',
    ]);
    const newBadge = screen.getByText('NEW');
    expect(newBadge).toHaveClass('bg-gold');
    expect(newBadge.className).not.toMatch(/rotate|rounded/);
    expect(container.firstElementChild!.textContent).not.toMatch(/월척 상위|돌연변이/);
  });

  it('돌연변이여도 액자 겉 테두리는 어종 등급색을 유지하고 자홍 반짝이 배지·로어체 1줄·잔광 이펙트를 표시한다', () => {
    const borderClassByRarity = {
      common: 'border-common',
      rare: 'border-rare',
      epic: 'border-epic',
      legendary: 'border-legend',
    } as const;
    for (const rarity of RARITY_ORDER) {
      const targetFish = FISH.find(f => f.rarity === rarity)!;
      const { container } = render(<CatchCard fish={targetFish} info={info({ form: 'variant' })} />);
      const portrait = container.querySelector('[data-catch-portrait]')!;
      expect(portrait.className).toContain(borderClassByRarity[rarity]);
      expect(portrait.className).not.toContain('border-mutation');

      const variantTitle = screen.getByText(formName(targetFish, 'variant'));
      expect(variantTitle).toHaveClass('text-mutation');
      const variantLine = container.querySelector('[data-catch-variant]');
      expect(variantLine).not.toBeNull();
      expect(variantLine!.textContent?.trim().length).toBeGreaterThan(0);
      expect(container.querySelector('[data-catch-variant-slot]')).toBeNull();
      expect(container.querySelector('[data-catch-fx]')!.children.length).toBeGreaterThanOrEqual(8);
      expect(container.firstElementChild!.textContent).not.toContain('돌연변이');
      cleanup();
    }
  });

  it('긴 어종명은 1줄 말줄임으로 잘려 카드 높이와 폭을 늘리지 않는다', () => {
    const longFish = { ...fish, name: '아주긴어종이름테스트열두글자이상' };
    const { container } = render(<CatchCard fish={longFish} info={info()} />);
    const nameEl = container.querySelector('[data-catch-name]')!;
    expect(nameEl.className).toContain('truncate');
    expect(nameEl.className).toContain('h-[28px]');
  });

  it('이펙트 층은 카드의 쌓임 맥락 밖에서 카드와 형제로 놓여 채팅과 헤더 위 이펙트 층 토큰을 쓴다', () => {
    const { container } = render(<CatchCard fish={FISH.find(f => RARITY[f.rarity].sparks > 0)!} info={info()} />);
    const fx = container.querySelector('[data-catch-fx]')!;
    expect(fx.className).toContain('z-(--z-catch-fx)');
    expect(fx.closest('[class*="z-(--z-stage-card)"]')).toBeNull();
    expect(fx.closest('.animate-catch-pop')).toBeNull();
    expect(fx.parentElement).toBe(container.querySelector('.animate-catch-pop')!.parentElement);
  });

  it('등장 애니메이션 catch-pop은 scale 팝이 아니라 좌측 슬라이드 인(translateX(-24px) → 0, ease-out)이다', () => {
    const css = readFileSync('src/index.css', 'utf-8');
    expect(css).toMatch(/--animate-catch-pop:\s*catch-pop\s+[\d.]+s\s+ease-out;/);
    expect(css).toMatch(/@keyframes catch-pop\s*\{\s*from\s*\{\s*opacity:\s*0;\s*transform:\s*translateX\(-24px\);\s*\}\s*to\s*\{\s*opacity:\s*1;\s*transform:\s*translateX\(0\);\s*\}\s*\}/);
  });
});
