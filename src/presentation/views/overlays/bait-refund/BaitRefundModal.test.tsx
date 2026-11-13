import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { COOKING_UNLOCK_BOAT } from '../../../../game/content/cooking';
import { baitRefundNotice } from '../../../../features/inventory/model/baitRefund';
import BaitRefundModal from './BaitRefundModal';

afterEach(cleanup);

const receipt = { gold: 1200, items: { 'bait-common': 2, 'bait-epic': 1 } };

describe('미끼 환불 안내 창', () => {
  it('제목과 안내 줄, 미끼별 개수와 환불 골드를 보인다', () => {
    const notice = baitRefundNotice(receipt, COOKING_UNLOCK_BOAT - 1)!;
    render(<BaitRefundModal notice={notice} onClose={() => {}} />);
    expect(screen.getByText('미끼 환불')).toBeInTheDocument();
    for (const line of notice.lines) expect(screen.getByText(line)).toBeInTheDocument();
    const list = screen.getByLabelText('환불 내역');
    expect(within(list).getByText('미끼(일반)').nextElementSibling).toHaveTextContent('2개');
    expect(within(list).getByText('미끼(영웅)').nextElementSibling).toHaveTextContent('1개');
    expect(within(list).getByText('환불 골드').nextElementSibling).toHaveTextContent('1,200G');
  });

  it('값은 줄 오른쪽 끝에 붙는다', () => {
    render(<BaitRefundModal notice={baitRefundNotice(receipt, COOKING_UNLOCK_BOAT)!} onClose={() => {}} />);
    expect(screen.getByText('2개')).toHaveClass('text-right');
  });

  it('확인 버튼으로 닫는다', () => {
    const onClose = vi.fn();
    render(<BaitRefundModal notice={baitRefundNotice(receipt, COOKING_UNLOCK_BOAT)!} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: '확인' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('화면에 가운뎃점과 대시를 쓰지 않는다', () => {
    render(<BaitRefundModal notice={baitRefundNotice(receipt, COOKING_UNLOCK_BOAT - 1)!} onClose={() => {}} />);
    expect(document.body.textContent).not.toMatch(/[·—–]/);
  });
});
