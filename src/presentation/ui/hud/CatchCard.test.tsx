import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { FISH, RARITY, priceOf } from '../../../game/rules/logic';
import { fmtGold } from '../format';
import CatchCard from './CatchCard';

const fish = FISH[0];
const info = (over: Partial<{ isBig: boolean; isNew: boolean }> = {}) =>
  ({ size: 30, form: 'normal' as const, percentile: 3, isBig: false, isNew: false, ...over });

describe('획득 카드', () => {
  afterEach(cleanup);

  it('등급과 이름, 크기와 판매가 두 칸을 가운뎃점 없이 보인다', () => {
    const { container } = render(<CatchCard fish={fish} info={info()} />);
    const card = container.firstElementChild!;
    expect(card).toHaveTextContent(RARITY[fish.rarity].name);
    expect(card).toHaveTextContent(fish.name);
    expect(card).toHaveTextContent('크기');
    expect(card).toHaveTextContent(`판매가${fmtGold(priceOf(fish, 'normal'))}`);
    expect(card.textContent).not.toMatch(/[·★]/);
    expect(screen.queryByText('NEW')).not.toBeInTheDocument();
  });

  it('월척이면 왕관 줄에 상위 백분율을 보이고, 신규 발견이면 NEW 꼬리표를 단다', () => {
    const { container } = render(<CatchCard fish={fish} info={info({ isBig: true, isNew: true })} />);
    expect(container.firstElementChild).toHaveTextContent('월척 상위 3%');
    const tag = screen.getByText('NEW');
    expect(tag).toHaveClass('bg-gold');
    expect(tag.className).not.toMatch(/rotate|rounded/);
  });

  it('이펙트 층은 카드의 쌓임 맥락 밖에서 카드와 형제로 놓여 채팅과 헤더 위 이펙트 층 토큰을 쓴다', () => {
    const { container } = render(<CatchCard fish={FISH.find(f => RARITY[f.rarity].sparks > 0)!} info={info()} />);
    const fx = container.querySelector('[data-catch-fx]')!;
    expect(fx.className).toContain('z-(--z-catch-fx)');
    expect(fx.closest('[class*="z-(--z-stage-card)"]')).toBeNull();
    expect(fx.closest('.animate-catch-pop')).toBeNull();
    expect(fx.parentElement).toBe(container.querySelector('.animate-catch-pop')!.parentElement);
  });
});
