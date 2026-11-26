import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import EventHudButton from './EventHudButton';
import MobileEventHudButton from './MobileEventHudButton';

afterEach(cleanup);

describe('EventHudButton과 MobileEventHudButton', () => {
  it('PC 이벤트 버튼은 정사각형 헤더 틀과 트로피 아이콘, 이벤트 라벨, 알림 점을 렌더링한다', () => {
    const { rerender, container } = render(<EventHudButton alert />);
    const btn = screen.getByRole('button', { name: '이벤트' });
    expect(btn.className).toContain('h-(--hdr-menu)');
    expect(btn.className).toContain('w-(--hdr-menu)');
    expect(btn).toHaveTextContent('이벤트');
    expect(container.querySelector('[data-glyph="trophy"]')).not.toBeNull();
    expect(container.querySelector('.bg-danger')).not.toBeNull();

    rerender(<EventHudButton alert open />);
    expect(container.querySelector('.bg-danger')).toBeNull();
  });

  it('모바일 이벤트 버튼은 모바일 정사각형 틀과 이벤트 라벨, 알림 점을 렌더링한다', () => {
    const { rerender, container } = render(<MobileEventHudButton alert />);
    const btn = screen.getByRole('button', { name: '이벤트' });
    expect(btn).toHaveTextContent('이벤트');
    expect(container.querySelector('[data-glyph="trophy"]')).not.toBeNull();
    expect(container.querySelector('.bg-danger')).not.toBeNull();

    rerender(<MobileEventHudButton alert open />);
    expect(container.querySelector('.bg-danger')).toBeNull();
  });
});
