import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from '../cx';
import HudPanel from './HudPanel';

// 헤더 틀 - PC 레이아웃의 자원 바와 메뉴 버튼이 함께 쓰는 반투명 틀(HudPanel)과 크기의 단일 출처.
// 크기는 헤더 행이 단계(headerTier)마다 정한 변수를 읽는다. 자원 바는 높이 --hdr-bar-h(60px, 두 행 단계는 내용이 정함),
// square(메뉴 버튼)는 높이와 폭이 --hdr-menu(60px, 두 행 단계는 40px)다. 모바일 레이아웃은 MobileHeaderFrame을 쓴다.
// 변수는 헤더 행 안에서만 정해지므로 이 틀은 헤더 행 안에서만 쓴다.
//
// 60px: 이름 13px, 값 17px의 두 행 칸 실측 58px(내용 36 + 여백 18 + 테두리 4)를 4px 단위로 올림.
// 겹침은 레이아웃이 막는다: 자원 바와 메뉴 버튼이 같은 헤더 행의 형제라 폭이 모자라면 자원 바가 왼쪽으로 밀린다.
// 한 행이 들어가는 폭(계산상 추정, 화면 확인 대상): 다섯 칸의 가장 긴 값(골드, 명성 999.9K 약 84px, 배 이름 대양 트롤선 약 100px,
// 낚싯대 Lv.99 약 70px, 가방 게이지 88 + 간격 6 + 백분율 약 51 = 145px)과 칸 사이(간격 18 x 2 + 선 1) 4개 148px, 안쪽 여백 36px, 테두리 4px을 더해 약 670px다.
// 간격 축소 단계(칸 사이 8, 안쪽 12, 게이지 48)는 약 500px다.
export default function HeaderFrame({ as, square, className, children, ...rest }: {
  as?: 'div' | 'button';
  /** 폭도 높이와 같게 한다 */
  square?: boolean;
  className?: string;
  children?: ReactNode;
} & HTMLAttributes<HTMLElement>) {
  return (
    <HudPanel as={as} className={cx(square ? 'h-(--hdr-menu) w-(--hdr-menu)' : 'h-(--hdr-bar-h)', className)} {...rest}>
      {children}
    </HudPanel>
  );
}
