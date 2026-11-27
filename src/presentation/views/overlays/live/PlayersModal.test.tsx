// 접속 목록 창: xl(920px) 고정 높이 2열(좌 280px·우 상세)에서 검색, 2종 정렬(명성순/가나다순), 2행 카드, 상세 연동과 빈 상태를 처리한다.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { PlayerListItem } from '../../../../features/live/model/live';
import { DEFAULT_LOOK } from '../../../../game/content/wardrobe';

const s = vi.hoisted(() => ({
  players: [] as PlayerListItem[],
}));
vi.mock('../../../../features/live/service/useLive', () => ({ usePlayersIn: () => s.players }));
vi.mock('./PlayerInfo', () => ({
  PlayerInfo: ({ target }: { target: { uid: string; nick: string } }) => (
    <div data-testid="player-detail">{`${target.nick} (${target.uid}) 정보`}</div>
  ),
}));

import PlayersModal from './PlayersModal';

const item = (
  uid: string,
  nick: string,
  boat: number,
  fame: number,
  zoneLabel: string | null = '태평양',
): PlayerListItem => ({
  uid,
  nick,
  boat,
  boatTierLabel: boat < 1 ? '도보' : `T${boat}`,
  fame,
  look: DEFAULT_LOOK,
  zoneLabel,
});

const show = () => render(<PlayersModal region="pacific" account={null} setToast={vi.fn()} onClose={vi.fn()} />);

describe('PlayersModal(이 바다의 플레이어)', () => {
  afterEach(() => { cleanup(); s.players = []; });

  it('기본 명성순으로 첫 사람을 고르고, 2행 카드(확대 아바타·닉네임·배 티어·명성 수치)와 우측 상세를 연동한다', () => {
    s.players = [
      item('a', '새벽낚시', 0, 320, '태평양'),
      item('b', '바다사냥꾼', 9, 248_600, '북대서양'),
      item('c', 'AlphaFisher', 5, 12_450, '인도양'),
    ];
    show();
    expect(screen.getByText('3명')).toBeTruthy();
    expect(screen.getByTestId('player-detail').textContent).toBe('바다사냥꾼 (b) 정보');

    const listSection = screen.getByLabelText('접속자 목록');
    const cards = within(listSection).getAllByRole('button', { pressed: undefined })
      .filter(el => el.getAttribute('aria-pressed') !== null && !el.closest('[aria-label="목록 정렬"]'));
    expect(cards.map(c => c.textContent)).toEqual([
      '바다사냥꾼T9248,600',
      'AlphaFisherT512,450',
      '새벽낚시도보320',
    ]);

    expect(cards[0].getAttribute('aria-pressed')).toBe('true');
    // 배 이름, 해역, "명성" 텍스트 라벨은 2행 카드에 두지 않는다
    expect(cards[0]).not.toHaveTextContent('가공 플랜트선');
    expect(cards[0]).not.toHaveTextContent('북대서양');
    expect(cards[0]).not.toHaveTextContent('명성');
    expect(cards[0].querySelector('[data-glyph="star"]')).not.toBeNull();
    // 확대된 2배율 아바타(32x44)
    const canvas = cards[0].querySelector('canvas');
    expect(canvas?.getAttribute('width')).toBe('32');
    expect(canvas?.getAttribute('height')).toBe('44');

    fireEvent.click(cards[2]);
    expect(screen.getByTestId('player-detail').textContent).toBe('새벽낚시 (a) 정보');
    expect(cards[0].getAttribute('aria-pressed')).toBe('false');
    expect(cards[2].getAttribute('aria-pressed')).toBe('true');
  });

  it('정렬은 명성순과 가나다순 2종만 제공하고 전환 시 목록 순서를 바꾼다', () => {
    s.players = [
      item('a', '하늘', 3, 1_000),
      item('b', '가람', 1, 500),
      item('c', '나루', 7, 1_000),
    ];
    show();

    const sortGroup = screen.getByRole('group', { name: '목록 정렬' });
    const sortButtons = within(sortGroup).getAllByRole('button');
    expect(sortButtons.map(b => b.textContent)).toEqual(['명성순', '가나다순']);
    expect(sortButtons[0].getAttribute('aria-pressed')).toBe('true');
    expect(sortButtons[1].getAttribute('aria-pressed')).toBe('false');

    const cardNames = () => within(screen.getByLabelText('접속자 목록'))
      .getAllByRole('button')
      .filter(el => !el.closest('[aria-label="목록 정렬"]') && el.getAttribute('aria-label') !== '검색어 지우기')
      .map(el => el.querySelector('span.truncate')?.textContent);

    // 명성순(기본): 1,000 동률 시 가나다순(나루 -> 하늘), 다음 가람
    expect(cardNames()).toEqual(['나루', '하늘', '가람']);

    fireEvent.click(sortButtons[1]);
    expect(sortButtons[0].getAttribute('aria-pressed')).toBe('false');
    expect(sortButtons[1].getAttribute('aria-pressed')).toBe('true');
    expect(cardNames()).toEqual(['가람', '나루', '하늘']);
  });

  it('닉네임 검색으로 즉시 필터링하고, 검색 결과가 없으면 빈 검색 안내와 검색 초기화 버튼을 보인다', () => {
    s.players = [
      item('a', 'AlphaFisher', 4, 2_000),
      item('b', '바다사냥꾼', 9, 248_600),
    ];
    show();

    const searchInput = screen.getByLabelText('닉네임 검색');
    fireEvent.change(searchInput, { target: { value: 'alpha' } });
    expect(screen.getByText('1명')).toBeTruthy();
    expect(screen.getByTestId('player-detail').textContent).toBe('AlphaFisher (a) 정보');

    fireEvent.change(searchInput, { target: { value: '없는닉네임' } });
    expect(screen.getByText('0명')).toBeTruthy();
    expect(screen.getByText('검색과 일치하는 플레이어가 없어요.')).toBeTruthy();
    // 검색 결과가 없어도 우측 상세와 검색창은 유지된다
    expect(screen.getByTestId('player-detail')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '검색 초기화' }));
    expect((searchInput as HTMLInputElement).value).toBe('');
    expect(screen.getByText('2명')).toBeTruthy();
  });

  it('920px xl 고정 높이 모달과 좌측 280px 목록·우측 상세 2열 배치를 쓴다', () => {
    s.players = [item('a', '바다사나이', 1, 100)];
    show();
    const dialog = screen.getByRole('dialog', { name: '이 바다의 플레이어' });
    expect(dialog.className).toContain('w-[min(920px,calc(100%-32px))]');
    expect(dialog.className).toContain('h-[min(560px,calc(100%-32px))]');
    expect(dialog.className).toContain('mobile:h-[calc(100%-48px)]');
    const listSection = screen.getByLabelText('접속자 목록');
    expect(listSection.parentElement?.className).toContain('grid-cols-[280px_minmax(0,1fr)]');
    expect(listSection.parentElement?.className).toContain('mobile:grid-cols-1');
    expect(listSection.parentElement?.className).toContain('mobile:grid-rows-[auto_minmax(0,1fr)]');
  });

  it('아무도 없으면 빈 상태를 안내한다', () => {
    show();
    expect(screen.getByText('지금 이 바다에 다른 플레이어가 없어요.')).toBeTruthy();
  });
});
