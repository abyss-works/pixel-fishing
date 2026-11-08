import type { ReactNode } from 'react';
import Inset from './Inset';

// 확정 버튼 바로 위의 "살 수 있나" 칸 — 잔액 줄(CostLine)과 합계처럼 확정 직전에 읽을 줄을 오목한 칸 하나에 담는다.
// 카드의 확정 직전 자리(footer)에 담겨 확정 버튼 바로 위에서 읽힌다.
export default function CostBox({ children }: { children: ReactNode }) {
  return <Inset className="px-3 py-2.5 flex flex-col gap-1">{children}</Inset>;
}
