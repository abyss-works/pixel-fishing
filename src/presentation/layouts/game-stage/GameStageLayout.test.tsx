import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';

const flag = vi.hoisted(() => ({ mobile: false }));
vi.mock('../useMobileLayout', () => ({ useMobileLayout: () => flag.mobile }));

import GameStageLayout from './GameStageLayout';

afterEach(() => { cleanup(); flag.mobile = false; });

describe('GameStageLayout', () => {
  it('PC 레이아웃의 스테이지는 메시지 창이 프레임 안으로 들어오는 높이(--log-clear)를 정의한다', () => {
    const { container } = render(<GameStageLayout>내용</GameStageLayout>);
    const cls = (container.firstElementChild as HTMLElement).className;
    expect(container.firstElementChild).toHaveAttribute('data-game-stage');
    expect(cls).toContain('[--log-clear:');
    expect(cls).toContain('var(--log-h)');
    expect(cls).toContain('var(--frame-h)');
  });

  it('모바일 레이아웃의 스테이지는 헤더 두 덩어리(자원 바, 메뉴 버튼)를 담는 2열, 위(헤더), 가운데(게임 영역), 아래(채팅 영역) 3행 격자다', () => {
    flag.mobile = true;
    const { container } = render(<GameStageLayout>내용</GameStageLayout>);
    const cls = (container.firstElementChild as HTMLElement).className;
    expect(cls).toContain('grid-cols-[minmax(0,1fr)_auto]');
    expect(cls).toContain('grid-rows-[auto_minmax(0,1fr)_auto]');
  });

  it('스테이지는 자기 폭을 기준으로 헤더가 줄어들도록 크기 컨테이너다', () => {
    const { container } = render(<GameStageLayout>내용</GameStageLayout>);
    expect((container.firstElementChild as HTMLElement).className).toContain('[container-type:size]');
  });
});
