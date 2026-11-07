import { useCallback, useRef } from 'react';

// 생략 판정 - 렌더링 역할이 omittable인 글자가 지금 숨겨져 있는지 본다. 글자는 data-omittable 표식과 자리 부족 변형
// (예: 컨테이너 폭 변형의 hidden)을 달고, 이 훅의 ref를 받는다. 숨겨졌을 때만 Tip의 onlyIf로 툴팁을 연다.
// Tip을 wraps로 쓰면 거친 포인터(터치)의 누르기는 툴팁을 열지 않으므로, 누르면 동작이 실행되는 요소에도 쓸 수 있다.
export function useOmitted<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const isOmitted = useCallback(() => !!ref.current && getComputedStyle(ref.current).display === 'none', []);
  return { ref, isOmitted };
}
