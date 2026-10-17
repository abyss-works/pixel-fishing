import type { ReactNode } from 'react';

// 요약 줄 — 이름(보조색) · 현재 값 · 오른쪽 동작. 고치는 일은 동작이 여는 창에서 한다.
// 구분선 틀(Frame divided) 안에 여러 줄을 쌓는다.
export default function KeyValueRow({ label, value, action }: { label: string; value: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 text-sm">
      <span className="text-text-dim shrink-0">{label}</span>
      <span className="truncate flex-1">{value}</span>
      {action}
    </div>
  );
}
