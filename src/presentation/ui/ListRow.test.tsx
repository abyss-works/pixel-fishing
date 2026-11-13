// 목록 행 — 이름과 값은 잘라 내지 않는다. 좁아서 모자라면 이름과 수치가 줄을 바꾸고 오른쪽 상태(가격)는 한 줄로 둔다.
// 실제 겹침은 jsdom이 레이아웃을 계산하지 못해 증명하지 못한다. 여기서는 그것을 막는 구조를 고정한다.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import ListRow from './ListRow';

afterEach(cleanup);

describe('ListRow', () => {
  it('이름은 말줄임하지 않고 줄을 바꾸며 행은 고정 높이가 아니라 최소 높이다', () => {
    const { container } = render(<ListRow state="open" name="가공 플랜트선" subs={['속도 200', '가방 4,000']} trailing="12,500,000G" />);
    const name = screen.getByText('가공 플랜트선');
    expect(name.className).not.toContain('truncate');
    expect(name.className).toContain('break-keep');
    const row = container.firstElementChild as HTMLElement;
    expect(row.className).toContain('min-h-12');
    expect(row.className).not.toMatch(/(^|\s)h-12(\s|$)/);
  });

  it('수치는 항목 단위로 줄을 바꾸고 항목 안에서는 줄을 바꾸지 않는다', () => {
    render(<ListRow state="open" name="배" subs={['속도 200', '가방 4,000']} />);
    const sub = screen.getByText('가방 4,000');
    expect(sub).toHaveClass('whitespace-nowrap');
    expect(sub.parentElement?.className).toContain('flex-wrap');
  });

  it('오른쪽 상태는 한 줄로 두어 가격을 자르거나 쪼개지 않는다', () => {
    render(<ListRow state="open" name="배" trailing="12,500,000G" />);
    expect(screen.getByText('12,500,000G')).toHaveClass('whitespace-nowrap');
  });
});
