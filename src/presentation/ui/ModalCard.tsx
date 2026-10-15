import type { ReactNode } from 'react';
import Panel from './Panel';
import Button from './Button';

// 스테이지 모달 안의 카드 — 제목 패널 + 본문 + (선택) 확정 영역 + 닫기.
// 확정 영역(footer)은 본문 스크롤과 무관하게 항상 보이도록 윗선으로 가르고, 안에는
// 잔액 줄(CostLine)·사유 Note·확정 버튼(primary full) 순으로 둔다 — 정비 패널 공통 골격.
// 닫기는 ghost가 아닌 기본 버튼 — 테두리 없는 닫기는 버튼인지 안 보인다(사용자 피드백).
export default function ModalCard({ title, footer, onClose, children }: {
  title: string; footer?: ReactNode; onClose: () => void; children: ReactNode;
}) {
  return (
    <Panel title={title} className="min-h-0">
      {children}
      {footer && <div className="border-t border-line pt-2 flex flex-col gap-2">{footer}</div>}
      <Button onClick={onClose}>닫기</Button>
    </Panel>
  );
}
