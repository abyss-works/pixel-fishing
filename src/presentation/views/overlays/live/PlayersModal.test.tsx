// 접속 목록 창: xl 고정 높이 2열 배치에서 좌측 1열 목록 선택 시 우측 상세를 동기화하고, 빈 상태와 모바일 레이아웃을 처리한다.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const s = vi.hoisted(() => ({
  players: [] as { uid: string; nick: string; zoneLabel?: string | null }[],
}));
vi.mock('../../../../features/live/service/useLive', () => ({ usePlayersIn: () => s.players }));
vi.mock('./PlayerInfo', () => ({
  PlayerInfo: ({ target }: { target: { uid: string; nick: string } }) => (
    <div data-testid="player-detail">{`${target.nick} (${target.uid}) 정보`}</div>
  ),
}));

import PlayersModal from './PlayersModal';

const show = () => render(<PlayersModal region="pacific" account={null} setToast={vi.fn()} onClose={vi.fn()} />);

describe('PlayersModal(이 바다의 플레이어)', () => {
  afterEach(() => { cleanup(); s.players = []; });

  it('처음에는 첫 사람을 고르고, 좌측 목록에서 다른 사람을 누르면 우측 상세가 동기화된다', () => {
    s.players = [
      { uid: 'a', nick: '바다사나이', zoneLabel: '태평양' },
      { uid: 'b', nick: '밤낚시꾼', zoneLabel: '동남아' },
    ];
    show();
    expect(screen.getByText('2명')).toBeTruthy();
    expect(screen.getByTestId('player-detail').textContent).toBe('바다사나이 (a) 정보');
    const firstBtn = screen.getByRole('button', { name: /바다사나이/ });
    const secondBtn = screen.getByRole('button', { name: /밤낚시꾼/ });
    expect(firstBtn.getAttribute('aria-pressed')).toBe('true');
    expect(firstBtn).toHaveTextContent('태평양');
    expect(secondBtn).toHaveTextContent('동남아');

    fireEvent.click(secondBtn);
    expect(screen.getByTestId('player-detail').textContent).toBe('밤낚시꾼 (b) 정보');
    expect(firstBtn.getAttribute('aria-pressed')).toBe('false');
    expect(secondBtn.getAttribute('aria-pressed')).toBe('true');
  });

  it('920px xl 고정 높이 모달과 좌측 1열 목록·우측 상세 2열 배치를 쓴다', () => {
    s.players = [{ uid: 'a', nick: '바다사나이' }];
    show();
    const dialog = screen.getByRole('dialog', { name: '이 바다의 플레이어' });
    expect(dialog.className).toContain('w-[min(920px,calc(100%-32px))]');
    expect(dialog.className).toContain('h-[min(560px,calc(100%-32px))]');
    expect(dialog.className).toContain('mobile:h-[calc(100%-48px)]');
    const listSection = screen.getByLabelText('접속자 목록');
    expect(listSection.parentElement?.className).toContain('grid-cols-[220px_minmax(0,1fr)]');
    expect(listSection.parentElement?.className).toContain('mobile:grid-cols-1');
  });

  it('아무도 없으면 빈 상태를 안내한다', () => {
    show();
    expect(screen.getByText('지금 이 바다에 다른 플레이어가 없어요.')).toBeTruthy();
  });
});
