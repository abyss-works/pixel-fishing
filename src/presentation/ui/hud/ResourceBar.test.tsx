import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newState } from '../../../game/rules/logic';
import type { BountySnapshot } from '../../../features/bounty/model/types';
import ResourceBar from './ResourceBar';

let snap: BountySnapshot | null = null;
vi.mock('../../../features/bounty/service/useBounty', () => ({
  useBounty: () => ({ snap, loaded: snap !== null, refresh: () => {} }),
}));

const hud = () => screen.getByRole('button', { name: '스탯창 열기' }).textContent ?? '';

describe('자원 바', () => {
  beforeEach(() => { snap = null; });
  afterEach(cleanup);

  it('오늘 의뢰 칸은 서버 값이 오기 전에도 자리를 지키고 "–"를 보인다', () => {
    render(<ResourceBar game={newState()} />);
    expect(hud()).toContain('오늘 의뢰');
    expect(hud()).toContain('––');
  });

  it('서버 값이 있으면 오늘 남은 클리어를 일반 의뢰 · 네임드 토벌 순서로 나란히 보인다', () => {
    snap = { clearsToday: { general: 1, named: 0 }, progress: [], tickets: [] };
    render(<ResourceBar game={newState()} />);
    expect(hud()).toMatch(/오늘 의뢰 01$/);
  });

  it('수주만으로는 남은 클리어가 줄지 않는다 — 진행 중인 의뢰가 있어도 클리어 0이면 그대로다', () => {
    snap = { clearsToday: { general: 0, named: 0 }, progress: [{ questId: 'pacific-easy-common', progress: 3 }], tickets: [] };
    render(<ResourceBar game={newState()} />);
    expect(hud()).toMatch(/오늘 의뢰 11$/);
  });

  it('두 갈래를 모두 클리어했으면 0 · 0이다', () => {
    snap = { clearsToday: { general: 1, named: 1 }, progress: [], tickets: [] };
    render(<ResourceBar game={newState()} />);
    expect(hud()).toMatch(/오늘 의뢰 00$/);
  });

  it('골드·명성은 단위 없이 줄임 표기다', () => {
    render(<ResourceBar game={{ ...newState(), gold: 1_534_000, fame: 12_345 }} />);
    expect(hud()).toContain('골드 1.5M');
    expect(hud()).toContain('명성 12.3K');
  });

  it('가방은 수량과 채움 비율을 보이고, 75% 이상이면 주황·95% 이상이면 빨강 계열이다', () => {
    const fish = (i: number) => ({ uid: `u${i}`, fishId: 'carp', form: 'normal' as const, size: 10,
      caughtAt: null, spot: null, judgment: null, locked: false });
    const bagValue = () => screen.getByText('가방', { exact: false }).parentElement!.lastElementChild!;
    const { rerender } = render(<ResourceBar game={{ ...newState(), boat: 0, bag: [] }} />);
    expect(hud()).toContain('가방 0 (0%)');
    expect(bagValue().className).toContain('text-gold');
    rerender(<ResourceBar game={{ ...newState(), boat: 0, bag: Array.from({ length: 45 }, (_, i) => fish(i)) }} />);
    expect(hud()).toContain('가방 45 (75%)');
    expect(bagValue().className).toContain('text-orange');
    rerender(<ResourceBar game={{ ...newState(), boat: 0, bag: Array.from({ length: 57 }, (_, i) => fish(i)) }} />);
    expect(bagValue().className).toContain('text-danger');
  });
});
