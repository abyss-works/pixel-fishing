import type { ReactNode, Ref } from 'react';
import { cx } from '../cx';
import { STACK_OMIT_CLASS } from './stackTier';

// HUD 수치 목록 — 알림 카드 안의 수치를 이름 왼쪽(보조색), 값 오른쪽(픽셀 액센트)으로 한 줄씩 쌓는다.
// 줄 사이에 옅은 구분선을 긋는다. 이름 자리에 툴팁을 단 글자를 둘 수 있다.
// omittable인 줄은 렌더링 역할이 생략이라 쌓기 단계(stackTier)에서 숨긴다. 숨겼는지는 omitRef로 읽는다(useOmitted).
export default function HudRows({ rows }: {
  rows: { key: string; label: ReactNode; value: ReactNode; omittable?: boolean; omitRef?: Ref<HTMLLIElement> }[];
}) {
  return (
    <ul className="m-0 p-0 list-none divide-y divide-line/60">
      {rows.map(r => (
        <li key={r.key} ref={r.omitRef} data-omittable={r.omittable ? '' : undefined}
            className={cx('flex items-center justify-between gap-2 h-[22px] text-xs', r.omittable && STACK_OMIT_CLASS)}>
          <span className="text-text-dim">{r.label}</span>
          <span className="pf-accent text-text">{r.value}</span>
        </li>
      ))}
    </ul>
  );
}
