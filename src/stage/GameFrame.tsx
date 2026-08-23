import type { ReactNode } from 'react';

// 게임 프레임 — 16:9 캔버스 영역. **positioned(relative)**라 이 안의 오버레이는 프레임에 붙는다.
//
// 오버레이 기준이 둘이라 DOM으로 가른다:
//   프레임 기준 (여기 children)  — 낚시 안내, 획득 카드. 게임 그림 위에 얹혀야 하는 것.
//   스테이지 기준 (프레임의 형제) — 자원 바, 로그, 미니맵. 레터박스까지 포함한 화면 코너에 붙는 것.
//
// 크기는 프레임이 결정하고 캔버스는 100% 채우기만 한다. 비율에서 높이를 파생하므로 왜곡·
// 레터박스가 원천적으로 없고 클릭 좌표 변환이 단순 비례로 성립한다.
export default function GameFrame({ children }: { children: ReactNode }) {
  return (
    <div className="relative aspect-video w-[calc(var(--frame-h)*16/9)]">
      {children}
    </div>
  );
}
