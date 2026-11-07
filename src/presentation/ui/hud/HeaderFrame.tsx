import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from '../cx';
import HudPanel from './HudPanel';

// 헤더 틀 - 자원 바, 의뢰 현황, 메뉴 버튼이 함께 쓰는 반투명 틀(HudPanel)과 높이의 단일 출처.
// 높이는 스테이지 폭이 960px 미만이면 40px, 아니면 60px이다. square면 폭도 같아 정사각형(메뉴 버튼)이다.
// 헤더 요소의 크기 전환은 모두 같은 기준(스테이지 폭 960px 미만)이라 요소마다 같은 변형 값을 쓴다.
//
// 40px: 값 칸 한 줄 내용 13~16px(값 글자 13, 아이콘 12)에 테두리 4와 여백을 더해도 들어가는 높이이자, 누르는 틀(메뉴 버튼 정사각형)의 최소 크기.
// 60px: PC 글자 크기(값 16, 아이콘 24)의 한 줄 칸을 여유 있게 담는 높이로, 40px 단계의 1.5배.
// 360 폭(모바일 격자 한 행): 가장자리 4 + 자원 바 233 + 간격 4 + 의뢰 현황 71 + 간격 4 + 메뉴 버튼 40 + 가장자리 4 = 360.
//
// 960px: PC 글자 크기의 자원 바와 의뢰 현황 묶음은 가장 긴 값(골드, 명성 999.9K, 가방 472 (15%), 일반 10, 네임드 3 - 당시 두 행 칸 기준)에서
// 약 545px(화면 확인 실측), 가방이 네 자리이면 약 585px이다. 묶음은 스테이지 가운데에 놓이므로 오른쪽 끝은 W/2 + 585/2다.
// 거점의 시계 칩 왼쪽은 W - 156(메뉴 버튼 60 + 가장자리 12 + 간격 6 + 시계 칩 약 78)이다. 겹치지 않으려면
// W/2 + 292.5 < W - 156, 곧 W > 897이다. 960에서는 묶음 오른쪽 772.5, 시계 칩 왼쪽 804로 31px 여유가 남는다.
// 960 미만에서는 틀을 낮추고 간격을 줄여 묶음을 약 300px 안팎으로 만든다(추정).
export default function HeaderFrame({ as, square, className, children, ...rest }: {
  as?: 'div' | 'button';
  /** 폭도 높이와 같게 한다 */
  square?: boolean;
  className?: string;
  children?: ReactNode;
} & HTMLAttributes<HTMLElement>) {
  return (
    <HudPanel as={as} className={cx('h-15 @max-[960px]:h-10', square && 'w-15 @max-[960px]:w-10', className)} {...rest}>
      {children}
    </HudPanel>
  );
}
