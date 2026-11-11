import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { newState } from '../../../../game/rules/logic';
import { BASE_PACKS } from '../../../../game/world';
import type { BaseId } from '../../../../game/world';
import { STACK_MENU_CLASS } from '../../../ui/hud/stackTier';
import BaseMenu from './BaseMenu';

afterEach(cleanup);

const names = () => screen.getAllByRole('button').map(b => b.getAttribute('aria-label'));

describe('거점 카드 메뉴', () => {
  it('집은 게시판·작업대·목공소·판매 궤짝·옷장·문 순서로 카드를 늘어놓는다', () => {
    render(<BaseMenu base="home" game={newState()} />);
    expect(names()).toEqual(['게시판 랭킹', '작업대 낚싯대 Lv.1', '목공소 배 없음', '궤짝 판매', '옷장', '문 마을로']);
  });

  it('항구는 게시판부터 출항까지 시설 순서를 따른다', () => {
    render(<BaseMenu base="harbor" game={newState()} />);
    expect(names()).toEqual(['게시판 랭킹', '수배판 의뢰/토벌', '공방 낚싯대 Lv.1', '조선소 배 없음',
      '어시장 판매', '마을 집으로', '여객선 빠른 이동', '승선 바다로']);
  });

  it('항구의 승선 카드는 내 배를, 마을 카드는 집을, 빠른 이동 카드는 여객선을 아이콘으로 쓴다', () => {
    render(<BaseMenu base="harbor" game={{ ...newState(), boat: 2 }} />);
    expect(document.querySelector('[data-facility="exit"] [data-icon="boat"]')).not.toBeNull();
    expect(document.querySelector('[data-facility="travel"] [data-icon="house"]')).not.toBeNull();
    expect(document.querySelector('[data-facility="ferry"] canvas')).not.toBeNull();
  });

  it('카드는 정보·상점·이동 구역으로 나뉜다', () => {
    render(<BaseMenu base="colombo" game={newState()} />);
    const section = (title: string) => [...screen.getByRole('heading', { name: title }).parentElement!
      .querySelectorAll('[data-facility]')].map(el => el.getAttribute('data-facility'));
    expect(screen.getAllByRole('heading').map(h => h.textContent)).toEqual(['정보', '상점', '이동']);
    expect(section('정보')).toEqual(['rank', 'bounty']);
    expect(section('상점')).toEqual(['rod', 'boat', 'sell', 'shop']);
    expect(section('이동')).toEqual(['travel', 'ferry', 'exit']);
  });

  it('카드를 누르면 그 시설을 알린다', () => {
    const onFacility = vi.fn();
    render(<BaseMenu base="home" game={newState()} onFacility={onFacility} />);
    fireEvent.click(screen.getByRole('button', { name: '목공소 배 없음' }));
    expect(onFacility).toHaveBeenCalledWith('boat');
  });

  it('배경은 거점 이름으로 읽힌다', () => {
    render(<BaseMenu base="harbor" game={newState()} />);
    expect(screen.getByLabelText('항구')).toBeInTheDocument();
  });

  describe('설명 줄 생략 가드', () => {
    const bases = Object.keys(BASE_PACKS) as BaseId[];

    it.each(bases)('%s 카드의 설명 줄은 모두 생략 역할이고, 제목 줄과 아이콘은 생략 대상이 아니다', base => {
      render(<BaseMenu base={base} game={newState()} />);
      for (const card of document.querySelectorAll('[data-facility]')) {
        const id = card.getAttribute('data-facility')!;
        const spans = [...card.querySelectorAll(':scope > span')];
        const omittable = spans.filter(s => s.hasAttribute('data-omittable'));
        const fixed = spans.filter(s => !s.hasAttribute('data-omittable'));
        expect(fixed.length, id).toBe(2);
        for (const el of fixed) expect(el.className, id).not.toContain('menu-compact:');
        expect(omittable.length, id).toBeLessThanOrEqual(1);
      }
      expect(document.querySelectorAll('[data-omittable]').length).toBeGreaterThan(0);
    });

    it('메뉴 영역은 이름 붙은 size 컨테이너다', () => {
      render(<BaseMenu base="harbor" game={newState()} />);
      const root = screen.getByRole('heading', { name: '정보' }).closest('[class*="container:basemenu"]');
      expect(root).not.toBeNull();
      expect(root!.className).toContain('[container:basemenu/size]');
    });

    it('메뉴 영역은 채팅 자리를 비우지 않고 프레임 전체를 쓴다 - PC 레이아웃은 헤더 아래부터다', () => {
      render(<BaseMenu base="harbor" game={newState()} />);
      const root = screen.getByRole('heading', { name: '정보' }).closest('[class*="container:basemenu"]')!;
      expect(root.className).toContain('absolute inset-0');
      expect(root.className).not.toContain('--log-clear');
      // PC 레이아웃은 겹친 헤더 아래부터 시작한다
      expect(root.className).toContain(STACK_MENU_CLASS);
    });

    it('메뉴 영역은 세로로 스크롤하지 않고 내용을 위쪽부터 놓는다 - 모자라면 카드가 줄어든다', () => {
      render(<BaseMenu base="colombo" game={newState()} />);
      const root = screen.getByRole('heading', { name: '정보' }).closest('[class*="container:basemenu"]')!;
      expect(root.querySelector('.pf-vscroll, .pf-scroll-hud')).toBeNull();
      const content = screen.getByRole('heading', { name: '정보' }).closest('.items-center')!;
      expect(content.className).not.toContain('my-auto');
    });

    it('설명이 없는 시설은 설명 줄을 그리지 않는다', () => {
      render(<BaseMenu base="home" game={newState()} />);
      expect(document.querySelector('[data-facility="wardrobe"] [data-omittable]')).toBeNull();
    });
  });
});
