import { useMediaQuery } from '../ui/useMediaQuery';

/** 모바일 배치 조건. 스타일의 `mobile:` 변형(index.css)과 같은 조건이다 */
export const MOBILE_QUERY = '(orientation: portrait) and (max-width: 599px)';

// 화면 조립이 PC 배치와 모바일 배치를 고르는 단일 판정. 화면 크기가 바뀌면 다시 판정한다.
export const useMobileLayout = (): boolean => useMediaQuery(MOBILE_QUERY);
