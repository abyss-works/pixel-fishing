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

  it('표식 점은 접힌 동안에만 보이고 종류를 구분한다', () => {
    const { rerender, container } = render(<MobileHudMenuButton mark="mail" aria-label="메뉴 열기" />);
    expect(container.querySelector('[data-mark="danger"]')).not.toBeNull();
    rerender(<MobileHudMenuButton mark="accent" aria-label="메뉴 열기" />);
    expect(container.querySelector('[data-mark="gold"]')).not.toBeNull();
    expect(container.querySelector('[data-mark="danger"]')).toBeNull();
    rerender(<MobileHudMenuButton mark="accent" open aria-label="메뉴 닫기" />);
    expect(container.querySelector('[data-mark]')).toBeNull();
  });

  it('내부 하단에 메뉴 라벨을 표시한다', () => {
    render(<MobileHudMenuButton aria-label="메뉴 열기" />);
    expect(screen.getByRole('button', { name: '메뉴 열기' })).toHaveTextContent('메뉴');
  });
});
