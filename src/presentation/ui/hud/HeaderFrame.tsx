import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from '../cx';
import HudPanel from './HudPanel';

// 헤더 틀 - PC 레이아웃의 자원 바와 메뉴 버튼이 함께 쓰는 반투명 틀(HudPanel)과 높이의 단일 출처.
// 높이는 60px로 늘 같다. square면 폭도 같아 정사각형(메뉴 버튼)이다. 모바일 레이아웃은 MobileHeaderFrame(40px)을 쓴다.
//
// 60px: 이름 13px, 값 17px의 두 행 칸 실측 58px(내용 36 + 여백 18 + 테두리 4)를 4px 단위로 올림.
// 가운데 묶음과 메뉴 버튼이 겹치지 않는지(계산상 추정, 화면 확인 대상): 다섯 칸의 가장 긴 값(골드, 명성 999.9K 약 84px, 배 이름 대양 트롤선 약 100px,
// 낚싯대 Lv.99 약 70px, 가방 게이지 88 + 간격 6 + 백분율 약 51 = 145px)과 칸 사이(간격 18 x 2 + 선 1) 4개 148px, 안쪽 여백 36px, 테두리 4px을 더해 약 670px다.
// 묶음은 스테이지 가운데에 놓이므로 오른쪽 끝은 W/2 + 335이고, 메뉴 버튼 왼쪽은 W - 72(메뉴 버튼 60 + 가장자리 12)이다.
// 겹치지 않으려면 W > 814이다. 지원 크기(PC 1280x720 이상) 기준 스테이지 폭은 1280에서 사이드바(384)를 뺀 896이라 80px 남짓 여유가 있다.
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
