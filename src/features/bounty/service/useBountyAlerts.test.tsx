// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook } from '@testing-library/react';
import { BOUNTIES } from '../../../game/content/bounties';
import type { BountySnapshot } from '../model/types';

const state = vi.hoisted(() => ({ snap: null as BountySnapshot | null }));
vi.mock('./useBounty', () => ({
  useBounty: () => ({ snap: state.snap, loaded: true, refresh: () => {} }),
}));

import { useBountyAlerts } from './useBountyAlerts';

afterEach(() => {
  cleanup();
  state.snap = null;
});

describe('useBountyAlerts', () => {
  it('수주 중인 일반 의뢰가 목표 완료로 처음 전환될 때만 알린다', () => {
    const general = BOUNTIES.find(q => q.difficulty !== 'named')!;
    const makeSnap = (progress: number): BountySnapshot => ({
      clearsToday: { general: 0, named: 0 },
      progress: [{ questId: general.id, progress }],
      tickets: [],
    });

    const notify = vi.fn();
    state.snap = makeSnap(general.count - 1);
    const { rerender } = renderHook(() => useBountyAlerts(notify));
    expect(notify).not.toHaveBeenCalled();

    state.snap = makeSnap(general.count);
    rerender();
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('목표를 달성했어요!'), 'gold');

    // 이미 완료 상태에서 재렌더해도 중복 알림하지 않는다
    rerender();
    expect(notify).toHaveBeenCalledTimes(1);
  });
});
