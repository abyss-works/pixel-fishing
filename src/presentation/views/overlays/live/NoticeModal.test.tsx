import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { NoticeItem } from '../../../../game/rules/live';
import NoticeModal from './NoticeModal';

const item = (id: number, overrides: Partial<NoticeItem> = {}): NoticeItem => ({
  id,
  title: `공지 제목 ${id}`,
  body: `공지 본문 ${id}`,
  startsAt: '2026-11-26T01:00:00.000Z', // 11월 26일 10:00 KST
  endsAt: '2026-11-26T05:00:00.000Z',   // 11월 26일 14:00 KST
  createdAt: '2026-11-26T00:00:00.000Z',
  ...overrides,
});

describe('NoticeModal', () => {
  afterEach(cleanup);

  it('열리면 현재 공지와 지난 공지 인라인 서브탭과 건수를 보이고 탭 전환 시 해당 목록을 보여 준다', () => {
    render(
      <NoticeModal
        open
        activeNotices={[item(1), item(2)]}
        endedNotices={[item(3)]}
        onClose={() => {}}
      />,
    );

    const dialog = screen.getByRole('dialog', { name: '공지사항' });
    expect(dialog).toBeInTheDocument();

    const activeTab = screen.getByRole('button', { name: /현재 공지/ });
    const endedTab = screen.getByRole('button', { name: /지난 공지/ });
    expect(activeTab).toHaveTextContent('2');
    expect(endedTab).toHaveTextContent('1');

    // 기본은 현재 공지
    expect(screen.getByText('공지 제목 1')).toBeInTheDocument();
    expect(screen.getByText('공지 제목 2')).toBeInTheDocument();
    expect(screen.queryByText('공지 제목 3')).not.toBeInTheDocument();

    fireEvent.click(endedTab);
    expect(screen.getByText('공지 제목 3')).toBeInTheDocument();
    expect(screen.queryByText('공지 제목 1')).not.toBeInTheDocument();
  });

  it('한국 시간(Asia/Seoul) 기준으로 같은 날·다른 날 기간을 금지 부호 없이 표기한다', () => {
    const sameDayKst = item(10, {
      startsAt: '2026-11-26T01:00:00.000Z', // 11월 26일 10:00 KST
      endsAt: '2026-11-26T04:30:00.000Z',   // 11월 26일 13:30 KST
    });
    const crossDayKst = item(11, {
      // UTC로는 같은 11월 26일이지만 KST에서는 26일 23:00 ~ 27일 01:00
      startsAt: '2026-11-26T14:00:00.000Z', // 11월 26일 23:00 KST
      endsAt: '2026-11-26T16:00:00.000Z',   // 11월 27일 01:00 KST
    });

    render(
      <NoticeModal
        open
        activeNotices={[sameDayKst, crossDayKst]}
        endedNotices={[]}
        onClose={() => {}}
      />,
    );

    expect(screen.getByText('11월 26일 10:00 - 13:30')).toBeInTheDocument();
    expect(screen.getByText('11월 26일 23:00 - 11월 27일 01:00')).toBeInTheDocument();
  });

  it('현재 공지와 지난 공지 유무에 따라 3가지 빈 상태 안내 문구를 구분한다', () => {
    const { rerender } = render(
      <NoticeModal open activeNotices={[]} endedNotices={[item(9)]} onClose={() => {}} />,
    );
    expect(screen.getByText(/지금 진행 중인 공지가 없어요\./)).toBeInTheDocument();
    expect(screen.getByText(/지난 공지 탭에서 이전 공지를 확인해 보세요\./)).toBeInTheDocument();

    rerender(<NoticeModal open activeNotices={[]} endedNotices={[]} onClose={() => {}} />);
    expect(screen.getByText('지금 올라온 공지사항이 없어요.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /지난 공지/ }));
    expect(screen.getByText('아직 지난 공지가 없어요.')).toBeInTheDocument();
  });

  it('지난 공지 탭을 본 뒤 창을 닫고 다시 열면 기본 탭(현재 공지)으로 되돌린다', () => {
    const props = {
      activeNotices: [item(1)],
      endedNotices: [item(2)],
      onClose: () => {},
    };
    const { rerender } = render(<NoticeModal open {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /지난 공지/ }));
    expect(screen.getByText('공지 제목 2')).toBeInTheDocument();

    rerender(<NoticeModal open={false} {...props} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    rerender(<NoticeModal open {...props} />);
    expect(screen.getByText('공지 제목 1')).toBeInTheDocument();
    expect(screen.queryByText('공지 제목 2')).not.toBeInTheDocument();
  });

  it('공지 본문의 마크다운 서식을 안전하게 렌더링한다', () => {
    render(
      <NoticeModal
        open
        activeNotices={[item(20, { body: '**중요** 쿠폰 `SUMMER2026`\n- 항목 1' })]}
        endedNotices={[]}
        onClose={() => {}}
      />,
    );

    expect(screen.getByText('중요').tagName).toBe('STRONG');
    expect(screen.getByText('SUMMER2026').tagName).toBe('CODE');
    expect(screen.getByText('항목 1').tagName).toBe('LI');
  });
});
