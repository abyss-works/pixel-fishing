// 팝오버 — 버튼에 붙어 뜨는 작은 칸. 창이 아니다: 제목 줄과 바탕 덮개가 없고, 바깥 누르기와 Esc로 팝오버만 닫힌다.
import { useRef, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import Modal from './Modal';
import Popover from './Popover';
import { resetKeyScopes } from './hotkeys';

afterEach(() => { cleanup(); resetKeyScopes(); });

function Host({ onModalClose = () => {} }: { onModalClose?: () => void }) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  return (
    <Modal layer="stage" onClose={onModalClose}>
      <div className="relative">
        <button type="button" ref={anchorRef} onClick={() => setOpen(o => !o)}>설정</button>
        <Popover open={open} onClose={() => setOpen(false)} anchorRef={anchorRef} label="설정 칸">
          <button type="button">안의 버튼</button>
        </Popover>
      </div>
      <p>창 본문</p>
    </Modal>
  );
}

describe('팝오버', () => {
  it('닫혀 있으면 그리지 않고, 열리면 이름 붙은 묶음으로 내용을 그린다', () => {
    render(<Host />);
    expect(screen.queryByRole('group', { name: '설정 칸' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '설정' }));
    expect(screen.getByRole('group', { name: '설정 칸' })).toContainElement(screen.getByRole('button', { name: '안의 버튼' }));
  });

  it('창이 아니다: 대화상자 역할과 바탕 덮개를 만들지 않는다', () => {
    render(<Host />);
    fireEvent.click(screen.getByRole('button', { name: '설정' }));
    expect(screen.getAllByRole('dialog')).toHaveLength(1); // 호스트 창 하나뿐
  });

  it('Esc는 팝오버만 닫고 창은 그대로 둔다', () => {
    const onModalClose = vi.fn();
    render(<Host onModalClose={onModalClose} />);
    fireEvent.click(screen.getByRole('button', { name: '설정' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('group', { name: '설정 칸' })).toBeNull();
    expect(onModalClose).not.toHaveBeenCalled();
    // 팝오버가 닫힌 뒤의 Esc는 창을 닫는다
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onModalClose).toHaveBeenCalledTimes(1);
  });

  it('Esc로 닫으면 포커스가 연 버튼으로 돌아간다', () => {
    render(<Host />);
    const anchor = screen.getByRole('button', { name: '설정' });
    fireEvent.click(anchor);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(anchor).toHaveFocus();
  });

  it('바깥을 누르면 닫히고, 안쪽과 연 버튼을 누르면 닫히지 않는다', () => {
    render(<Host />);
    const anchor = screen.getByRole('button', { name: '설정' });
    fireEvent.click(anchor);
    fireEvent.pointerDown(screen.getByRole('button', { name: '안의 버튼' }));
    expect(screen.getByRole('group', { name: '설정 칸' })).toBeInTheDocument();
    fireEvent.pointerDown(anchor);
    expect(screen.getByRole('group', { name: '설정 칸' })).toBeInTheDocument();
    fireEvent.pointerDown(screen.getByText('창 본문'));
    expect(screen.queryByRole('group', { name: '설정 칸' })).toBeNull();
  });

  it('연 버튼을 다시 누르면 닫힌다', () => {
    render(<Host />);
    const anchor = screen.getByRole('button', { name: '설정' });
    fireEvent.click(anchor);
    fireEvent.pointerDown(anchor);
    fireEvent.click(anchor);
    expect(screen.queryByRole('group', { name: '설정 칸' })).toBeNull();
  });
});
