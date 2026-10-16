import type { ReactNode } from 'react';

// 조건 게이트 — 닫혀 있으면 본문을 흐리게 하고 누를 수 없게 한 뒤, 이유(조건 목록·안내)를 위에 덮는다.
// 버튼은 가려서 못 누른다 — 우회 방지는 서버 판정이 맡는다. 수배판 라이선스·개발 도구 운영 제한이 쓴다.
export default function Gated({ open, overlay, children }: {
  open: boolean;
  /** 닫혔을 때 덮는 내용 — 조건 목록이나 안내 문장 */
  overlay: ReactNode;
  children: ReactNode;
}) {
  if (open) return <>{children}</>;
  return (
    <div className="relative">
      <div className="blur-sm pointer-events-none select-none" aria-hidden>{children}</div>
      <div className="absolute inset-0 flex items-center justify-center p-2">
        <div className="bg-surface border border-line rounded-sm p-2 text-sm">{overlay}</div>
      </div>
    </div>
  );
}
