import type { ReactNode } from 'react';
import { cx } from './cx';
import Panel from './Panel';
import { SCROLL_Y } from './scrollArea';

// 스테이지 모달 안의 카드 — 제목 패널(우상단 닫기 X) + 본문 + (선택) 확정 영역.
// 창이 넘치면 스크롤하는 곳은 본문 한 칸이다(공용 스크롤 방식). 제목과 확정 영역(footer)은 스크롤과 무관하게 항상 보이고,
// 확정 영역은 윗선으로 가른다. 안에는 잔액 줄·사유처럼 확정 직전에 읽을 것을 두며 confirm(primary 전폭)이 맨 아래에 온다.
// 닫기는 X 하나뿐이다.
// 스크롤 칸은 공용 세로 스크롤 칸(SCROLL_Y)이고, 오른쪽만 카드 안쪽 여백(p-2) 8px 안으로 더 내어 막대가 카드 안쪽 가장자리에 놓인다.
// 본문 안 요소는 줄어들지 않고 넘치면 스크롤한다.
const SCROLL_BODY = `${SCROLL_Y} -mr-2 [&>*]:shrink-0`;

export default function ModalCard({ title, footer, confirm, onClose, fixed, className, children }: {
  title: string;
  /** 확정 직전 정보(잔액 줄·사유). 윗선으로 가른다 */
  footer?: ReactNode;
  /** 확정 버튼(primary) — 확정 영역 맨 아래, 전폭 */
  confirm?: ReactNode;
  /** 없으면 닫기 X를 그리지 않는다(끝날 때까지 닫을 수 없는 창) */
  onClose?: () => void;
  /** 높이가 고정된 창(탭 창) — 카드가 남은 높이를 채우고, 본문 안의 영역이 스스로 스크롤하므로 본문 칸은 스크롤하지 않는다 */
  fixed?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Panel title={title} onClose={onClose} className={cx('min-h-0', fixed && 'flex-1', className)}>
      <div className={cx('flex flex-col gap-2 flex-auto min-h-0', !fixed && SCROLL_BODY)}>
        {children}
      </div>
      {(footer || confirm) && (
        <div className="border-t border-line pt-2 flex flex-col gap-2 shrink-0 [&>button]:w-full">
          {footer}
          {confirm}
        </div>
      )}
    </Panel>
  );
}
