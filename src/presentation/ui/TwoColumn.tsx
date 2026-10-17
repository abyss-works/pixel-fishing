import type { ReactNode } from 'react';

// 2열 상세 골격 — 좌: 목록·진행 사다리 · 우: 고른 것의 상세. 넓은 모달(xl) 전용.
// 두 열은 같은 폭이고 높이를 맞춘다. 정비 패널(낚싯대·조선소)과 상점이 쓴다.
export default function TwoColumn({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4 items-stretch">{children}</div>;
}
