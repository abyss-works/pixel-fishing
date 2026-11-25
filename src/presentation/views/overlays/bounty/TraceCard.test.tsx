import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { BountySnapshot } from '../../../../features/bounty/model/types';
import TraceCard from './TraceCard';

const mockState = vi.hoisted(() => ({
  snap: null as BountySnapshot | null,
  zone: 'pacific' as string | null,
}));

vi.mock('../../../../features/bounty/service/useBounty', () => ({
  useBounty: () => ({ snap: mockState.snap }),
}));
vi.mock('../../../../features/travel/service/useSpotState', () => ({
  useSpotState: () => ({ zone: mockState.zone }),
}));
vi.mock('../../../../features/gameplay/service/useGameTime', () => ({
  useNow: () => '2026-11-25T10:10:00.000Z',
}));

afterEach(cleanup);

describe('TraceCard', () => {
  const issuedAt = '2026-11-25T10:00:00.000Z';

  it('의뢰 구역에 있으면 바깥 카드에 로어 문장을 두지 않고 남은 시간과 추적 버튼만 보인다', () => {
    mockState.zone = 'pacific';
    mockState.snap = {
      clearsToday: { general: 0, named: 0 },
      progress: [],
      tickets: [{ questId: 'pacific-named-megalodon', issuedAt }],
    };
    const onTrack = vi.fn();
    render(<TraceCard onTrack={onTrack} />);
    expect(screen.getByText('남은 시간')).toBeInTheDocument();
    expect(screen.queryByText(/등지느러미|고대의|그림자|이빨/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '추적' }));
    expect(onTrack).toHaveBeenCalledWith('pacific-named-megalodon');
  });

  it('다른 구역에 있으면 남은 시간 라벨 툴팁에 숨기지 않고 추적 가능 구역 조건을 본문에 바로 보인다', () => {
    mockState.zone = 'indian';
    mockState.snap = {
      clearsToday: { general: 0, named: 0 },
      progress: [],
      tickets: [{ questId: 'pacific-named-megalodon', issuedAt }],
    };
    render(<TraceCard onTrack={vi.fn()} />);
    fireEvent.mouseEnter(screen.getByText('남은 시간'));
    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(screen.getByText('태평양에서 추적할 수 있어요.')).toBeInTheDocument();
  });
});
