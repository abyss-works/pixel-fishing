// 상세 헤더 — 큰 그림, 이름, 꼬리표 또는 설명. 설명 자리는 선택 사항이고 두 줄 높이로 고정하되 내용이 더 길면 늘어난다.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import HeroHeader from './HeroHeader';

afterEach(cleanup);

describe('HeroHeader', () => {
  it('꼬리표를 주면 꼬리표 줄을 그대로 그린다', () => {
    render(<HeroHeader title="낚싯대" tags={['Lv.3', '다음 강화']} />);
    expect(screen.getByText('Lv.3')).toBeInTheDocument();
    expect(screen.getByText('다음 강화')).toBeInTheDocument();
  });

  it('꼬리표가 없으면 꼬리표 줄을 그리지 않는다', () => {
    const { container } = render(<HeroHeader title="가루디야" description="소금물에 끓인 국물." />);
    expect(container.querySelector('.flex-wrap')).toBeNull();
  });

  it('설명은 이름 아래에 로어 문단으로 그리고 첫 글자 강조를 쓰지 않는다', () => {
    render(<HeroHeader title="가루디야" description="소금물에 끓인 국물." />);
    const lore = screen.getByText('소금물에 끓인 국물.');
    expect(lore.tagName).toBe('P');
    expect(lore.className).not.toContain('first-letter');
    const title = screen.getByText('가루디야');
    expect(title.compareDocumentPosition(lore) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('설명 자리는 두 줄 높이의 최소 높이이고 높이를 고정하지 않아 더 길면 늘어난다', () => {
    render(<HeroHeader title="가루디야" description="짧다" />);
    const cls = screen.getByText('짧다').className;
    expect(cls).toMatch(/min-h-/);
    expect(cls).not.toMatch(/(?<![\w-])h-\[/);
  });

  it('이름은 글자 외의 표기도 받는다', () => {
    render(<HeroHeader title={<span>사프란 미끼<span data-rarity="special">(특수)</span></span>} />);
    expect(screen.getByText('(특수)')).toHaveAttribute('data-rarity', 'special');
  });
});
