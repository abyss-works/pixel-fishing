import type { ReactNode } from 'react';
import Frame from './Frame';

// 확정 영역 바로 위의 "살 수 있나" 상자 — 잔액 줄(CostLine)과 불가 사유를 한 상자에 담는다.
// 상세 열의 맨 아래로 밀려 하단 확정 버튼 바로 위에서 읽힌다.
export default function CostBox({ children }: { children: ReactNode }) {
  return <Frame className="px-3 py-2 flex flex-col gap-1 mt-auto">{children}</Frame>;
}
