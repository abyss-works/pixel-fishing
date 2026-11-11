import type { ReactNode } from 'react';
import { useMobileLayout } from '../../../layouts/useMobileLayout';
import ModalCard from '../../../ui/ModalCard';
import { FacilityColumns } from './facilityParts';

// 목록형 시설(낚싯대 강화, 조선소, 상점)의 창 골격. 왼쪽은 목록, 오른쪽은 고른 것의 상세와 확정 영역(잔액, 확정 버튼)이다.
// 확정 영역은 폭에 따라 자리를 바꾼다. 두 열일 때(PC 레이아웃)는 오른쪽 열 맨 아래에 고정하고 두 열의 본문이 각자 스크롤한다.
// 한 열로 쌓일 때(모바일 레이아웃)는 카드 하단 고정 자리(footer, confirm)로 가고 카드 본문 한 칸이 스크롤한다.
// 어느 쪽이든 확정 버튼은 스크롤 칸 밖에 있다.
export default function FacilityCard({ title, onClose, list, detail, summary, confirm }: {
  title: string;
  onClose: () => void;
  /** 왼쪽 목록 */
  list: ReactNode;
  /** 오른쪽 상세 본문(머리, 비교 표 등) */
  detail: ReactNode;
  /** 확정 직전에 읽을 잔액 칸 */
  summary: ReactNode;
  /** 확정 버튼 */
  confirm: ReactNode;
}) {
  const mobile = useMobileLayout();
  if (mobile) {
    return (
      <ModalCard title={title} onClose={onClose} footer={summary} confirm={confirm}>
        <div className="flex flex-col gap-4">
          {list}
          <div className="flex flex-col gap-3 min-w-0">{detail}</div>
        </div>
      </ModalCard>
    );
  }
  return (
    <ModalCard title={title} onClose={onClose} fixed>
      <FacilityColumns list={list} detail={detail} foot={<>{summary}{confirm}</>} />
    </ModalCard>
  );
}
