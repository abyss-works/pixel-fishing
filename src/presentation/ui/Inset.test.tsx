import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import Inset from './Inset';
import type { InsetBorder } from './Inset';

afterEach(cleanup);

const NON_DEFAULT_BORDERS: Exclude<InsetBorder, 'line'>[] = [
  'gold',
  'accent',
  'common',
  'rare',
  'epic',
  'legend',
];

describe('Inset', () => {
  it('기본 테두리는 border와 border-line을 함께 가진다', () => {
    const { container } = render(<Inset>내용</Inset>);
    const el = container.firstElementChild as HTMLElement;
    expect(el).toHaveClass('border', 'border-line');
  });

  it.each(NON_DEFAULT_BORDERS)('border=%s를 주면 border-line 없이 해당 테두리 클래스만 붙는다', (border) => {
    const { container } = render(<Inset border={border}>내용</Inset>);
    const el = container.firstElementChild as HTMLElement;
    expect(el).toHaveClass('border', `border-${border}`);
    expect(el).not.toHaveClass('border-line');
  });

  it('borderless면 border prop과 무관하게 테두리 클래스를 붙이지 않는다', () => {
    const { container } = render(<Inset borderless border="epic">내용</Inset>);
    const el = container.firstElementChild as HTMLElement;
    expect(el).not.toHaveClass('border');
    expect(el).not.toHaveClass('border-line');
    expect(el).not.toHaveClass('border-epic');
  });

  it('className의 border-dashed 같은 선 스타일은 기본 테두리 색과 함께 유지된다', () => {
    const { container } = render(<Inset className="border-dashed">내용</Inset>);
    const el = container.firstElementChild as HTMLElement;
    expect(el).toHaveClass('border', 'border-line', 'border-dashed');
  });
});
