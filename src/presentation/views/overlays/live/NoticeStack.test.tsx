import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NoticeItem } from '../../../../game/rules/live';
import NoticeModal from './NoticeModal';
import NoticeStack from './NoticeStack';

const sample = (id: number): NoticeItem => ({
  id,
  title: `공지 제목 ${id}`,
  body: `공지 본문 ${id}`,
  startsAt: '2026-11-26T10:00:00.000Z',
  endsAt: '2026-11-27T10:00:00.000Z',
  createdAt: '2026-11-26T10:00:00.000Z',
});

describe('NoticeStack & NoticeModal', () => {
  afterEach(cleanup);

  it('NoticeStack은 0건이면 아무것도 그리지 않는다', () => {
    const { container } = render(<NoticeStack notices={[]} onDismiss={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('NoticeStack은 2건 이상일 때 1 / N 카운터와 뒤 카드 가장자리를 보이고, 닫기 버튼으로 맨 앞 공지를 닫는다', () => {
    const onDismiss = vi.fn();
    const { container } = render(<NoticeStack notices={[sample(2), sample(1)]} onDismiss={onDismiss} />);
    expect(screen.getByText('공지 제목 2')).toBeInTheDocument();
    expect(screen.getByText('공지 본문 2')).toBeInTheDocument();
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
    expect(container.querySelector('.border-x.border-b')).not.toBeNull();
    expect(container.firstElementChild).toHaveClass('absolute', 'z-(--z-toast)', 'pointer-events-none');

    fireEvent.click(screen.getByRole('button', { name: '공지 닫기' }));
    expect(onDismiss).toHaveBeenCalledWith(2);
  });

  it('NoticeModal은 공지가 없을 때 빈 안내 문구를 보이고, 있으면 단일 목록으로 보여 준다', () => {
    const { rerender } = render(<NoticeModal open notices={[]} onClose={() => {}} />);
    expect(screen.getByRole('dialog', { name: '공지사항' })).toBeInTheDocument();
    expect(screen.getByText('지금 올라온 공지사항이 없어요.')).toBeInTheDocument();

    rerender(<NoticeModal open notices={[sample(3), sample(1)]} onClose={() => {}} />);
    expect(screen.getByText('공지 제목 3')).toBeInTheDocument();
    expect(screen.getByText('공지 본문 3')).toBeInTheDocument();
    expect(screen.getByText('공지 제목 1')).toBeInTheDocument();
  });
});
