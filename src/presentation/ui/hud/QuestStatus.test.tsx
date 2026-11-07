import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import QuestStatus from './QuestStatus';

const group = () => screen.getByRole('group', { name: '오늘 남은 클리어 횟수' });

describe('의뢰 현황', () => {
  afterEach(cleanup);

  it('오늘 의뢰 라벨 없이 일반, 네임드 두 칸에 라벨 다음 값을 보인다', () => {
    render(<QuestStatus general={1} named={0} />);
    expect(group().textContent).toBe('일반 1네임드 0');
    expect(group().textContent).not.toContain('오늘 의뢰');
  });

  it('가장 긴 값도 그대로 보인다', () => {
    render(<QuestStatus general={10} named={3} />);
    expect(group().textContent).toBe('일반 10네임드 3');
  });

  it('네임드 값만 네임드 색(영웅 보라)이다', () => {
    render(<QuestStatus general={1} named={1} />);
    const values = [...group().querySelectorAll('b')].map(b => b.parentElement!.className);
    expect(values[0]).toContain('text-gold');
    expect(values[1]).toContain('text-epic');
  });

  it('누르는 동작을 두지 않는다', () => {
    render(<QuestStatus general={1} named={1} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
