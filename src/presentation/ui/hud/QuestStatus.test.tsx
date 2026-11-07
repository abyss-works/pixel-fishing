import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import QuestStatus from './QuestStatus';

const button = () => screen.getByRole('button', { name: /^의뢰 창 열기/ });

describe('의뢰 현황', () => {
  afterEach(cleanup);

  it('오늘 의뢰 라벨 없이 일반, 네임드 두 칸에 라벨 다음 값을 보인다', () => {
    render(<QuestStatus general={1} named={0} />);
    expect(button().textContent).toBe('일반 1네임드 0');
    expect(button().textContent).not.toContain('오늘 의뢰');
  });

  it('가장 긴 값도 그대로 보인다', () => {
    render(<QuestStatus general={10} named={3} />);
    expect(button().textContent).toBe('일반 10네임드 3');
  });

  it('네임드 값만 네임드 색(영웅 보라)이다', () => {
    render(<QuestStatus general={1} named={1} />);
    const values = [...button().querySelectorAll('b')].map(b => b.parentElement!.className);
    expect(values[0]).toContain('text-gold');
    expect(values[1]).toContain('text-epic');
  });

  it('버튼이고, 접근성 이름에 열리는 창과 오늘 남은 클리어를 싣는다', () => {
    render(<QuestStatus general={1} named={0} />);
    expect(button()).toHaveAccessibleName('의뢰 창 열기, 오늘 남은 클리어 일반 1 네임드 0');
  });

  it('누르면 의뢰 창을 연다', () => {
    const onOpen = vi.fn();
    render(<QuestStatus general={1} named={1} onOpen={onOpen} />);
    fireEvent.click(button());
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
