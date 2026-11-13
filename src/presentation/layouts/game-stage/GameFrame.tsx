import type { CSSProperties, ReactNode } from 'react';
import { cx } from '../../ui/cx';
import { STACK_FRAME_FILL_CLASS } from '../../ui/hud/stackTier';
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
// 남는 위아래를 fill 색으로 채운다. PC 레이아웃도 스테이지 폭이 쌓기 단계(stackTier)이면 fill 프레임이 스테이지 전체로 넓어져 같은 배치가 된다.
// 한 행 단계에서는 프레임이 16:9이고 안쪽 그림 상자가 프레임과 같은 크기라 달라 보이지 않는다.
// overlay는 그림이 아니라 fill 프레임 전체(쌓기 단계와 모바일에서는 스테이지 영역) 위에 놓는 요소다.
export default function GameFrame({ children, fill, overlay }: {
  children: ReactNode;
  /** 그림 위아래 남는 자리를 채울 바탕색 */
  fill?: { top: string; bottom: string };
  /** fill과 함께 쓴다 - 프레임 전체를 기준으로 놓는 요소(거점 카드 메뉴) */
  overlay?: ReactNode;
}) {
  const mobile = useMobileLayout();
  if (fill) {
    const colors = { '--fill-top': fill.top, '--fill-bottom': fill.bottom } as CSSProperties;
    return (
      <div style={colors}
           className={cx(mobile
             ? 'absolute inset-0 row-start-2 row-end-3 bg-[linear-gradient(var(--fill-top)_50%,var(--fill-bottom)_50%)]'
             : cx('relative aspect-video w-[calc(var(--frame-h)*16/9)]', STACK_FRAME_FILL_CLASS))}>
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 aspect-video">{children}</div>
        {overlay}
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
