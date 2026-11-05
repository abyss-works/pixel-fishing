// 접속 목록 창: 이름 칸 격자에서 고른 사람의 정보를 아래 세 칸 배치로 보인다. 아무도 없으면 빈 상태를 안내한다.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const s = vi.hoisted(() => ({ players: [] as { uid: string; nick: string }[] }));
vi.mock('../../../../features/live/service/useLive', () => ({ usePlayersIn: () => s.players }));
vi.mock('./PlayerInfo', () => ({
  PlayerInfo: ({ target, layout }: { target: { nick: string }; layout: string }) => <p>{`${target.nick} 정보 ${layout}`}</p>,
}));

import PlayersModal from './PlayersModal';

const show = () => render(<PlayersModal region="pacific" account={null} setToast={vi.fn()} onClose={vi.fn()} />);

describe('PlayersModal(이 바다의 플레이어)', () => {
  afterEach(() => { cleanup(); s.players = []; });

  it('처음에는 첫 사람을 고르고, 이름 칸을 누르면 그 사람의 정보를 세 칸 배치로 보인다', () => {
    s.players = [{ uid: 'a', nick: '바다사나이' }, { uid: 'b', nick: '밤낚시꾼' }];
    show();
    expect(screen.getByText('바다사나이 정보 grid')).toBeTruthy();
    expect(screen.getByRole('button', { name: '바다사나이' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: '밤낚시꾼' }));
    expect(screen.getByText('밤낚시꾼 정보 grid')).toBeTruthy();
    expect(screen.getByRole('button', { name: '바다사나이' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('아무도 없으면 빈 상태를 안내한다', () => {
    show();
    expect(screen.getByText('지금 이 바다에 다른 플레이어가 없어요.')).toBeTruthy();
  });
});
