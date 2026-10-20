// 도움말의 바운티 헌팅 절 — 클리어 기준 하루 한도와 04:00 만료, 수주 뒤 어획만 세는 규칙을 안내하고 옛 수주권 표현을 쓰지 않는다.
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import VHelp from './VHelp';

afterEach(cleanup);

describe('VHelp 바운티 헌팅', () => {
  const text = () => {
    const { container } = render(<VHelp />);
    return container.textContent ?? '';
  };

  it('수주권이라는 말을 쓰지 않는다 — 하루 횟수는 클리어로 센다', () => {
    expect(text()).not.toContain('수주권');
  });

  it('갈래마다 하나씩 수주하고 하루 클리어 횟수가 있으며 오늘 의뢰 칸에서 남은 횟수를 본다고 안내한다', () => {
    const t = text();
    expect(t).toContain('일반 의뢰와 네임드 토벌은 구역에 상관없이 각각 하나씩만 수주할 수 있어요.');
    expect(t).toContain('수배판에서 보상을 받으면 클리어이고, 하루에 일반 의뢰 1번 · 네임드 토벌 1번 클리어할 수 있어요.');
    expect(t).toContain('오늘 의뢰');
  });

  it('조건을 채우지 못한 의뢰는 한국 시간 새벽 4시에 사라지고 조건을 채운 의뢰는 보상을 받을 수 있다고 안내한다', () => {
    const t = text();
    expect(t).toContain('조건을 채우지 못한 의뢰는 한국 시간 새벽 4시에 사라져요.');
    expect(t).toContain('조건을 모두 채운 의뢰는 그 시각이 지나도 보상을 받을 수 있어요.');
  });

  it('일반 의뢰는 수주 뒤의 어획만 세고 물고기를 가져가지 않는다고 안내한다', () => {
    const t = text();
    expect(t).toContain('수주하기 전에 잡은 물고기는 세지 않아요.');
    expect(t).toContain('잡은 물고기는 가방에 그대로 남아요.');
  });
});
