import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { newState } from '../../../../../game/rules/logic';
import { setCurrentSpot } from '../../../../../game/world/currentSpot';
import VRegion from './VRegion';

afterEach(() => {
  cleanup();
  act(() => {
    setCurrentSpot(null);
  });
});

function show(over: Partial<ReturnType<typeof newState>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const game = { ...newState(), ...over };
  render(
    <QueryClientProvider client={client}>
      <VRegion region="village" game={game} />
    </QueryClientProvider>,
  );
}

describe('VRegion', () => {
  it('바깥 표면에 구역 로어와 팁 목록을 펼치지 않고 지역 안내 툴팁과 구역 이야기 보기 모달로 분리한다', () => {
    show();
    expect(screen.getByRole('heading', { name: '고향 마을' })).toBeInTheDocument();
    expect(screen.queryByText('여기서 할 수 있는 것')).toBeNull();
    expect(screen.queryByText('어군 가까이 가면 사는 물고기를 볼 수 있어요.')).toBeNull();

    fireEvent.mouseEnter(screen.getByText('지역 안내'));
    expect(screen.getByRole('tooltip')).toHaveTextContent('고향 마을 안내');
    fireEvent.mouseLeave(screen.getByText('지역 안내'));

    fireEvent.click(screen.getByRole('button', { name: '구역 이야기 보기' }));
    const loreDialog = screen.getByRole('dialog');
    expect(loreDialog).toHaveTextContent('고향 마을');
    expect(loreDialog.parentElement!.className).toContain('z-(--z-app-modal)');
  });

  it('사거리 내 어군에서 발견한 어종 카드를 누르면 어종 상세 창이 열린다', () => {
    act(() => setCurrentSpot('pond'));
    show({ dex: { crucian: { normal: { count: 1, maxSize: 18, first: null } } } });
    fireEvent.click(screen.getByRole('button', { name: /붕어/ }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('붕어');
    expect(dialog).toHaveTextContent('표본');
  });
});
