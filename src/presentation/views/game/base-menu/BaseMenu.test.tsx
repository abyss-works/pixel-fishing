import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { newState } from '../../../../game/rules/logic';
import BaseMenu from './BaseMenu';

afterEach(cleanup);

const names = () => screen.getAllByRole('button').map(b => b.getAttribute('aria-label'));

describe('거점 카드 메뉴', () => {
  it('집은 게시판·작업대·목공소·판매 궤짝·문 순서로 카드를 늘어놓는다', () => {
    render(<BaseMenu base="home" game={newState()} />);
    expect(names()).toEqual(['게시판 · 랭킹', '작업대 · 낚싯대 Lv.1', '목공소 · 배 없음', '판매 궤짝', '문 · 마을로']);
  });

  it('항구는 게시판부터 출항까지 시설 순서를 따른다', () => {
    render(<BaseMenu base="harbor" game={newState()} />);
    expect(names()).toEqual(['게시판 · 랭킹', '수배판 · 의뢰/토벌', '공방 · 낚싯대 Lv.1', '조선소 · 배 없음',
      '어시장 · 판매', '여객선 · 마을로', '승선 · 바다로']);
  });

  it('카드는 정보·상점·이동 구역으로 나뉜다', () => {
    render(<BaseMenu base="colombo" game={newState()} />);
    const section = (title: string) => [...screen.getByRole('heading', { name: title }).parentElement!
      .querySelectorAll('[data-facility]')].map(el => el.getAttribute('data-facility'));
    expect(screen.getAllByRole('heading').map(h => h.textContent)).toEqual(['정보', '상점', '이동']);
    expect(section('정보')).toEqual(['rank', 'bounty']);
    expect(section('상점')).toEqual(['rod', 'boat', 'shop', 'sell']);
    expect(section('이동')).toEqual(['travel', 'exit']);
  });

  it('카드를 누르면 그 시설을 알린다', () => {
    const onFacility = vi.fn();
    render(<BaseMenu base="home" game={newState()} onFacility={onFacility} />);
    fireEvent.click(screen.getByRole('button', { name: '목공소 · 배 없음' }));
    expect(onFacility).toHaveBeenCalledWith('boat');
  });

  it('배경은 거점 이름으로 읽힌다', () => {
    render(<BaseMenu base="harbor" game={newState()} />);
    expect(screen.getByLabelText('항구')).toBeInTheDocument();
  });
});
