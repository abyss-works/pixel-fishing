// 목록 행 — 이름과 값은 잘라 내지 않는다. 좁아서 모자라면 이름과 수치가 줄을 바꾸고 오른쪽 상태(가격)는 한 줄로 둔다.
// 실제 겹침은 jsdom이 레이아웃을 계산하지 못해 증명하지 못한다. 여기서는 그것을 막는 구조를 고정한다.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import ListRow from './ListRow';

afterEach(cleanup);

/** 말줄임 표기(truncate와 그를 이루는 클래스)가 없음을 클래스마다 확인한다 — `truncate` 하나만 보면 나머지가 붙어도 통과한다 */
const expectNoEllipsis = (element: HTMLElement) => {
  for (const name of ['truncate', 'overflow-hidden', 'text-ellipsis']) expect(element).not.toHaveClass(name);
};

describe('ListRow', () => {
  it('이름은 말줄임하거나 한 줄로 두지 않고 제 열 안에서 줄을 바꾸며 행은 고정 높이가 아니라 최소 높이다', () => {
    const { container } = render(<ListRow state="open" name="가공 플랜트선" subs={['속도 200', '가방 4,000']} trailing="12,500,000G" />);
    const name = screen.getByText('가공 플랜트선');
    expectNoEllipsis(name);
    expect(name).not.toHaveClass('whitespace-nowrap');
    expect(name).toHaveClass('break-keep', 'break-words');
    const row = container.firstElementChild as HTMLElement;
    expect(row.className).toContain('min-h-12');
    expect(row.className).not.toMatch(/(^|\s)h-12(\s|$)/);
  });

  it('수치는 말줄임하지 않고 항목 단위로 먼저 줄을 바꾸고, 열 폭보다 긴 항목은 그 항목 안에서 줄을 바꾼다', () => {
    render(<ListRow state="open" name="배" subs={['속도 200', '가방 4,000']} />);
    const sub = screen.getByText('가방 4,000');
    expectNoEllipsis(sub);
    expect(sub).not.toHaveClass('whitespace-nowrap');
    expect(sub).toHaveClass('break-keep', 'break-words');
    expect(sub.parentElement?.className).toContain('flex-wrap');
  });

  it('오른쪽 상태는 한 줄로 두어 가격을 자르거나 쪼개지 않는다', () => {
    render(<ListRow state="open" name="배" trailing="12,500,000G" />);
    const trailing = screen.getByText('12,500,000G');
    expect(trailing).toHaveClass('whitespace-nowrap');
    expectNoEllipsis(trailing);
  });
});
