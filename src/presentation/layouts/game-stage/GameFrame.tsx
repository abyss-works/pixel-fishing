import type { ReactNode } from 'react';
import { useMobileLayout } from '../useMobileLayout';

// 게임 프레임 — 16:9 캔버스 영역. **positioned(relative)**라 이 안의 오버레이는 프레임에 붙는다.
//
// 오버레이 기준이 둘이라 DOM으로 가른다:
//   프레임 기준 (여기 children)  — 낚시 안내, 획득 카드. 게임 그림 위에 얹혀야 하는 것.
//   스테이지 기준 (프레임의 형제) — 자원 바, 로그, 미니맵. 레터박스까지 포함한 화면 코너에 붙는 것.
//
// 크기는 프레임이 결정하고 캔버스는 100% 채우기만 한다. 비율에서 높이를 파생하므로 왜곡·
// 레터박스가 원천적으로 없고 클릭 좌표 변환이 단순 비례로 성립한다.
//
// 모바일 레이아웃에서는 필드 프레임이 스테이지 격자의 게임 영역(2행)을 채운다(필드 시야가 게임 영역 비율로 정해진다).
// 거점처럼 16:9 그림을 쓰는 장면은 fill을 주어, 그림을 스테이지 폭에 맞춰 세로 가운데에 두고
// 남는 위아래를 fill 색으로 채운다.
export default function GameFrame({ children, fill }: {
  children: ReactNode;
  /** 모바일 레이아웃에서 그림 위아래 남는 자리를 채울 바탕색 */
  fill?: { top: string; bottom: string };
}) {
  const mobile = useMobileLayout();
  if (mobile && fill) {
    return (
      <div className="absolute inset-0 row-start-2 row-end-3" style={{ background: `linear-gradient(${fill.top} 50%, ${fill.bottom} 50%)` }}>
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 aspect-video">{children}</div>
      </div>
    );
  }
  if (mobile) return <div className="absolute inset-0 row-start-2 row-end-3">{children}</div>;
  return (
    <div className="relative aspect-video w-[calc(var(--frame-h)*16/9)]">
      {children}
    </div>
  );
}
