import type { ReactNode } from 'react';

// HUD 수치 목록 — 알림 카드 안의 수치를 이름 왼쪽(보조색), 값 오른쪽(픽셀 액센트)으로 한 줄씩 쌓는다.
// 줄 사이에 옅은 구분선을 긋는다. 이름 자리에 툴팁을 단 글자를 둘 수 있다.
export default function HudRows({ rows }: { rows: { key: string; label: ReactNode; value: ReactNode }[] }) {
  return (
    <ul className="m-0 p-0 list-none divide-y divide-line/60">
      {rows.map(r => (
        <li key={r.key} className="flex items-center justify-between gap-2 h-[22px] text-xs">
          <span className="text-text-dim">{r.label}</span>
          <span className="pf-accent text-text">{r.value}</span>
        </li>
      ))}
    </ul>
  );
}
