import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryProvider } from '../../../../core/QueryProvider';
import type { AdminNoticeRow } from '../../../../features/admin/model/types';

const mockApi = vi.hoisted(() => ({
  access: 'granted' as 'granted' | 'local',
  notices: [] as AdminNoticeRow[],
  writeNotice: vi.fn(),
  readNotices: vi.fn(),
}));

vi.mock('../../../../features/admin/service/accessContext', () => ({
  useAdminAuth: () => ({ access: mockApi.access }),
}));

vi.mock('../../../../features/admin/service/queries', () => ({
  readAdminNotices: () => mockApi.readNotices(),
  writeAdminNotice: (req: unknown) => mockApi.writeNotice(req),
}));

import NoticesTab from './NoticesTab';

const renderTab = () => render(<QueryProvider><NoticesTab /></QueryProvider>);

describe('NoticesTab', () => {
  const now = Date.parse('2026-11-26T12:00:00.000Z');

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(now);
    mockApi.access = 'granted';
    mockApi.notices = [];
    mockApi.readNotices.mockImplementation(async () => mockApi.notices);
    mockApi.writeNotice.mockImplementation(async () => ({ notice: mockApi.notices[0] }));
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('등록된 공지가 없으면 빈 상태 문구를 보인다', async () => {
    renderTab();
    expect(await screen.findByText('등록된 공지가 없어요.')).toBeInTheDocument();
  });

  it('공지 목록에서 활성·예약·마감 상태 배지와 본문 펼치기·즉시 마감·삭제 확인을 처리한다', async () => {
    mockApi.notices = [
      {
        id: 1,
        title: '진행 중 공지',
        body: '첫째 줄입니다.\n둘째 줄입니다.',
        startsAt: '2026-11-26T11:00:00.000Z',
        endsAt: '2026-11-26T14:00:00.000Z',
        createdAt: '2026-11-26T10:00:00.000Z',
        createdBy: 'admin-1',
        updatedAt: '2026-11-26T10:00:00.000Z',
      },
      {
        id: 2,
        title: '예정 공지',
        body: '곧 시작해요.',
        startsAt: '2026-11-26T15:00:00.000Z',
        endsAt: '2026-11-26T18:00:00.000Z',
        createdAt: '2026-11-26T10:00:00.000Z',
        createdBy: 'admin-1',
        updatedAt: '2026-11-26T10:00:00.000Z',
      },
      {
        id: 3,
        title: '종료 공지',
        body: '이미 끝났어요.',
        startsAt: '2026-11-26T08:00:00.000Z',
        endsAt: '2026-11-26T10:00:00.000Z',
        createdAt: '2026-11-26T07:00:00.000Z',
        createdBy: 'admin-1',
        updatedAt: '2026-11-26T07:00:00.000Z',
      },
    ];

    renderTab();
    expect(await screen.findByText('진행 중 공지')).toBeInTheDocument();
    expect(screen.getByText('활성')).toBeInTheDocument();
    expect(screen.getByText('예약')).toBeInTheDocument();
    expect(screen.getByText('마감')).toBeInTheDocument();

    // 여러 줄 본문 펼치기/접기
    expect(screen.queryByText(/둘째 줄입니다/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '펼치기' }));
    expect(screen.getByText(/둘째 줄입니다/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '접기' }));
    expect(screen.queryByText(/둘째 줄입니다/)).toBeNull();

    // 즉시 마감은 클라이언트 시계 오차를 감안해 마감 표시 행을 포함한 모든 행에 노출된다
    const endButtons = screen.getAllByRole('button', { name: '즉시 마감' });
    expect(endButtons).toHaveLength(3);
    fireEvent.click(endButtons[0]);
    const endDialog = await screen.findByRole('dialog', { name: '공지 즉시 마감' });
    fireEvent.click(within(endDialog).getByRole('button', { name: '즉시 마감' }));
    await waitFor(() => expect(mockApi.writeNotice).toHaveBeenCalledWith({ op: 'end', id: 1 }));

    // 삭제 확인 창
    const deleteButtons = screen.getAllByRole('button', { name: '삭제' });
    fireEvent.click(deleteButtons[2]);
    const deleteDialog = await screen.findByRole('dialog', { name: '공지 삭제' });
    fireEvent.click(within(deleteDialog).getByRole('button', { name: '삭제' }));
    await waitFor(() => expect(mockApi.writeNotice).toHaveBeenCalledWith({ op: 'delete', id: 3 }));
  });

  it('새 공지 등록 버튼을 눌러야 작성 폼이 열리고, 입력값을 검증하고 등록 요청을 보낸다', async () => {
    renderTab();
    await screen.findByText('등록된 공지가 없어요.');
    expect(screen.queryByLabelText(/^제목/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '새 공지 등록' }));
    fireEvent.click(screen.getByRole('button', { name: '공지 등록' }));
    expect(screen.getByText(/제목은 1자 이상/)).toBeInTheDocument();
    expect(mockApi.writeNotice).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/^제목/), { target: { value: '서버 점검' } });
    fireEvent.change(screen.getByLabelText(/^본문/), { target: { value: '내일 오전 점검합니다.' } });
    fireEvent.change(screen.getByLabelText(/^시작 시각/), { target: { value: '2026-11-26T21:00' } });
    fireEvent.change(screen.getByLabelText(/^마감 시각/), { target: { value: '2026-11-26T22:00' } });

    fireEvent.click(screen.getByRole('button', { name: '공지 등록' }));
    await waitFor(() => expect(mockApi.writeNotice).toHaveBeenCalledWith({
      op: 'create',
      title: '서버 점검',
      body: '내일 오전 점검합니다.',
      startsAt: new Date('2026-11-26T21:00').toISOString(),
      endsAt: new Date('2026-11-26T22:00').toISOString(),
    }));
    expect(await screen.findByText('새 공지를 등록했어요.')).toBeInTheDocument();
  });
});
