import { useMediaQuery } from '../ui/useMediaQuery';

/** 모바일 레이아웃 판정 조건 - 뷰포트 폭이 768px(48rem) 미만이다. 방향 조건은 없다.
 *  스타일의 `mobile:` 변형(index.css)과 같은 조건이고, 값의 정본은 index.css의 --breakpoint-pc다(layoutBreakpoint.test가 일치를 검사한다).
 *  rem 단위라 브라우저 기본 글자 크기를 따르며 CSS와 같은 방식으로 계산된다. */
export const MOBILE_QUERY = '(width < 48rem)';

// 화면 조립이 PC 레이아웃과 모바일 레이아웃을 고르는 단일 판정. 뷰포트 폭이 바뀌면 다시 판정한다.
export const useMobileLayout = (): boolean => useMediaQuery(MOBILE_QUERY);
