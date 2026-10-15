import type { ReactNode } from 'react';
import Panel from './Panel';
import Button from './Button';

// 스테이지 모달 안의 카드 — 제목 패널 + 본문 + (선택) 확정 영역 + 버튼행.
// 확정 영역(footer)은 본문 스크롤과 무관하게 항상 보이도록 윗선으로 가르고, 안에는 잔액 줄·사유처럼
// 확정 직전에 읽을 것을 둔다. 버튼행은 confirm이 있으면 [닫기][확정 ———] 한 줄, 없으면 닫기 전폭.
// 닫기는 ghost가 아닌 기본 버튼 — 테두리 없는 닫기는 버튼인지 안 보인다(사용자 피드백).
export default function ModalCard({ title, footer, confirm, onClose, children }: {
  title: string;
  /** 확정 직전 정보(잔액 줄·사유). 윗선으로 가른다 */
  footer?: ReactNode;
  /** 확정 버튼(primary) — 닫기와 한 줄에 놓이며 남는 폭을 채운다 */
  confirm?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Panel title={title} className="min-h-0">
      {children}
      <div className={footer || confirm ? 'border-t border-line pt-2 flex flex-col gap-2' : 'contents'}>
        {footer}
        {confirm ? (
          <div className="flex gap-2">
            <Button onClick={onClose}>닫기</Button>
            <div className="flex-1 min-w-0 [&>button]:w-full">{confirm}</div>
          </div>
        ) : (
          <Button onClick={onClose}>닫기</Button>
        )}
      </div>
    </Panel>
  );
}
