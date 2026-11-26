import type { ReactNode } from 'react';

// 버튼 행 - 창 카드의 확정 영역(ModalCard confirm)에서 버튼 둘 이상을 한 줄에 둔다.
// 카드는 confirm 바로 아래의 버튼만 전폭으로 늘리므로, 행으로 감싼 버튼은 제 크기를 지키고 오른쪽에 모인다.
// 보조 버튼을 앞에, 확정 버튼을 뒤에 둔다.
export default function ButtonRow({ children }: { children: ReactNode }) {
  return <div className="flex justify-end gap-2">{children}</div>;
}
