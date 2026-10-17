import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import MessageLog from './MessageLog';
import { MESSAGE_PREVIEW, createMessage } from './messageFeed';

const logOf = (n: number) => Array.from({ length: n }, (_, i) => createMessage(i, `메시지 ${i}`));

describe('메시지 창', () => {
  afterEach(cleanup);

  it('접힌 창은 최근 몇 줄만 보인다', () => {
    render(<MessageLog log={logOf(20)} />);
    expect(screen.getByText('메시지 19', { exact: false })).toBeInTheDocument();
    expect(screen.queryByText(`메시지 ${19 - MESSAGE_PREVIEW}`, { exact: false })).not.toBeInTheDocument();
  });

  it('펼치면 보관된 기록 전체를 스크롤 목록으로 보이고, 닫으면 다시 접힌다', () => {
    render(<MessageLog log={logOf(20)} />);
    fireEvent.click(screen.getByLabelText('메시지 기록 펼치기'));
    const list = screen.getByRole('log', { name: '메시지 기록' });
    expect(list.children).toHaveLength(20);
    fireEvent.click(screen.getByLabelText('닫기'));
    expect(screen.queryByRole('log')).not.toBeInTheDocument();
  });

  it('채널이 하나면 채널 탭을 그리지 않는다', () => {
    render(<MessageLog log={logOf(3)} />);
    fireEvent.click(screen.getByLabelText('메시지 기록 펼치기'));
    expect(screen.queryByRole('button', { name: '시스템' })).not.toBeInTheDocument();
  });
});
