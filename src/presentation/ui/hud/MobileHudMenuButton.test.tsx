import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import MobileHudMenuButton from './MobileHudMenuButton';

afterEach(cleanup);

describe('모바일 메뉴 버튼', () => {
  it('헤더의 다른 틀과 같은 높이(40px)의 정사각형이다', () => {
    render(<MobileHudMenuButton aria-label="메뉴 열기" />);
    const cls = screen.getByRole('button').className;
    expect(cls).toContain('h-10');
    expect(cls).toContain('w-10');
  });

  it('헤더의 다른 틀과 같은 반투명 바탕, 노치, 베벨 공용 클래스를 쓴다', () => {
    render(<MobileHudMenuButton aria-label="메뉴 열기" />);
    const cls = screen.getByRole('button').className;
    expect(cls).toContain('pf-glass');
    expect(cls).toContain('pf-bevel');
    expect(cls).toContain('pf-notch');
  });

  it('알림 점은 접힌 동안에만 보인다', () => {
    const { rerender, container } = render(<MobileHudMenuButton alert aria-label="메뉴 열기" />);
    expect(container.querySelector('.bg-danger')).not.toBeNull();
    rerender(<MobileHudMenuButton alert open aria-label="메뉴 닫기" />);
    expect(container.querySelector('.bg-danger')).toBeNull();
  });
});
