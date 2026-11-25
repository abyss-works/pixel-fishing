/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { FISH, RARITY, formName, priceOf } from '../../../game/rules/logic';
import { fmtGold, fmtSize } from '../format';
import CatchCard from './CatchCard';

const fish = FISH[0];
const info = (over: Partial<{ form: 'normal' | 'variant'; size: number; percentile: number; isBig: boolean; isNew: boolean }> = {}) =>
  ({ size: 30, form: 'normal' as const, percentile: 3, isBig: false, isNew: false, ...over });

describe('획득 카드', () => {
  afterEach(cleanup);

  it('좌측 card 스프라이트 칸과 우측 등급·이름·2×2 크기/판매가 지표를 가운뎃점 없이 보인다', () => {
    const { container } = render(<CatchCard fish={fish} info={info()} />);
    const card = container.firstElementChild!;
    expect(card).toHaveAttribute('data-rarity', fish.rarity);
    // card 프리셋(160×90) 캔버스를 사용한다
    const canvas = container.querySelector('canvas')!;
    expect(canvas).toHaveAttribute('width', '160');
    expect(canvas).toHaveAttribute('height', '90');

    expect(card).toHaveTextContent(RARITY[fish.rarity].name);
    expect(card).toHaveTextContent(fish.name);
    // 2×2 지표 격자(4개 셀: 크기/값, 판매가/값)
    const metrics = container.querySelector('[data-catch-metrics]')!;
    expect([...metrics.children].map(el => el.textContent)).toEqual([
      '크기', fmtSize(30), '판매가', fmtGold(priceOf(fish, 'normal')),
    ]);
    expect(card.textContent).not.toMatch(/[·★]/);
    expect(container.querySelector('[data-catch-variant]')).toBeNull();
    expect(screen.queryByText('NEW')).not.toBeInTheDocument();
  });

  it('월척이면 왕관 줄에 상위 백분율을 보이고, 신규 발견이면 좌상단 NEW 꼬리표를 단다', () => {
    const { container } = render(<CatchCard fish={fish} info={info({ isBig: true, isNew: true })} />);
    expect(container.firstElementChild).toHaveTextContent('월척 상위 3%');
    const tag = screen.getByText('NEW');
    expect(tag).toHaveClass('bg-gold');
    expect(tag.className).not.toMatch(/rotate|rounded/);
  });

  it('돌연변이면 변이 이름(자홍 강조)과 암시 문구, 변이 잔광 이펙트를 표시한다', () => {
    const { container } = render(<CatchCard fish={fish} info={info({ form: 'variant' })} />);
    const variantTitle = screen.getByText(formName(fish, 'variant'));
    expect(variantTitle).toHaveClass('text-mutation');
    const variantLine = container.querySelector('[data-catch-variant]');
    expect(variantLine).not.toBeNull();
    expect(variantLine!.textContent?.trim().length).toBeGreaterThan(0);
    expect(container.querySelector('[data-catch-fx]')!.children.length).toBeGreaterThanOrEqual(8);
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
