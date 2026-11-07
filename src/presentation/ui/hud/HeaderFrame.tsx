import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from '../cx';
import HudPanel from './HudPanel';

// 헤더 틀 - PC 레이아웃의 자원 바, 의뢰 현황, 메뉴 버튼이 함께 쓰는 반투명 틀(HudPanel)과 높이의 단일 출처.
// 높이는 60px로 늘 같다. square면 폭도 같아 정사각형(메뉴 버튼)이다. 모바일 레이아웃은 MobileHeaderFrame(40px)을 쓴다.
//
// 60px: 이름 13px, 값 17px의 두 행 칸 실측 58px(내용 36 + 여백 18 + 테두리 4)를 4px 단위로 올림.
// 가운데 묶음과 거점 시계 칩, 메뉴 버튼이 겹치지 않는지: 묶음의 가장 긴 값(골드, 명성 999.9K, 가방 2990 (99%), 일반 10, 네임드 3)은
// 약 585px다. 묶음은 스테이지 가운데에 놓이므로 오른쪽 끝은 W/2 + 292.5이고, 시계 칩 왼쪽은 W - 156(메뉴 버튼 60 + 가장자리 12 +
// 간격 6 + 시계 칩 약 78)이다. 겹치지 않으려면 W > 897이다. 지원 크기(PC 1280x720 이상) 기준 스테이지 폭은 1280에서 사이드바(384)를 뺀 896이라
// 맞닿는 한계(897)에 가깝다. 가장 긴 값 조합은 실제로는 드물고, 1280x720에서는 시계 칩과의 간격이 거의 없다(화면 확인 대상).
export default function HeaderFrame({ as, square, className, children, ...rest }: {
  as?: 'div' | 'button';
  /** 폭도 높이와 같게 한다 */
  square?: boolean;
  className?: string;
  children?: ReactNode;
} & HTMLAttributes<HTMLElement>) {
  return (
    <HudPanel as={as} className={cx('h-15', square && 'w-15', className)} {...rest}>
      {children}
    </HudPanel>
  );
}
