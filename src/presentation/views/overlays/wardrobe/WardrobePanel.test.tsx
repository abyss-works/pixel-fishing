import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { newState } from '../../../../game/rules/logic';
import type { GameState } from '../../../../game/rules/logic';
import WardrobePanel from './WardrobePanel';

const seed = (over: Partial<GameState> = {}): GameState => ({ ...newState(), ...over });

function openHatsTab(game: GameState) {
  render(
    <WardrobePanel
      game={game}
      busy={false}
      onChangeClothes={vi.fn()}
      onBuyHat={vi.fn()}
      onWearHat={vi.fn()}
      onClose={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: /모자/ }));
}

describe('WardrobePanel(옷장 창) 모자 상세', () => {
  afterEach(cleanup);

  it('보유한 업적 모자를 고르면 가격 0G 대신 업적 보상 출처와 업적 이름을 보인다', () => {
    openHatsTab(seed({ hats: ['straw-hat'] }));
    fireEvent.click(screen.getByRole('button', { name: '밀짚모자' }));

    expect(screen.queryByText(/0G/)).toBeNull();
    expect(screen.getByText(/업적 보상/)).toBeTruthy();
    expect(screen.getByText('마을 돌연변이 도감')).toBeTruthy();
    expect(screen.getByRole('button', { name: '쓰기' })).toBeTruthy();
  });

  it('보유한 골드 모자를 고르면 기존처럼 가격을 보인다', () => {
    openHatsTab(seed({ hats: ['cap-red'] }));
    fireEvent.click(screen.getByRole('button', { name: '빨간 모자' }));

    expect(screen.getByText('50,000G')).toBeTruthy();
    expect(screen.queryByText(/업적 보상/)).toBeNull();
  });

  it('미보유 업적 모자를 고르면 해금 조건, 진척, 업적 모자 버튼을 보인다', () => {
    openHatsTab(seed());
    fireEvent.click(screen.getByRole('button', { name: '밀짚모자, 아직 없음' }));

    expect(screen.getByText(/해금 조건/)).toBeTruthy();
    expect(screen.getByText(/진척/)).toBeTruthy();
    expect(screen.getByRole('button', { name: '업적 모자' })).toBeTruthy();
  });

  it('미보유 이벤트 모자를 고르면 0G 사기 대신 접속 선물 안내와 이벤트 한정 버튼을 보인다', () => {
    openHatsTab(seed({ gold: 1_000_000 }));
    fireEvent.click(screen.getByRole('button', { name: '산타모자, 아직 없음' }));

    expect(screen.queryByText(/0G/)).toBeNull();
    expect(screen.getByText('겨울 이벤트 기간에 접속하면 우편함으로 받을 수 있어요.')).toBeTruthy();
    expect(screen.getByRole('button', { name: '이벤트 한정' })).toBeDisabled();
  });

  it('보유한 이벤트 모자를 고르면 가격 0G 대신 이벤트 한정 출처와 쓰기 버튼을 보인다', () => {
    openHatsTab(seed({ hats: ['santa-hat'] }));
    fireEvent.click(screen.getByRole('button', { name: '산타모자' }));

    expect(screen.queryByText(/0G/)).toBeNull();
    expect(screen.getByText(/이벤트 한정/)).toBeTruthy();
    expect(screen.getByText('겨울 이벤트 접속 선물')).toBeTruthy();
    expect(screen.getByRole('button', { name: '쓰기' })).toBeTruthy();
  });
});
