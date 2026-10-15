import type { ReactNode } from 'react';
import Panel from './Panel';

// 스테이지 모달 안의 카드 — 제목 패널(우상단 닫기 X) + 본문 + (선택) 확정 영역.
// 확정 영역(footer)은 본문 스크롤과 무관하게 항상 보이도록 윗선으로 가르고, 안에는 잔액 줄·사유처럼
// 확정 직전에 읽을 것을 두며 confirm(primary 전폭)이 맨 아래에 온다. 닫기는 X 하나뿐이다.
export default function ModalCard({ title, footer, confirm, onClose, children }: {
  title: string;
  /** 확정 직전 정보(잔액 줄·사유). 윗선으로 가른다 */
  footer?: ReactNode;
  /** 확정 버튼(primary) — 확정 영역 맨 아래, 전폭 */
  confirm?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Panel title={title} onClose={onClose} className="min-h-0">
      {children}
      {(footer || confirm) && (
        <div className="border-t border-line pt-2 flex flex-col gap-2 [&>button]:w-full">
          {footer}
          {confirm}
        </div>
      )}
    </Panel>
  );
}
