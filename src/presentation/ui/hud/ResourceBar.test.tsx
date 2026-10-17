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

  it('수주/토벌 칸은 서버 값이 오기 전에도 자리를 지키고 "–"를 보인다', () => {
    render(<ResourceBar game={newState()} />);
    expect(hud()).toContain('수주/토벌');
    expect(hud()).toContain('––');
  });

  it('서버 값이 있으면 남은 일반 수주와 네임드 토벌을 나란히 보인다', () => {
    snap = { acceptsToday: 1, namedToday: 0, progress: [], tickets: [] };
    render(<ResourceBar game={newState()} />);
    expect(hud()).toMatch(/수주\/토벌 01$/);
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
