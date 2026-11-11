/// <reference types="node" />
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import MenuCard from './MenuCard';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf-8');

const original = window.matchMedia;
afterEach(() => { window.matchMedia = original; cleanup(); document.head.querySelectorAll('style').forEach(s => s.remove()); });

describe('MenuCard', () => {
  it('카드 폭은 폭 기준과 높이 기준을 함께 가진다', () => {
    render(<MenuCard icon={null} title="공방" sub="설명" subRole="omittable" />);
    const cls = screen.getByRole('button').className;
    const base = cls.match(/(?<![:\w])\[--card:[^\s]+\]/)![0];
    const compact = cls.match(/menu-compact:\[--card:[^\s]+\]/)![0];
    for (const v of [base, compact]) {
      expect(v).toContain('cqw');
      expect(v).toContain('100cqh');
    }
  });

  it('접근성 이름은 제목과 설명을 공백으로 잇는다', () => {
    render(<MenuCard icon={null} title="공방" sub="낚싯대 Lv.3" />);
    expect(screen.getByRole('button', { name: '공방 낚싯대 Lv.3' })).toBeInTheDocument();
  });

  it('설명이 없으면 제목만 이름이 되고 설명 줄을 그리지 않는다', () => {
    const { container } = render(<MenuCard icon={null} title="옷장" subRole="omittable" />);
    expect(screen.getByRole('button', { name: '옷장' })).toBeInTheDocument();
    expect(container.querySelector('[data-omittable]')).toBeNull();
  });

  it('역할을 정하지 않은 설명은 필수라 생략 표식도 변형도 없다', () => {
    const { container } = render(<MenuCard icon={null} title="공방" sub="설명" />);
    expect(container.querySelector('[data-omittable]')).toBeNull();
    expect(screen.getByText('설명').className).not.toContain('menu-compact:');
  });

  it('생략 역할의 설명은 표식과 자리 부족 변형을 함께 가진다', () => {
    render(<MenuCard icon={null} title="공방" sub="설명" subRole="omittable" />);
    const sub = screen.getByText('설명');
    expect(sub).toHaveAttribute('data-omittable');
    expect(sub.className).toContain('menu-compact:hidden');
  });

  describe('생략된 설명의 툴팁', () => {
    it('설명 줄이 보이는 동안에는 툴팁을 열지 않는다', () => {
      render(<MenuCard icon={null} title="공방" sub="설명" subRole="omittable" />);
      fireEvent.mouseEnter(screen.getByRole('button').parentElement!);
      expect(screen.queryByRole('tooltip')).toBeNull();
    });

    it('설명 줄이 숨겨지면 마우스를 올릴 때 설명을 툴팁으로 보인다', () => {
      const style = document.createElement('style');
      style.textContent = '[data-omittable] { display: none; }';
      document.head.appendChild(style);
      render(<MenuCard icon={null} title="공방" sub="낚싯대 Lv.3" subRole="omittable" />);
      fireEvent.mouseEnter(screen.getByRole('button').parentElement!);
      expect(screen.getByRole('tooltip')).toHaveTextContent('낚싯대 Lv.3');
    });

    it('터치(거친 포인터)에서는 카드를 눌러도 툴팁을 열지 않고 동작만 실행한다', () => {
      window.matchMedia = ((query: string) => ({
        matches: query === '(pointer: coarse)', media: query,
        addEventListener: () => {}, removeEventListener: () => {},
      })) as unknown as typeof window.matchMedia;
      const style = document.createElement('style');
      style.textContent = '[data-omittable] { display: none; }';
      document.head.appendChild(style);
      const onClick = vi.fn();
      render(<MenuCard icon={null} title="공방" sub="낚싯대 Lv.3" subRole="omittable" onClick={onClick} />);
      fireEvent.click(screen.getByRole('button'));
      expect(onClick).toHaveBeenCalledOnce();
      expect(screen.queryByRole('tooltip')).toBeNull();
    });

    it('툴팁으로 감싼 카드도 같은 행의 카드 높이를 따르도록 감싼 칸이 flex다', () => {
      render(<MenuCard icon={null} title="공방" sub="설명" subRole="omittable" />);
      expect(screen.getByRole('button').parentElement!.className).toContain('flex');
    });
  });
});

