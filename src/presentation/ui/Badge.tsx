import type { ReactNode } from 'react';

// 꼬리표 — 작은 테두리 칩. 단계·해금·보유·할인처럼 머리글 아래에 붙는 짧은 사실 하나.
export default function Badge({ children }: { children: ReactNode }) {
  return <span className="text-xs px-1.5 py-0.5 rounded-sm border border-line text-text-dim">{children}</span>;
}
