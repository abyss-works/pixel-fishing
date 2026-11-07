import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import GameStageLayout from './GameStageLayout';

afterEach(cleanup);

describe('GameStageLayout', () => {
  it('PC 배치의 스테이지는 메시지 창이 프레임 안으로 들어오는 높이(--log-clear)를 정의한다', () => {
    const { container } = render(<GameStageLayout>내용</GameStageLayout>);
    const cls = (container.firstElementChild as HTMLElement).className;
    expect(container.firstElementChild).toHaveAttribute('data-game-stage');
    expect(cls).toContain('[--log-clear:');
    expect(cls).toContain('var(--log-h)');
    expect(cls).toContain('var(--frame-h)');
  });
});