describe('MenuCard 잠금', () => {
  const lockedCard = (onClick = vi.fn()) => {
    render(<MenuCard icon={null} title="옷장" lock={['계정을 연결하면 쓸 수 있어요.']} onClick={onClick} />);
    return onClick;
  };

  it('잠금 카드에는 title 속성이 없고 자물쇠가 붙는다', () => {
    const { container } = render(<MenuCard icon={null} title="옷장" lock={['안내']} />);
    expect(container.querySelector('[title]')).toBeNull();
    expect(container.querySelector('[data-glyph="lock"]')).not.toBeNull();
    expect(screen.getByRole('button')).toHaveAttribute('aria-disabled', 'true');
  });

  it('잠금 카드를 눌러도 onClick은 실행되지 않고 툴팁만 열린다(거친 포인터)', () => {
    window.matchMedia = ((query: string) => ({
      matches: query === '(pointer: coarse)', media: query,
      addEventListener: () => {}, removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
    const onClick = lockedCard();
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
    expect(screen.getByRole('tooltip')).toHaveTextContent('계정을 연결하면 쓸 수 있어요.');
  });

  it('잠금 카드를 눌러도 onClick이 실행되지 않는다(마우스)', () => {
    const onClick = lockedCard();
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('마우스를 올리거나 키보드로 포커스하면 툴팁이 열린다', () => {
    lockedCard();
    fireEvent.mouseEnter(screen.getByRole('button').parentElement!);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    fireEvent.mouseLeave(screen.getByRole('button').parentElement!);
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.focus(screen.getByRole('button'));
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
  });

  it('잠금 사유가 접근성 설명으로 이어지고 이름은 그대로다', () => {
    render(<MenuCard icon={null} title="부엌" lock={['첫째', '둘째']} />);
    const card = screen.getByRole('button', { name: '부엌' });
    expect(card).toHaveAccessibleDescription('첫째 둘째');
  });

  it('같은 안내 줄이 겹쳐도 key 중복 경고 없이 줄마다 보인다', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<MenuCard icon={null} title="부엌" lock={['같은 줄', '같은 줄']} />);
    fireEvent.mouseEnter(screen.getByRole('button').parentElement!);
    expect(screen.getByRole('tooltip').querySelectorAll('.block')).toHaveLength(2);
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it('설명 줄이 숨겨졌을 때 잠금 툴팁은 잠금 안내 아래에 설명도 보인다', () => {
    const style = document.createElement('style');
    style.textContent = '[data-omittable] { display: none; }';
    document.head.appendChild(style);
    render(<MenuCard icon={null} title="부엌" sub="준비 설명" subRole="omittable" lock={['잠금 안내']} />);
    fireEvent.mouseEnter(screen.getByRole('button').parentElement!);
    const lines = [...screen.getByRole('tooltip').querySelectorAll('.block')].map(e => e.textContent);
    expect(lines).toEqual(['잠금 안내', '준비 설명']);
  });

  it('설명 줄이 보이는 동안 잠금 툴팁은 설명을 되풀이하지 않는다', () => {
    render(<MenuCard icon={null} title="부엌" sub="준비 설명" subRole="omittable" lock={['잠금 안내']} />);
    fireEvent.mouseEnter(screen.getByRole('button').parentElement!);
    const lines = [...screen.getByRole('tooltip').querySelectorAll('.block')].map(e => e.textContent);
    expect(lines).toEqual(['잠금 안내']);
  });

  it('안내 줄마다 줄을 나눠 보인다', () => {
    render(<MenuCard icon={null} title="부엌" lock={['첫째', '둘째']} />);
    fireEvent.mouseEnter(screen.getByRole('button').parentElement!);
    const lines = [...screen.getByRole('tooltip').querySelectorAll('.block')].map(e => e.textContent);
    expect(lines).toEqual(['첫째', '둘째']);
  });
});

describe('menu-compact 변형 정의', () => {
  it('index.css가 basemenu 컨테이너 기준의 menu-compact 변형을 정의한다', () => {
    const block = css.match(/@custom-variant\s+menu-compact\s*\{([\s\S]*?)\n\}/);
    expect(block, 'menu-compact 변형 정의가 없다').not.toBeNull();
    expect(block![1]).toMatch(/@container\s+basemenu\s*\(\s*width\s*<\s*\d+px\s*\)/);
    expect(block![1]).toMatch(/@container\s+basemenu\s*\(\s*height\s*<\s*\d+px\s*\)/);
    expect(block![1]).toContain('@slot');
  });
});
