import { useEffect, useRef } from 'react';
import type { ReactNode, RefObject } from 'react';
import Frame from './Frame';
import { useKeyScope } from './hotkeys';

// 팝오버 — 버튼에 붙어 뜨는 작은 칸. 창이 아니다(`UI-UX.md` 화면 깊이 규칙의 팝오버 예외).
// 제목 줄과 바탕 덮개가 없고, 연 버튼 곁에 붙으며, 바깥을 누르거나 Esc를 누르면 닫힌다.
// 창 안의 한 동작에 딸린 설정처럼 작은 선택만 담는다.
// 자리: 가까운 position 조상의 위쪽에 그 조상 폭만큼 붙는다. 호출부가 연 버튼과 함께 relative 칸에 둔다.
// 닫기: Esc는 이 칸이 열려 있는 동안 키 스코프의 맨 위라 창보다 먼저 받고, 받으면 창으로 내려가지 않는다.
// 바깥 누르기는 연 버튼을 바깥으로 치지 않는다. 연 버튼은 스스로 열고 닫는다.
export default function Popover({ open, onClose, anchorRef, label, children }: {
  open: boolean;
  onClose: () => void;
  /** 연 버튼 */
  anchorRef: RefObject<HTMLElement | null>;
  /** 칸의 접근성 이름 */
  label: string;
  children: ReactNode;
}) {
  return open ? <PopoverBody onClose={onClose} anchorRef={anchorRef} label={label}>{children}</PopoverBody> : null;
}

// 열린 동안만 마운트하므로 키 스코프가 창 스코프 위에 쌓인다
function PopoverBody({ onClose, anchorRef, label, children }: {
  onClose: () => void; anchorRef: RefObject<HTMLElement | null>; label: string; children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; });

  useKeyScope(e => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    closeRef.current();
    anchorRef.current?.focus();
    return true;
  });

  useEffect(() => {
    const onDown = (e: Event) => {
      const target = e.target as Node;
      if (ref.current?.contains(target) || anchorRef.current?.contains(target)) return;
      closeRef.current();
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [anchorRef]);

  return (
    <div ref={ref} role="group" aria-label={label}
         className="absolute inset-x-0 bottom-[calc(100%+6px)] z-1 [filter:drop-shadow(0_6px_24px_rgba(0,0,0,0.45))]">
      <Frame className="p-3 flex flex-col gap-2">{children}</Frame>
    </div>
  );
}
