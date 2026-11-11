import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import PixelIcon from './PixelIcon';
import Tip from './Tip';

/** 잠금 툴팁 내용 - 잠금 줄마다 따로 보인다 */
export function LockLines({ lines }: { lines: readonly string[] }) {
  return <>{lines.map((line, i) => <span key={`${i}-${line}`} className="block">{line}</span>)}</>;
}

/** 잠금 표시의 자물쇠 */
export function LockIcon({ size = 12, className }: { size?: number; className?: string }) {
  return <PixelIcon glyph="lock" size={size} className={className ? `text-text ${className}` : 'text-text'} />;
}

/** 자물쇠를 잠긴 요소의 오른쪽 위 모서리에 붙인다. 붙는 요소는 relative여야 한다.
 *  outside면 자물쇠 중심을 모서리에 두어 요소 안의 글자를 가리지 않는다(자리를 차지하지 않는다) */
export function LockBadge({ size = 12, outside = false }: { size?: number; outside?: boolean }) {
  return <LockIcon size={size} className={outside ? 'absolute -top-1.5 -right-1.5' : 'absolute top-1 right-1'} />;
}

// 잠금 요소 - 아직 쓸 수 없는 기능을 자리 그대로 흐리게 두고 자물쇠를 붙인다. 마우스를 올리거나 포커스하거나 누르면
// 공용 툴팁으로 잠금 줄을 보이고, 감싼 요소는 입력을 받지 않는다. 기능이 실행되거나 창이 열리지 않는다.
// 감싼 요소는 호출부가 비활성(disabled)으로 그리고 동작을 연결하지 않는다. 비활성 요소는 포커스를 받지 못하므로
// 키보드는 이 요소가 대신 받는다. 게스트 잠금과 진행 조건 잠금이 같은 구조를 쓴다.
// 툴팁 자리가 되는 바깥 칸의 배치는 className으로, 메뉴 줄 안에서는 role="menuitem"으로 쓴다.
// 자물쇠는 오른쪽 위 모서리에 붙는다. 줄 안에 자기 자리가 있는 요소(메뉴 줄)는 badge를 끄고 LockIcon을 그 자리에 둔다.
export default function Locked({ lines, role = 'group', label, badge = true, hoverAfterMove = false, className, children }: {
  /** 잠금 안내 줄들 */
  lines: readonly string[];
  /** 접근성 역할. 메뉴 항목 자리에서는 menuitem */
  role?: 'group' | 'menuitem';
  /** 접근성 이름 - 감싼 요소가 이름을 대신 줄 수 없을 때 */
  label?: string;
  /** 모서리 자물쇠를 붙인다. 기본은 붙인다 */
  badge?: boolean;
  /** 마운트 뒤 사용자 입력(마우스 이동, 누름, 키)이 있기 전에는 툴팁을 열지 않는다. 사용자 동작으로 요소가 커서 아래에 나타나는 자리에 쓴다 */
  hoverAfterMove?: boolean;
  /** 바깥 칸(툴팁이 기준으로 삼는 칸)의 배치 */
  className?: string;
  children: ReactNode;
}) {
  const reasonId = useId();
  const armed = useRef(!hoverAfterMove);
  useEffect(() => {
    if (!hoverAfterMove) return;
    const arm = () => { armed.current = true; };
    const events = ['mousemove', 'pointerdown', 'touchstart', 'keydown'] as const;
    for (const e of events) document.addEventListener(e, arm, { capture: true, once: true });
    return () => { for (const e of events) document.removeEventListener(e, arm, { capture: true }); };
  }, [hoverAfterMove]);
  return (
    <Tip wraps pressOpens onlyIf={hoverAfterMove ? () => armed.current : undefined} className={className ?? 'block'} text={<LockLines lines={lines} />}>
      <span role={role} tabIndex={0} aria-label={label} aria-disabled={role === 'menuitem' ? true : undefined}
            aria-describedby={reasonId}
            className="relative block w-full min-w-0 cursor-not-allowed focus-visible:outline-1 focus-visible:outline-gold">
        <span className="block w-full min-w-0 opacity-55 pointer-events-none">{children}</span>
        {badge && <LockBadge outside />}
        <span id={reasonId} className="sr-only">{lines.join(' ')}</span>
      </span>
    </Tip>
  );
}
