import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import HudMenuButton from './HudMenuButton';

afterEach(cleanup);

describe('메뉴 버튼', () => {
  it('헤더의 다른 틀과 같은 높이의 정사각형이고, 스테이지 폭 960px 미만에서는 함께 낮아진다', () => {
    render(<HudMenuButton aria-label="메뉴 열기" />);
    const cls = screen.getByRole('button').className;
    expect(cls).toContain('h-15');
    expect(cls).toContain('w-15');
    expect(cls).toContain('@max-[960px]:h-10');
    expect(cls).toContain('@max-[960px]:w-10');
  });

  it('헤더의 다른 틀과 같은 반투명 바탕, 노치, 베벨 공용 클래스를 쓴다', () => {
    render(<HudMenuButton aria-label="메뉴 열기" />);
    const cls = screen.getByRole('button').className;
    expect(cls).toContain('pf-glass');
    expect(cls).toContain('pf-bevel');
    expect(cls).toContain('pf-notch');
  });

  it('알림 점은 접힌 동안에만 보인다', () => {
    const { rerender, container } = render(<HudMenuButton alert aria-label="메뉴 열기" />);
    expect(container.querySelector('.bg-danger')).not.toBeNull();
    rerender(<HudMenuButton alert open aria-label="메뉴 닫기" />);
    expect(container.querySelector('.bg-danger')).toBeNull();
  });
});
