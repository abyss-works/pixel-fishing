import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import Button from './Button';
import Locked from './Locked';

const original = window.matchMedia;
afterEach(() => { window.matchMedia = original; cleanup(); });

const coarse = () => {
  window.matchMedia = ((query: string) => ({
    matches: query === '(pointer: coarse)', media: query,
    addEventListener: () => {}, removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
};

describe('Locked', () => {
  it('자물쇠가 붙고 title 속성이 없으며 감싼 요소는 자리를 그대로 둔다', () => {
    const { container } = render(<Locked lines={['안내']}><Button disabled>친구 요청</Button></Locked>);
    expect(container.querySelector('[data-glyph="lock"]')).not.toBeNull();
    expect(container.querySelector('[title]')).toBeNull();
    expect(screen.getByRole('button', { name: '친구 요청' })).toBeInTheDocument();
  });

  it('마우스를 올리거나 포커스하면 잠금 줄이 공용 툴팁으로 열린다', () => {
    render(<Locked lines={['첫째', '둘째']} label="채팅"><Button disabled>보내기</Button></Locked>);
    const group = screen.getByRole('group', { name: '채팅' });
    fireEvent.mouseEnter(group.parentElement!);
    expect([...screen.getByRole('tooltip').querySelectorAll('.block')].map(e => e.textContent)).toEqual(['첫째', '둘째']);
    fireEvent.mouseLeave(group.parentElement!);
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.focus(group);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
  });

  it('누르면(거친 포인터) 툴팁만 열리고 감싼 동작은 실행되지 않는다', () => {
    coarse();
    const onClick = vi.fn();
    render(<Locked lines={['안내']}><Button disabled onClick={onClick}>차단</Button></Locked>);
    fireEvent.click(screen.getByRole('group'));
    expect(screen.getByRole('tooltip')).toHaveTextContent('안내');
    fireEvent.click(screen.getByRole('button', { name: '차단' }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('잠금 이유가 접근성 설명으로 이어진다', () => {
    render(<Locked lines={['첫째', '둘째']}><Button disabled>차단</Button></Locked>);
    const group = screen.getByRole('group');
    expect(document.getElementById(group.getAttribute('aria-describedby')!)).toHaveTextContent('첫째 둘째');
  });

  it('메뉴 줄 역할로 쓰면 aria-disabled 메뉴 항목이 된다', () => {
    render(<Locked lines={['안내']} role="menuitem" label="길드"><span>길드</span></Locked>);
    expect(screen.getByRole('menuitem', { name: '길드' })).toHaveAttribute('aria-disabled', 'true');
  });
});
